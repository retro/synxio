import { Effect } from "effect";
import {
  CallEndpointResult,
  App,
  StateUpdate,
  GetAppRootComponent,
  AnyApp,
  GetAppAuthorizerUserPayload,
} from "@repo/core";
import express from "express";
import http from "http";
import * as ptr from "path-to-regexp";
import { WebSocketServer } from "ws";
import { SocialMediaGenerator } from "./app.js";
import cors from "cors";
import { randomUUID } from "crypto";
import { z } from "zod";

type ServableAppInitializeOrResumeResult = {
  callEndpoint: (
    userAuthPayload: any,
    id: string,
    payload: any
  ) => Promise<CallEndpointResult>;
  subscribe: (
    userAuthPayload: any,
    cb: (stateUpdate: StateUpdate) => void
  ) => Promise<() => void>;
};

type ServableApp = {
  initialize: (
    appId: string,
    payload: any
  ) => Effect.Effect<ServableAppInitializeOrResumeResult>;
  resume: (appId: string) => Effect.Effect<ServableAppInitializeOrResumeResult>;
};

class AppServer<TApp extends ServableApp, TAppAuthorizerUserPayload> {
  static make<TApp extends AnyApp & ServableApp>(app: TApp) {
    return new AppServer<TApp, GetAppAuthorizerUserPayload<TApp>>(app);
  }

  private readonly apps: Map<string, ServableAppInitializeOrResumeResult> =
    new Map();

  constructor(private readonly app: TApp) {}

  private async getApp(appId: string) {
    const app = this.apps.get(appId);
    if (app) {
      return app;
    }

    const resumedApp = await Effect.runPromise(this.app.resume(appId));
    this.apps.set(appId, resumedApp);
    return resumedApp;
  }

  async initialize(
    appId: string,
    payload: Parameters<GetAppRootComponent<TApp>["mount"]>[0]
  ) {
    const app = await Effect.runPromise(this.app.initialize(appId, payload));
    this.apps.set(appId, app);
    return app;
  }

  async callEndpoint(
    appId: string,
    userAuthPayload: TAppAuthorizerUserPayload,
    id: string,
    payload: unknown
  ) {
    const app = await this.getApp(appId);
    return await app.callEndpoint(userAuthPayload, id, payload);
  }
  async subscribe(
    appId: string,
    userAuthPayload: TAppAuthorizerUserPayload,
    cb: (stateUpdate: StateUpdate) => void
  ) {
    const app = await this.getApp(appId);
    return await app.subscribe(userAuthPayload, cb);
  }
}

const appServer = AppServer.make(
  App.build(
    SocialMediaGenerator,
    (
      userPayload:
        | "editor"
        | "facebookEditor"
        | "instagramEditor"
        | "twitterEditor",
      component
    ) =>
      Effect.gen(function* () {
        switch (component.name) {
          case "Post": {
            console.log(userPayload, component);
            return (
              userPayload === "editor" ||
              (userPayload === "facebookEditor" &&
                component.payload.site === "facebook") ||
              (userPayload === "instagramEditor" &&
                component.payload.site === "instagram") ||
              (userPayload === "twitterEditor" &&
                component.payload.site === "twitter")
            );
          }
          default:
            return true;
        }
      })
  )
);

const UserAuthSchema = z.union([
  z.literal("editor"),
  z.literal("twitterEditor"),
  z.literal("instagramEditor"),
  z.literal("facebookEditor"),
]);

const app = express();
app.use(express.json());
app.use(cors());

app.post("/api/initialize", async (req, res) => {
  const payload = req.body;
  const appId = randomUUID();

  await appServer.initialize(appId, payload);

  res.json({
    appId,
  });
});

app.post("/api/:appId/endpoints/:id", async (req, res) => {
  const { id, appId } = req.params;
  const value = req.body;
  const userPayload = UserAuthSchema.parse(req.query.token);
  const result = await appServer.callEndpoint(appId, userPayload, id, value);
  if (result.type === "success") {
    res.send("ok");
  } else {
    res.status(400);
    res.send(result.error);
  }
});

const server = http.createServer(app);
const socketPathMatcher = ptr.match("/api/:appId/ws");
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const { pathname, searchParams } = new URL(req.url!, "wss://base.url");
  const userPayload = UserAuthSchema.parse(searchParams.get("token"));

  const match = socketPathMatcher(pathname);
  const appId = match ? match?.params.appId : null;
  if (typeof appId === "string") {
    wss.handleUpgrade(req, socket, head, async (ws) => {
      const unsubscribe = await appServer.subscribe(
        appId,
        userPayload,
        (stateUpdate) => {
          ws.send(JSON.stringify(stateUpdate));
        }
      );
      ws.on("close", () => {
        unsubscribe();
      });

      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(3000, () => {
  console.log("Server listening on port 3000!");
});
