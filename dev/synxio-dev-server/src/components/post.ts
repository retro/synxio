import { Effect, Schema, Runtime, Fiber, Array } from "effect";
import {
  Component,
  State,
  Endpoint,
  Api,
  ComponentContext,
  AppContext,
} from "@repo/core";
import { z } from "zod";
import { CoreMessage, streamText, tool } from "ai";
import { openai } from "../lib.js";

type SocialMediaSite = "twitter" | "facebook" | "instagram";

function getSystemPrompt(site: string) {
  return `\
You are a helpful social media post generator. Your task is to generate a social media post for the given key points. The post should be compelling and engaging, and should follow the platform's guidelines and best practices.
          
You will be writing the post for ${site}`.trim();
}

function getInitialUserMessage({
  site,
  keyPoints,
}: {
  site: string;
  keyPoints: string[];
}) {
  const content = `\
Write a ${site} post for the following key points:

 ${keyPoints.map((k) => `- ${k}`).join("\n")}
`.trim();

  return {
    role: "user" as const,
    content,
  };
}

const SocialMediaPostResponse = z.object({
  reasoning: z.string().describe("Explain the reasoning behind the post"),
  content: z.string().describe("The content of the post"),
});

type SocialMediaPostResponse = z.infer<typeof SocialMediaPostResponse>;

const socialMediaPostTool = tool({
  description: "Generate a social media post for the given key points",
  parameters: SocialMediaPostResponse,
  execute: async () => {
    return "Posts is shown to the user, and is awaiting feedback or approval";
  },
});

function getPost({
  site,
  messages,
  forceTool,
}: {
  site: SocialMediaSite;
  messages: CoreMessage[];
  forceTool?: boolean;
}) {
  return Effect.gen(function* () {
    const { state } = yield* ChatMessageSetup.Api;
    const runSync = Runtime.runSync(
      yield* Effect.runtime<ComponentContext | AppContext>()
    );

    return yield* Effect.tryPromise(async () => {
      const result = streamText({
        model: openai("gpt-4o"),
        temperature: 0.5,
        system: getSystemPrompt(site),
        messages,
        tools: {
          socialMediaPost: socialMediaPostTool,
        },
        toolChoice: forceTool
          ? { type: "tool", toolName: "socialMediaPost" }
          : "auto",
      });

      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          runSync(
            State.update(state.assistantMessage, (assistantMessage) =>
              assistantMessage
                ? `${assistantMessage}${part.textDelta}`
                : part.textDelta
            )
          );
        } else if (
          part.type === "tool-call" &&
          part.toolName === "socialMediaPost"
        ) {
          runSync(State.update(state.post, part.args));
        }
      }

      return {
        assistantMessage: runSync(State.get(state.assistantMessage)),
        post: runSync(State.get(state.post)),
        messages: (await result.response).messages,
      };
    });
  });
}

const ChatMessageSetup = Component.setup("ChatMessage", {
  endpoints: {},
  state: {
    userMessage: State.make<string | null>(() => null),
    assistantMessage: State.make<string | null>(() => null),
    post: State.make<SocialMediaPostResponse | null>(() => null),
  },
  components: {},
});

const ChatMessage = ChatMessageSetup.build(
  (
    { state },
    payload: {
      site: SocialMediaSite;
      userMessage: string;
      messages: CoreMessage[];
      forceTool?: boolean;
    }
  ) =>
    Effect.gen(function* () {
      yield* State.update(state.userMessage, payload.userMessage);
      const { assistantMessage, post, messages } = yield* Api.io(
        `chat-message`,
        getPost(payload)
      );
      yield* State.update(state.assistantMessage, assistantMessage);
      yield* State.update(state.post, post);
      return {
        messages,
        post,
      };
    })
);

const PostSetup = Component.setup("Post", {
  endpoints: {
    message: Endpoint.make(
      Schema.Struct({
        kind: Schema.Literal("message"),
        content: Schema.String,
      })
    ),
    approval: Endpoint.make(
      Schema.Struct({
        kind: Schema.Literal("approval"),
        content: Schema.String,
      })
    ),
  },
  state: {
    isLoading: State.make<boolean>(() => false),
    postCandidates: State.make<string[]>(() => []),
    approvedPost: State.make<string | null>(() => null),
  },
  components: { ChatMessages: ChatMessage.List },
});

export const Post = PostSetup.build(
  (
    { state, endpoints, components },
    payload: { site: SocialMediaSite; keyPoints: string[] }
  ) =>
    Effect.gen(function* () {
      // Define the messages to send to the OpenAI API. We don't need to store them
      // in the DB, IO is durable, and messages can be recomputed as needed
      yield* State.update(state.isLoading, true);
      const initialUserMessage = getInitialUserMessage(payload);
      const messages: CoreMessage[] = [initialUserMessage];

      const { post: initialPost, messages: initialMessages } = yield* components
        .ChatMessages(`chat-message-${messages.length}`, {
          site: payload.site,
          messages,
          forceTool: true,
          userMessage: initialUserMessage.content,
        })
        .pipe(Effect.andThen(Fiber.join));

      messages.push(...initialMessages);

      if (initialPost) {
        yield* State.update(state.postCandidates, (postCandidates) =>
          Array.append(postCandidates, initialPost.content)
        );
      }

      yield* State.update(state.isLoading, false);

      while (true) {
        const idx = messages.length;
        const message = yield* endpoints.message(`message-${idx}`);
        const approval = yield* endpoints.approval(`approval-${idx}`);

        const result = yield* Effect.race(message.value, approval.value);

        if (result.kind === "approval") {
          yield* State.update(state.approvedPost, result.content);
          return { site: payload.site, post: result.content };
        }

        messages.push({ role: "user", content: result.content });

        const { post: newPost, messages: newMessages } = yield* components
          .ChatMessages(`chat-message-${messages.length}`, {
            site: payload.site,
            messages,
            userMessage: result.content,
          })
          .pipe(Effect.andThen(Fiber.join));

        messages.push(...newMessages);

        if (newPost) {
          yield* State.update(state.postCandidates, (postCandidates) =>
            Array.append(postCandidates, newPost.content)
          );
        }
      }
    })
);
