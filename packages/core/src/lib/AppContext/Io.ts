import {
  Effect,
  pipe,
  Option,
  Runtime,
  Queue,
  Stream,
  Exit,
  Fiber,
  Chunk,
} from "effect";
import { AppContextPersistence } from "./Persistence.js";

export type IOLazyEffect<A, E, R, T> = [T] extends [never]
  ? () => Effect.Effect<A, E, R>
  : (props: {
      unsafeEmitEvent: (value: T) => boolean;
      emitEvent: (value: T) => Effect.Effect<boolean>;
    }) => Effect.Effect<A, E, R>;

export class AppContextIo {
  constructor(readonly persistence: AppContextPersistence) {}
  run<A, E, R>(id: string, eff: Effect.Effect<A, E, R>) {
    return Effect.gen(this, function* () {
      return yield* pipe(
        this.persistence.get(id),
        Effect.flatMap((value) =>
          pipe(
            value,
            Option.match({
              onSome: (value) => Effect.succeed(value as A),
              onNone: () =>
                Effect.gen(this, function* () {
                  const value = yield* eff as Effect.Effect<A, E, R>;
                  yield* this.persistence.set({
                    type: "data",
                    id,
                    payload: value,
                  });
                  return value;
                }),
            })
          )
        )
      );
    });
  }
  runWithoutEventStream<A, E, R>(
    id: string,
    lazyEffect: IOLazyEffect<A, E, R, never>
  ) {
    return Effect.gen(this, function* () {
      const persisted = yield* this.persistence.get(id);

      return yield* Option.match(persisted, {
        onSome: (value) => Effect.succeed(value.payload as A),
        onNone: () =>
          Effect.gen(this, function* () {
            const value = yield* pipe(
              lazyEffect(),
              Effect.onExit((exit) => this.persist(id, exit))
            );

            return value;
          }),
      });
    });
  }
  runWithEventStream<T, A, E, R>(
    id: string,
    lazyEffect: IOLazyEffect<A, E, R, T>
  ) {
    return Effect.gen(this, function* () {
      const streamId = `${id}:stream`;
      const persisted = yield* this.persistence.get(id);
      return yield* Option.match(persisted, {
        onSome: (value) =>
          Effect.gen(this, function* () {
            const eventStream = yield* pipe(
              this.persistence.getPersistedQueue<Chunk.Chunk<T>>(streamId),
              Effect.map(Stream.fromQueue),
              Effect.map(Stream.flattenChunks)
            );

            yield* this.persistence.resumeStreamData(id);

            return {
              value: Fiber.succeed(value.payload as A),
              eventStream,
            };
          }),
        onNone: () =>
          Effect.gen(this, function* () {
            let eventCounter = 0;

            const eventQueue = yield* Queue.unbounded<T>();
            const eventStream = pipe(
              Stream.fromQueue(eventQueue),
              Stream.tap((value) =>
                Effect.gen(this, function* () {
                  const eventId = `${streamId}[${eventCounter}]`;
                  yield* this.persistence.set({
                    type: "streamData",
                    id: eventId,
                    parentId: streamId,
                    payload: value,
                  });
                  eventCounter++;
                })
              )
            );

            const runSync = Runtime.runSync(yield* Effect.runtime());

            const value = yield* pipe(
              lazyEffect({
                emitEvent: (value: T) => Queue.offer(eventQueue, value),
                unsafeEmitEvent: (value: T) =>
                  runSync(Queue.offer(eventQueue, value)),
              }),
              Effect.onExit((exit) =>
                Effect.gen(this, function* () {
                  while (!(yield* Queue.isEmpty(eventQueue))) {
                    yield* Effect.yieldNow();
                  }
                  yield* Queue.shutdown(eventQueue);
                  yield* Effect.yieldNow();
                  yield* this.persistence.set({
                    type: "streamDone",
                    id: streamId,
                  });
                  yield* this.persist(id, exit);
                })
              ),
              Effect.fork
            );

            return {
              value,
              eventStream,
            };
          }),
      });
    });
  }
  private persist<A, E>(id: string, exit: Exit.Exit<A, E>) {
    return Exit.match(exit, {
      onSuccess: (data) =>
        this.persistence.set({
          type: "data",
          id,
          payload: data,
        }),
      onFailure: (error) =>
        this.persistence.set({
          type: "error",
          id,
          payload: error,
        }),
    });
  }
}
