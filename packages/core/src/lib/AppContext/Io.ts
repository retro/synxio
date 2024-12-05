import {
  Effect,
  pipe,
  Option,
  Runtime,
  Queue,
  Stream,
  Exit,
  Fiber,
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
                    data: value,
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
        onSome: (value: A) => Effect.succeed(value),
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
      const persisted = yield* this.persistence.get(id);
      return yield* Option.match(persisted, {
        onSome: (value: A) =>
          Effect.succeed({
            value: Fiber.succeed(value),
            eventStream: Stream.fromIterable<T>([]),
          }),
        onNone: () =>
          Effect.gen(this, function* () {
            const runSync = Runtime.runSync(yield* Effect.runtime());
            const emitQueue = yield* Queue.unbounded<T>();
            const eventStream = pipe(
              Stream.fromQueue(emitQueue, { shutdown: true }),
              Stream.tap((value) =>
                Effect.succeed(console.log("EMITTED", value))
              )
            );

            const value = yield* pipe(
              lazyEffect({
                emitEvent: (value: T) => Queue.offer(emitQueue, value),
                unsafeEmitEvent: (value: T) =>
                  runSync(Queue.offer(emitQueue, value)),
              }),
              Effect.onExit((exit) =>
                Effect.gen(this, function* () {
                  yield* Queue.shutdown(emitQueue);
                  yield* Effect.yieldNow();
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
          data,
        }),
      onFailure: (error) =>
        this.persistence.set({
          type: "error",
          id,
          error,
        }),
    });
  }
}
