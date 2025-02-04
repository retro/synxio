import { Effect } from "effect";
import { ComponentContext } from "./ComponentContext.js";
import { IOLazyEffect } from "./AppContext/Io.js";

function makeWithoutEventStream<A, E, R>(
  key: string,
  lazyEffect: IOLazyEffect<A, E, R, never>
) {
  return Effect.gen(function* () {
    const componentContextService = yield* ComponentContext;
    return yield* componentContextService.ioWithoutEventStream<A, E, R>(
      key,
      lazyEffect
    );
  });
}

function makeWithEventStream<T, A, E, R>(
  key: string,
  lazyEffect: IOLazyEffect<A, E, R, T>
) {
  return Effect.gen(function* () {
    const componentContextService = yield* ComponentContext;
    return yield* componentContextService.ioWithEventStream<T, A, E, R>(
      key,
      lazyEffect
    );
  });
}

export const IO = {
  withEventStream: <T>() => ({
    make: <A, E, R>(key: string, lazyEffect: IOLazyEffect<A, E, R, T>) =>
      makeWithEventStream<T, A, E, R>(key, lazyEffect),
  }),
  make: <A, E, R>(key: string, lazyEffect: IOLazyEffect<A, E, R, never>) =>
    makeWithoutEventStream<A, E, R>(key, lazyEffect),
};
