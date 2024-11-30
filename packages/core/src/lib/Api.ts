import { Effect } from "effect";
import { ComponentContext } from "./ComponentContext.js";

// TODO: IO should be able to fail with IOFailure
function io<A, E, R>(key: string, effect: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const componentContextService = yield* ComponentContext;
    return yield* componentContextService.io(key, effect);
  });
}

export const Api = {
  io,
};
