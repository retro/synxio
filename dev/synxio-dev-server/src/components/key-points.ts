import { Effect, Stream, Array } from "effect";
import { Component, State, Api } from "@repo/core";
import { z } from "zod";
import { streamObject } from "ai";
import { openai } from "../lib.js";

function getInitialUserMessage(article: string) {
  return `\
Write a list of key points and interesting facts from the following article.

> ${article}
`;
}

// Generates key points from an article

function getKeyPoints(article: string) {
  return Api.IO.withEventStream<string>().make(
    "key-points",
    ({ unsafeEmitEvent }) =>
      Effect.tryPromise(async () => {
        const result = streamObject({
          model: openai("gpt-4o-2024-08-06"),
          output: "array",
          schema: z.string(),
          schemaName: "keyPoints",
          system:
            "You are a helpful assistant that generates key points from an article. These will be used to generate a post for the social media platform so make sure they are interesting and relevant to the post.",
          messages: [
            {
              role: "user",
              content: getInitialUserMessage(article),
            },
          ],
        });

        for await (const keyPoint of result.elementStream) {
          unsafeEmitEvent(keyPoint);
        }
      })
  );
}

const KeyPointsSetup = Component.setup("KeyPoints", {
  endpoints: {},
  state: { keyPoints: State.make<string[]>(() => []) },
  components: {},
});

export const KeyPoints = KeyPointsSetup.build(
  ({ state }, payload: { article: string }) =>
    Effect.gen(function* () {
      const { eventStream } = yield* getKeyPoints(payload.article);

      yield* Stream.runForEach(eventStream, (value) =>
        State.update(state.keyPoints, (current) => Array.append(current, value))
      );

      return yield* State.get(state.keyPoints);
    })
);
