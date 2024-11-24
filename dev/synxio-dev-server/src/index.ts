import { Effect, pipe, Stream, Runtime as EffectRuntime, Ref } from "effect";
import { Runtime, type RuntimeContextState } from "@repo/core";
import * as jsondiffpatch from "jsondiffpatch";
import * as jsonPatchFormatter from "jsondiffpatch/formatters/jsonpatch";
import express from "express";
import http from "http";
import * as ptr from "path-to-regexp";
import { WebSocketServer, WebSocket } from "ws";
import { Chat } from "./app.js";
import cors from "cors";

function makeChangesStreamPatcher() {
  let lastValue: null | RuntimeContextState["components"] = null;
  const jsondiffpatchInstance = jsondiffpatch.create({
    arrays: {
      detectMove: true,
    },
  });
  return (value: RuntimeContextState) => {
    const components = value.components;
    if (components === lastValue) {
      return { value, patch: null };
    }
    const patch = jsondiffpatchInstance.diff(lastValue, components);
    const formattedPatch = jsonPatchFormatter.format(patch, lastValue);
    lastValue = components;
    return { value, patch: formattedPatch };
  };
}

function wsMessage(type: "state" | "patch", value: unknown) {
  return JSON.stringify({ type, value });
}

const program = Effect.gen(function* () {
  const semaphore = yield* Effect.makeSemaphore(1);
  const state = yield* Ref.make<null | RuntimeContextState["components"]>(null);
  const websockets = new Set<WebSocket>();

  const streamPatcher = makeChangesStreamPatcher();
  const { run, context } = yield* Runtime.build(Chat).initialize({
    foo: "bar",
  });

  yield* Effect.forkDaemon(run);

  yield* Effect.forkDaemon(
    pipe(
      context.state.changes,
      Stream.debounce(10),
      Stream.map(streamPatcher),
      Stream.runForEach(({ value, patch }) =>
        semaphore.withPermits(1)(
          Effect.gen(function* () {
            yield* Ref.set(state, value["components"]);
            if (patch) {
              for (const ws of websockets) {
                ws.send(wsMessage("patch", patch));
              }
            }
          })
        )
      )
    )
  );

  const runPromise = EffectRuntime.runPromise(yield* Effect.runtime());
  const runSync = EffectRuntime.runSync(yield* Effect.runtime());

  const app = express();
  app.use(express.json());
  app.use(cors());

  app.post("/api/endpoints/:id", (req, res) => {
    const id = req.params.id;
    const value = req.body;
    runPromise(
      Effect.gen(function* () {
        const endpoint = yield* context.getEndpointCallback(id);
        if (endpoint) {
          yield* endpoint(value);
          return res.send("ok");
        }
        res.status(404);
        return res.send("Endpoint not found");
      })
    );
  });

  const server = http.createServer(app);
  const socketPathMatcher = ptr.match("/api/ws");
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws) => {
    runSync(
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          console.log("AAA");
          const currentState = yield* Ref.get(state);
          if (currentState) {
            ws.send(wsMessage("state", currentState));
          }
          websockets.add(ws);
          ws.on("close", () => {
            websockets.delete(ws);
          });
        })
      )
    );
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url!, "wss://base.url");
    const match = socketPathMatcher(pathname);
    if (match) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(3000, () => {
    console.log("Server listening on port 3000!");
  });
});

Effect.runPromise(program).then(
  (value) => console.log(value),
  (error) => console.error(error)
);
