import { Effect, pipe, Runtime } from "effect";
import {
  Component,
  State,
  Api,
  ComponentContext,
  AppContext,
} from "@repo/core";
import { z } from "zod";
import { streamObject } from "ai";
import { openai } from "../lib.js";

// Generates key points from an article

function getKeyPoints(article: string) {
  return Effect.gen(function* () {
    const { state } = yield* KeyPointsSetup.Api;
    const runSync = Runtime.runSync(
      yield* Effect.runtime<ComponentContext | AppContext>()
    );

    return yield* Effect.tryPromise(async () => {
      const result = streamObject({
        model: openai("gpt-4o-2024-08-06"),
        output: "array",
        schema: z.string(),
        schemaName: "keyPoints",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates key points from an article.",
          },
          {
            role: "user",
            content: `\
Write a list of key points from the following article

> ${article}
`,
          },
        ],
      });

      for await (const keyPoint of result.elementStream) {
        runSync(
          State.update(state.keyPoints, (current) => [...current, keyPoint])
        );
      }

      return runSync(State.get(state.keyPoints));
    });
  });
}

const KeyPointsSetup = Component.setup("KeyPoints", {
  endpoints: {},
  state: { keyPoints: State.make<string[]>(() => []) },
  components: {},
});

export const KeyPoints = KeyPointsSetup.build(
  ({ state }, payload: { article: string }) =>
    Effect.gen(function* () {
      let run = 0;
      // Retry 5 times
      while (run < 5) {
        // Call the OpenAI API with the article and get the key points
        const keyPoints = yield* Api.io(
          "key-points",
          pipe(
            getKeyPoints(payload.article),
            Effect.catchTag("UnknownException", () => Effect.succeed(null))
          )
        );

        yield* State.update(state.keyPoints, keyPoints ?? []);

        if (keyPoints) {
          return keyPoints;
        }

        run++;
      }
    })
);
