import {
  Effect,
  pipe,
  Stream,
  Runtime as EffectRuntime,
  Fiber,
  Ref,
  Option,
  Take,
  Chunk,
  Scope,
} from "effect";
import type { AnyComponent } from "./Component.js";
import { AppContext, AppContextService } from "./AppContext.js";
import { Persistence, PersistenceService } from "./Persistence.js";
import { AppContextState } from "./AppContext/RuntimeContextState.js";
import * as jsonPatchFormatter from "jsondiffpatch/formatters/jsonpatch";
import * as jsondiffpatch from "jsondiffpatch";

const jsondiffpatchInstance = jsondiffpatch.create({
  arrays: {
    detectMove: true,
  },
});

export type StateUpdate =
  | {
      type: "state";
      value: AppContextState["components"];
    }
  | {
      type: "patch";
      value: jsonPatchFormatter.Op[];
    };

export type CallEndpointResult =
  | { type: "success" }
  | { type: "error"; error: string };

export type InitializeOrResumePayload<TInitializePayload> =
  | {
      type: "initialize";
      payload: TInitializePayload;
    }
  | {
      type: "resume";
    };

function initializeOrResume<TRootComponent extends AnyComponent>(
  appId: string,
  rootComponent: TRootComponent,
  payload: InitializeOrResumePayload<Parameters<TRootComponent["mount"]>[0]>
) {
  const program = Effect.gen(function* () {
    const runPromise = EffectRuntime.runPromise(yield* Effect.runtime());
    const scope = yield* Scope.make();
    //const runSync = EffectRuntime.runSync(yield* Effect.runtime());

    const runtimeContextService = yield* AppContextService.make(appId).pipe(
      Effect.provideService(Scope.Scope, scope)
    );

    const persistence = yield* PersistenceService.makeLive(appId).pipe(
      Effect.provideService(Scope.Scope, scope)
    );

    const initialPayload = yield* Effect.gen(function* () {
      if (payload.type === "initialize") {
        yield* persistence.set(`initialPayload`, payload.payload);
        return payload.payload;
      }
      const persistedPayload = (yield* persistence.get(
        `initialPayload`
      )) as Option.Option<Parameters<TRootComponent["mount"]>[0]>;

      return yield* persistedPayload;
    }).pipe(Effect.catchTag("NoSuchElementException", Effect.die));

    const changesPubSub = yield* pipe(
      runtimeContextService.state.changes,
      Stream.map((value) => value.components),
      Stream.changes,
      Stream.debounce(10),
      Stream.toPubSub({ strategy: "dropping", capacity: 1 }),
      Effect.provideService(Scope.Scope, scope)
    );

    yield* Effect.forkDaemon(
      pipe(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          const fiber = yield* pipe(
            runtimeContextService.mountComponent<TRootComponent>(
              scope,
              rootComponent,
              {
                type: "root",
                name: rootComponent.setup.name,
              },
              initialPayload
            ),
            Effect.provideService(Persistence, persistence),
            Effect.provideService(AppContext, runtimeContextService)
          );
          return yield* fiber;
        }),
        Effect.provideService(Scope.Scope, scope)
      )
    );

    yield* Effect.yieldNow();

    return {
      callEndpoint: (
        id: string,
        payload: unknown
      ): Promise<CallEndpointResult> =>
        runPromise(
          Effect.gen(function* () {
            const endpoint =
              yield* runtimeContextService.getEndpointCallback(id);
            if (endpoint) {
              yield* endpoint(payload);
              return { type: "success" };
            }
            return { type: "error", error: "Endpoint not found" };
          })
        ),
      subscribe: (cb: (stateUpdate: StateUpdate) => void) =>
        runPromise(
          Effect.gen(function* () {
            console.log(yield* Ref.get(runtimeContextService.state));
            const initialState = (yield* Ref.get(runtimeContextService.state))
              .components;

            const stateUpdatesStreamFiber = yield* pipe(
              Stream.concat(
                Stream.succeed(Take.of(initialState)),
                Stream.fromPubSub(changesPubSub, { scoped: false })
              ),

              Stream.filterMap(
                Take.match({
                  onSuccess: (value) => Chunk.head(value),
                  onFailure: () => Option.none(),
                  onEnd: () => Option.none(),
                })
              ),
              // TODO: here we should cleanup the component tree based on the authorization
              Stream.zipWithPrevious,
              Stream.map(([previous, current]) =>
                Option.match(previous, {
                  onNone: () => ({
                    type: "state" as const,
                    value: current,
                  }),
                  onSome: (previous) => {
                    const patch = jsondiffpatchInstance.diff(previous, current);
                    const formattedPatch = jsonPatchFormatter.format(
                      patch,
                      previous
                    );
                    return {
                      type: "patch" as const,
                      value: formattedPatch,
                    };
                  },
                })
              ),
              Stream.runForEach((state) => Effect.succeed(cb(state))),
              Effect.forkDaemon
            );

            return () => {
              runPromise(Fiber.interrupt(stateUpdatesStreamFiber));
            };
          })
        ),
    };
  }).pipe(Effect.catchTag("SqlError", Effect.die));
  return program;
}

export class App<TRootComponent extends AnyComponent> {
  static build<TRootComponent extends AnyComponent>(
    rootComponent: TRootComponent
  ) {
    return new App<TRootComponent>(rootComponent);
  }
  private constructor(readonly rootComponent: TRootComponent) {}
  initialize(appId: string, payload: Parameters<TRootComponent["mount"]>[0]) {
    return initializeOrResume(appId, this.rootComponent, {
      type: "initialize",
      payload,
    });
  }
  resume(appId: string) {
    return initializeOrResume(appId, this.rootComponent, {
      type: "resume",
    });
  }
}

export type AnyApp = App<AnyComponent>;
export type GetAppRootComponent<T> = T extends App<infer U> ? U : never;
