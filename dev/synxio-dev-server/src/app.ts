import { Effect, pipe, Schema, Option, Fiber, Array } from "effect";
import {
  Component,
  type GetComponentTreeType,
  State,
  Endpoint,
  Api,
  GetAppType,
} from "@repo/core";

const messageEndpoint = Endpoint.make(Schema.Struct({ name: Schema.String }));

const ChatMessage = Component.setup("ChatMessage", {
  endpoints: { message: messageEndpoint },
  state: { isLoading: State.make<boolean>(() => false) },
  components: {},
}).build(({ endpoints, state }, payload: { index: number }) =>
  Effect.gen(function* () {
    console.log("TEST");

    const { name } = yield* pipe(
      endpoints.message(`message-${payload.index}`),
      Effect.andThen(({ value }) => value)
    );

    console.log("NAME", name);

    if (name === "quit") {
      return Option.none<{ name: string; age: number }>();
    }

    console.log("NAME", name);

    yield* State.update(state.isLoading, true);

    const age = yield* Api.io(
      `age-${name}`,
      Effect.tryPromise(async () => {
        const req = await fetch(`https://api.agify.io?name=${name}`);
        const json = await req.json();
        return json.age as number;
      }).pipe(Effect.catchTag("UnknownException", () => Effect.succeed(0)))
    );

    yield* State.update(state.isLoading, false);

    return Option.some({ name, age });
  })
);

const ChatMessageResult = Component.setup("ChatMessageResult", {
  endpoints: {},
  state: {},
  components: {},
}).build((_api, payload: { name: string; age: number }) =>
  Effect.sync(() => {
    console.log("CHAT MESSAGE RESULT IN COMPONENT", payload);
    return payload;
  })
);

const ChatSetup = Component.setup("Chat", {
  endpoints: {},
  state: { names: State.make<{ name: string; age: number }[]>(() => []) },
  components: {
    ChatMessage,
    ChatMessageResult: ChatMessageResult.List,
  },
});

export const Chat = ChatSetup.build(
  ({ components, state }, payload: { foo: string }) =>
    Effect.gen(function* () {
      let messageIndex = 0;

      while (true) {
        console.log("---------------------------");
        const currentMessageIndex = messageIndex++;

        const chatMessage = yield* components
          .ChatMessage({
            index: currentMessageIndex,
          })
          .pipe(Effect.andThen(Fiber.join), Effect.andThen(Option.getOrNull));

        console.log("VALUE", chatMessage);

        if (!chatMessage) {
          break;
        }

        const chatMessageResult = yield* components
          .ChatMessageResult(messageIndex, chatMessage)
          .pipe(Effect.andThen(Fiber.join));

        console.log("CHAT MESSAGE RESULT", chatMessageResult);

        yield* State.update(state.names, (names) =>
          Array.append(names, chatMessage)
        );
      }

      console.log("NAMES AND AGES", yield* State.get(state.names));

      return "hello";
    })
);

export type App = GetAppType<typeof Chat>;
