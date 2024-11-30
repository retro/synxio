import { Effect, pipe, Schema, Fiber, Array, Runtime } from "effect";
import {
  Component,
  State,
  Endpoint,
  Api,
  type GetAppType,
  ComponentContext,
} from "@repo/core";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { CoreMessage, streamObject } from "ai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORGANIZATION,
  compatibility: "strict",
});

const PostSetup = Component.setup("Post", {
  endpoints: {
    message: Endpoint.make(
      Schema.Struct({
        kind: Schema.Literal("message"),
        content: Schema.String,
      })
    ),
    approval: Endpoint.make(
      Schema.Struct({ kind: Schema.Literal("approval") })
    ),
  },
  state: {
    post: State.make<string | null>(() => null),
    isLoading: State.make<boolean>(() => false),
  },
  components: {},
});

const Post = PostSetup.build(
  (
    { state, endpoints },
    payload: { site: "instagram" | "facebook" | "twitter"; keyPoints: string[] }
  ) =>
    Effect.gen(function* () {
      // Define the messages to send to the OpenAI API. We don't need to store them
      // in the DB, IO is durable, and messages can be recomputed as needed
      const messages: CoreMessage[] = [
        {
          role: "system",
          content: `You are a helpful social media post generator. Your task is to generate a social media post for the given key points. The post should be compelling and engaging, and should follow the platform's guidelines and best practices.
          
          You will be writing the post for ${payload.site}`,
        },
        {
          role: "user",
          content: `\
Write a ${payload.site} post for the following key points:

 ${payload.keyPoints.map((k) => `- ${k}`).join("\n")}
`,
        },
      ];

      let idx = 0;

      // Chat loop
      while (true) {
        // Show loading indicator, state is streamed to the frontend
        yield* State.update(state.isLoading, true);
        yield* State.update(state.post, null);

        // Call the OpenAI API with the current messages and get the new post
        const value = yield* Api.io(
          `post-${idx}`,
          pipe(
            getPost(messages),
            Effect.catchTag("UnknownException", () => Effect.succeed(null))
          )
        );

        yield* State.update(state.isLoading, false);

        if (!value) {
          break;
        }

        messages.push({
          role: "assistant",
          content: value,
        });

        yield* State.update(state.post, value);

        // Open two endpoints - one for the user to send a message, and one for
        // the user approval
        const message = yield* endpoints.message(`message-${idx}`);
        const approval = yield* endpoints.approval(`approval-${idx}`);

        // Wait for either message or approval to complete
        const result = yield* Effect.race(message.value, approval.value);

        // If the user approved the post, return the post
        if (result.kind === "approval") {
          return { site: payload.site, post: value };
        }

        // Push the user's message to the messages array and continue
        // the chat loop
        messages.push({ role: "user", content: result.content });

        idx++;
      }
    })
);

function getPost(messages: CoreMessage[]) {
  return Effect.gen(function* () {
    const { state } = yield* PostSetup.Api;
    const runSync = Runtime.runFork(yield* Effect.runtime<ComponentContext>());

    return yield* Effect.tryPromise(async () => {
      const result = streamObject({
        model: openai("gpt-4o-2024-08-06"),
        temperature: 0.5,
        schema: z.object({
          reasoning: z
            .string()
            .describe("Explain the reasoning behind the post"),
          content: z.string().describe("The content of the post"),
        }),
        schemaName: "post",
        messages,
      });

      let content = "";

      for await (const partialPost of result.partialObjectStream) {
        if (partialPost.content) {
          content = partialPost.content;
          runSync(State.update(state.post, content));
        }
      }

      return content;
    });
  });
}

// Generates key points from an article

const KeyPointsSetup = Component.setup("KeyPoints", {
  endpoints: {},
  state: { keyPoints: State.make<string[]>(() => []) },
  components: {},
});

const KeyPoints = KeyPointsSetup.build(
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

function getKeyPoints(article: string) {
  return Effect.gen(function* () {
    const { state } = yield* KeyPointsSetup.Api;
    const runSync = Runtime.runFork(yield* Effect.runtime<ComponentContext>());

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

      const keyPoints: string[] = [];

      for await (const keyPoint of result.elementStream) {
        keyPoints.push(keyPoint);
        runSync(
          State.update(state.keyPoints, (current) => [...current, keyPoint])
        );
      }

      return keyPoints;
    });
  });
}

/* Root component

- Gets the article from the user
- Generates key points from the article
- Spawns a component for each social media platform

*/

const SocialMediaGeneratorSetup = Component.setup("SocialMediaGenerator", {
  // Endpoints allow us to communicate with the outside world
  endpoints: {},
  // State is streamed to the frontend
  state: {
    keyPoints: State.make<string[]>(() => []),
    article: State.make<string | null>(() => null),
  },
  components: {
    KeyPoints,
    InstagramPost: Post,
    FacebookPost: Post,
    TwitterPost: Post,
  },
});

export const SocialMediaGenerator = SocialMediaGeneratorSetup.build(
  (
    { components, state },
    payload: {
      article: string;
      twitter: boolean;
      facebook: boolean;
      instagram: boolean;
    }
  ) =>
    Effect.gen(function* () {
      yield* State.update(state.article, payload.article);

      // Generate key points from the article
      const keyPoints = yield* components
        .KeyPoints({
          article: payload.article,
        })
        .pipe(Effect.andThen(Fiber.join));

      if (!keyPoints) {
        return;
      }

      yield* State.update(state.keyPoints, () => keyPoints);

      // Spawn components for each selected social media platform
      const postComponents = pipe(
        [
          payload.twitter
            ? yield* components.TwitterPost({
                site: "twitter",
                keyPoints,
              })
            : null,
          payload.facebook
            ? yield* components.FacebookPost({
                site: "facebook",
                keyPoints,
              })
            : null,
          payload.instagram
            ? yield* components.InstagramPost({
                site: "instagram",
                keyPoints,
              })
            : null,
        ],
        Array.filter((component) => component !== null)
      );

      // Wait for all components to complete - workflow is done
      // You could call an API here to send the posts to your backend
      console.log("TU SAM");
      const posts = yield* Fiber.joinAll(postComponents);
      console.log(posts);
    })
);

export type App = GetAppType<typeof SocialMediaGenerator>;
