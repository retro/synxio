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
  Record,
} from "effect";
import type { AnyComponent, GetAppComponentsPayloads } from "./Component.js";
import { AppContext, AppContextService } from "./AppContext.js";
import { Persistence, PersistenceService } from "./Persistence.js";
import {
  AppContextState,
  ComponentState,
  ComponentStateForbidden,
} from "./AppContext/AppContextState.js";
import * as jsondiffpatch from "jsondiffpatch";
import { diff_match_patch } from "@dmsnell/diff-match-patch";

const jsondiffpatchInstance = jsondiffpatch.create({
  arrays: {
    detectMove: true,
  },
  propertyFilter: (_name, context) => {
    return context.left !== context.right;
  },
  // @ts-expect-error Original version breaks with surrogate pairs, this is a workaround
  textDiff: { diffMatchPatch: diff_match_patch },
});

export type StateUpdate =
  | {
      type: "state";
      value: Record<string, ComponentState | ComponentStateForbidden>;
    }
  | {
      type: "patch";
      value: jsondiffpatch.Delta;
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
  authorizer: AppAuthorizer<any> | undefined,
  payload: InitializeOrResumePayload<Parameters<TRootComponent["mount"]>[0]>
) {
  const program = Effect.gen(function* () {
    const runPromise = EffectRuntime.runPromise(yield* Effect.runtime());
    const scope = yield* Scope.make();
    //const runSync = EffectRuntime.runSync(yield* Effect.runtime());

    const appContextService = yield* AppContextService.make(appId).pipe(
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
      appContextService.state.changes,
      Stream.map((value) => value.components),
      Stream.changes,
      Stream.debounce(20),
      Stream.toPubSub({ strategy: "sliding", capacity: 1 }),
      Effect.provideService(Scope.Scope, scope)
    );

    const authorizeComponentTree = (
      userAuthPayload: any,
      components: AppContextState["components"]
    ) =>
      Effect.gen(function* () {
        if (!authorizer) {
          return components;
        }
        return yield* pipe(
          components,
          Record.toEntries,
          Effect.forEach(([id, component]) =>
            Effect.gen(function* () {
              const appContextState = yield* Ref.get(appContextService.state);
              const metadata = yield* Record.get(
                appContextState.componentsMetadata,
                id
              );

              const isAuthorized = yield* authorizer(userAuthPayload, {
                name: component.name,
                payload: metadata.payload,
              });

              console.log(isAuthorized);

              return [
                id,
                isAuthorized
                  ? component
                  : {
                      name: component.name,
                      id: component.id,
                      parentId: component.parentId,
                      status: "forbidden" as const,
                    },
              ] as const;
            })
          ),
          Effect.andThen(Record.fromEntries)
        );
      });

    yield* Effect.forkDaemon(
      pipe(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          const fiber = yield* pipe(
            appContextService.mountComponent<TRootComponent>(
              scope,
              rootComponent,
              {
                type: "root",
                name: rootComponent.setup.name,
              },
              initialPayload
            ),
            Effect.provideService(Persistence, persistence),
            Effect.provideService(AppContext, appContextService)
          );
          return yield* fiber;
        }),
        Effect.provideService(Scope.Scope, scope)
      )
    );

    yield* Effect.yieldNow();

    return {
      callEndpoint: (
        userAuthPayload: any,
        id: string,
        payload: unknown
      ): Promise<CallEndpointResult> =>
        runPromise(
          Effect.gen(function* () {
            const endpoint = yield* appContextService.getEndpointCallback(id);
            if (endpoint) {
              yield* endpoint(payload);
              return { type: "success" };
            }
            return { type: "error", error: "Endpoint not found" };
          })
        ),
      subscribe: (
        userAuthPayload: any,
        cb: (stateUpdate: StateUpdate) => void
      ) =>
        runPromise(
          Effect.gen(function* () {
            const initialState = (yield* Ref.get(appContextService.state))
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
              Stream.mapEffect((value) =>
                authorizeComponentTree(userAuthPayload, value)
              ),
              Stream.zipWithPrevious,
              Stream.map(([previous, current]) =>
                Option.match(previous, {
                  onNone: () => ({
                    type: "state" as const,
                    value: current,
                  }),
                  onSome: (previous) => {
                    return {
                      type: "patch" as const,
                      value: jsondiffpatchInstance.diff(previous, current),
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

export class App<
  TRootComponent extends AnyComponent,
  TAuthorizer extends AppAuthorizer<TRootComponent>,
> {
  static build<
    TRootComponent extends AnyComponent,
    TAuthorizer extends AppAuthorizer<TRootComponent>,
  >(rootComponent: TRootComponent, authorizer?: TAuthorizer) {
    return new App<TRootComponent, TAuthorizer>(rootComponent, authorizer);
  }
  private constructor(
    readonly rootComponent: TRootComponent,
    readonly authorizer?: AppAuthorizer<TRootComponent>
  ) {}

  initialize(appId: string, payload: Parameters<TRootComponent["mount"]>[0]) {
    return initializeOrResume(appId, this.rootComponent, this.authorizer, {
      type: "initialize",
      payload,
    });
  }
  resume(appId: string) {
    return initializeOrResume(appId, this.rootComponent, this.authorizer, {
      type: "resume",
    });
  }
}

export type AppAuthorizer<TRootComponent extends AnyComponent> = (
  userPayload: any,
  component: GetAppComponentsPayloads<TRootComponent>
) => Effect.Effect<boolean>;

export type AnyApp = App<AnyComponent, any>;
export type GetAppRootComponent<T> = T extends App<infer U, any> ? U : never;
export type GetAppAuthorizerUserPayload<T> =
  T extends App<any, infer V>
    ? undefined extends V
      ? any
      : Parameters<V>[0]
    : never;
