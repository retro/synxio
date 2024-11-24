import { Effect, pipe } from "effect";
import type { AnyComponent } from "./Component.js";
import { RuntimeContext, RuntimeContextService } from "./RuntimeContext.js";
import { Persistence, PersistenceService } from "./Persistence.js";

export class Runtime<TRootComponent extends AnyComponent> {
  private constructor(readonly rootComponent: TRootComponent) {}
  static build<TRootComponent extends AnyComponent>(
    rootComponent: TRootComponent
  ) {
    return new Runtime<TRootComponent>(rootComponent);
  }
  initialize(payload: Parameters<TRootComponent["mount"]>[0]) {
    return Effect.gen(this, function* () {
      const runtimeContextService = yield* RuntimeContextService.make();
      const run = pipe(
        Effect.gen(this, function* () {
          const scope = yield* Effect.scope;
          const fiber = yield* pipe(
            runtimeContextService.mountComponent<TRootComponent>(
              scope,
              this.rootComponent,
              {
                type: "root",
                name: this.rootComponent.setup.name,
              },
              payload
            ),
            Effect.provideServiceEffect(
              Persistence,
              PersistenceService.makeLive()
            ),
            Effect.provideService(RuntimeContext, runtimeContextService)
          );
          return yield* fiber;
        }),
        Effect.scoped
      );

      return {
        context: runtimeContextService,
        run,
      };
    });
  }
}
