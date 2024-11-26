import { Effect, pipe, Schema, Fiber, Array } from "effect";
import { Component, State, Endpoint, Api, type GetAppType } from "@repo/core";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { z } from "zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORGANIZATION,
});

const Post = Component.setup("Post", {
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
    messages: State.make<OpenAI.ChatCompletionMessageParam[]>(() => []),
    post: State.make<string | null>(() => null),
    isLoading: State.make<boolean>(() => false),
  },
  components: {},
}).build(
  (
    { state, endpoints },
    payload: { site: "instagram" | "facebook" | "twitter"; keyPoints: string[] }
  ) =>
    Effect.gen(function* () {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
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

      while (true) {
        yield* State.update(state.isLoading, true);

        const completion = yield* Api.io(
          `post-${idx}`,
          pipe(
            getPost(messages),
            Effect.catchTag("UnknownException", () => Effect.succeed(null))
          )
        );

        yield* State.update(state.isLoading, false);

        const value = completion?.choices[0]?.message?.parsed;

        if (!value) {
          break;
        }

        messages.push({
          role: "assistant",
          content: value.content,
        });

        yield* State.update(state.messages, [...messages]);
        yield* State.update(state.post, value.content);

        const message = yield* endpoints.message(`message-${idx}`);
        const approval = yield* endpoints.approval(`approval-${idx}`);

        const result = yield* Effect.race(message.value, approval.value);

        if (result.kind === "approval") {
          return { site: payload.site, post: value.content };
        }

        messages.push({ role: "user", content: result.content });

        yield* State.update(state.messages, [...messages]);

        idx++;
      }
    })
);

function getPost(messages: OpenAI.ChatCompletionMessageParam[]) {
  return Effect.tryPromise(async () => {
    return await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages,
      temperature: 0.5,
      response_format: zodResponseFormat(
        z.object({
          reasoning: z
            .string()
            .describe("Explain the reasoning behind the post"),
          content: z.string().describe("The content of the post"),
        }),
        "post"
      ),
    });
  });
}

// Generates key points from an article

const KeyPoints = Component.setup("KeyPoints", {
  endpoints: {},
  state: {},
  components: {},
}).build((_api, payload: { article: string }) =>
  Effect.gen(function* () {
    let run = 0;
    while (run < 5) {
      const completion = yield* Api.io(
        "key-points",
        pipe(
          getKeyPoints(payload.article),
          Effect.catchTag("UnknownException", () => Effect.succeed(null))
        )
      );

      const keyPoints = completion?.choices[0]?.message?.parsed;

      if (keyPoints) {
        return keyPoints;
      }

      run++;
    }
  })
);

function getKeyPoints(article: string) {
  return Effect.tryPromise(async () => {
    return await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
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
      response_format: zodResponseFormat(
        z.object({ keyPoints: z.array(z.string()) }),
        "keyPoints"
      ),
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
  endpoints: {
    initialPayload: Endpoint.make(
      Schema.Struct({
        article: Schema.String,
        twitter: Schema.Boolean,
        facebook: Schema.Boolean,
        instagram: Schema.Boolean,
      })
    ),
  },
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
  ({ components, state, endpoints }, _payload: {}) =>
    Effect.gen(function* () {
      const initialPayload = yield* endpoints
        .initialPayload("initialPayload")
        .pipe(Effect.andThen(({ value }) => value));

      yield* State.update(state.article, initialPayload.article);

      const keyPointsResponse = yield* components
        .KeyPoints({
          article: initialPayload.article,
        })
        .pipe(Effect.andThen(Fiber.join));

      if (!keyPointsResponse) {
        return;
      }

      yield* State.update(state.keyPoints, () => keyPointsResponse.keyPoints);

      const postComponents = pipe(
        [
          initialPayload.twitter
            ? yield* components.TwitterPost({
                site: "twitter",
                keyPoints: keyPointsResponse.keyPoints,
              })
            : null,
          initialPayload.facebook
            ? yield* components.FacebookPost({
                site: "facebook",
                keyPoints: keyPointsResponse.keyPoints,
              })
            : null,
          initialPayload.instagram
            ? yield* components.InstagramPost({
                site: "instagram",
                keyPoints: keyPointsResponse.keyPoints,
              })
            : null,
        ],
        Array.filter((component) => component !== null)
      );

      const posts = yield* Fiber.joinAll(postComponents);
    })
);

export type App = GetAppType<typeof SocialMediaGenerator>;
