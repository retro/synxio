import {
  Context,
  Effect,
  Ref,
  Schema,
  Option,
  SubscriptionRef,
  Record,
  Struct,
  Scope,
  Exit,
  pipe,
  Array,
  FiberMap,
} from "effect";
import {
  makeRuntimeContextState,
  type ComponentState,
  type RuntimeContextState,
} from "./RuntimeContext/RuntimeContextState.js";
import {
  openEndpoint,
  type EndpointMountInfo,
} from "./RuntimeContext/OpenEndpoint.js";
import type { AnyComponent, GetComponentPayload } from "./Component.js";
import {
  ComponentContext,
  ComponentContextService,
  mountInfoToId,
  type ComponentMountInfo,
} from "./ComponentContext.js";

export class RuntimeContextService {
  static make() {
    return Effect.gen(function* () {
      const componentFibers = yield* FiberMap.make<string>();
      const state = yield* SubscriptionRef.make(makeRuntimeContextState());
      return new RuntimeContextService(state, componentFibers);
    });
  }
  constructor(
    readonly state: SubscriptionRef.SubscriptionRef<RuntimeContextState>,
    private readonly componentFibers: FiberMap.FiberMap<string>
  ) {}
  mountComponent<TComponent extends AnyComponent>(
    parentScope: Scope.Scope,
    component: TComponent,
    mountInfo: ComponentMountInfo,
    payload: GetComponentPayload<TComponent>
  ) {
    const componentMountEffect = component.mount(payload) as Effect.Effect<
      Effect.Effect.Success<ReturnType<TComponent["mount"]>>,
      Effect.Effect.Error<ReturnType<TComponent["mount"]>>,
      Effect.Effect.Context<ReturnType<TComponent["mount"]>>
    >;

    const state = component.setup.getInitialState();
    const runtimeContextService = this;
    const id = mountInfoToId(mountInfo);

    return Effect.gen(this, function* () {
      const mountEffect = pipe(
        Effect.gen(function* () {
          const scope = yield* Effect.scope;
          const componentContextService = yield* ComponentContextService.make(
            scope,
            mountInfo
          );

          yield* Effect.addFinalizer((exit) =>
            Effect.gen(function* () {
              if (Exit.isInterrupted(exit)) {
                yield* runtimeContextService.deregisterComponent(mountInfo, id);
              } else {
                yield* runtimeContextService.updateComponentStatus(
                  id,
                  Exit.isSuccess(exit) ? "completed" : "failed"
                );
              }
            })
          );

          yield* runtimeContextService.registerComponent(mountInfo, {
            id: componentContextService.id,
            name: component.setup.name,
            state,
          });

          return yield* pipe(
            componentMountEffect,
            Effect.provideService(ComponentContext, componentContextService)
          );
        }),
        Effect.scoped
      );

      yield* FiberMap.remove(this.componentFibers, id);

      const fiber = yield* Effect.forkIn(mountEffect, parentScope);

      yield* FiberMap.set(this.componentFibers, id, fiber);
      yield* Effect.yieldNow();

      return fiber;
    });
  }

  registerComponent(
    mountInfo: ComponentMountInfo,
    { id, state, name }: Pick<ComponentState, "id" | "state" | "name">
  ) {
    const parentId = mountInfo.type === "root" ? null : mountInfo.parentId;
    const componentState: ComponentState = {
      id,
      name,
      parentId,
      status: "running",
      state,
      endpoints: {},
      components: {},
    };

    return Ref.update(this.state, (state) =>
      Struct.evolve(state, {
        components: (components) => {
          const withRegisteredComponent = Record.set(
            components,
            id,
            componentState
          );
          if (mountInfo.type === "root") {
            return withRegisteredComponent;
          }
          return Record.modify(
            withRegisteredComponent,
            mountInfo.parentId,
            (parentComponent) =>
              Struct.evolve(parentComponent, {
                components: (components) => {
                  if (mountInfo.type === "singleton") {
                    return Record.set(
                      components,
                      mountInfo.parentMountedOnProperty,
                      id
                    );
                  }
                  const currentComponents = Record.get(
                    components,
                    mountInfo.parentMountedOnProperty
                  ).pipe(Option.getOrElse(() => []));
                  return Record.set(
                    components,
                    mountInfo.parentMountedOnProperty,
                    Array.append(currentComponents, id)
                  );
                },
              })
          );
        },
      })
    );
  }
  deregisterComponent(mountInfo: ComponentMountInfo, id: string) {
    return Ref.update(this.state, (state) =>
      Struct.evolve(state, {
        components: (components) => {
          const withDeregisteredComponent: Record<string, ComponentState> =
            Record.remove(components, id);
          if (mountInfo.type === "root") {
            return withDeregisteredComponent;
          }
          return Record.modify(
            withDeregisteredComponent,
            mountInfo.parentId,
            (parentComponent) =>
              Struct.evolve(parentComponent, {
                components: (components) => {
                  if (mountInfo.type === "singleton") {
                    return Record.remove(
                      components,
                      mountInfo.parentMountedOnProperty
                    );
                  }
                  const currentComponents = Record.get(
                    components,
                    mountInfo.parentMountedOnProperty
                  ).pipe(Option.getOrElse(() => []));
                  return Record.set(
                    components,
                    mountInfo.parentMountedOnProperty,
                    Array.filter(
                      currentComponents,
                      (componentId) => componentId !== id
                    )
                  );
                },
              })
          );
        },
      })
    );
  }
  updateComponentStatus(
    componentId: string,
    status: Exclude<ComponentState["status"], "running">
  ) {
    return Ref.update(this.state, (state) =>
      Struct.evolve(state, {
        components: (components) =>
          Record.modify(components, componentId, (componentState) =>
            Struct.evolve(componentState, {
              status: () => status,
            })
          ),
      })
    );
  }
  setComponentState(componentId: string, newState: Record<string, unknown>) {
    return Effect.gen(this, function* () {
      yield* Ref.update(this.state, (state) => {
        return Struct.evolve(state, {
          components: (components) => {
            return Record.modify(components, componentId, (componentState) => {
              return Struct.evolve(componentState, {
                state: () => newState,
              });
            });
          },
        });
      });
    });
  }
  getComponentStateKeyValue(componentId: string, key: string) {
    return pipe(
      Ref.get(this.state),
      Effect.map((state) =>
        pipe(
          Record.get(state.components, componentId),
          Option.flatMap((componentState) =>
            Record.get(componentState.state, key)
          )
        )
      )
    );
  }
  updateAndGetComponentStateKeyValue(
    componentId: string,
    key: string,
    updater: (value: unknown) => unknown
  ) {
    return pipe(
      Ref.updateAndGet(this.state, (state) => {
        return Struct.evolve(state, {
          components: (components) => {
            return Record.modify(components, componentId, (componentState) => {
              return Struct.evolve(componentState, {
                state: (state) => Record.modify(state, key, updater),
              });
            });
          },
        });
      }),
      Effect.map((state) =>
        pipe(
          Record.get(state.components, componentId),
          Option.flatMap((componentState) =>
            Record.get(componentState.state, key)
          )
        )
      )
    );
  }
  openEndpoint<T>(
    mountInfo: EndpointMountInfo,
    schema: Schema.Schema<any, any, never>
  ) {
    return openEndpoint<T>(this.state, mountInfo, schema);
  }
  getEndpointCallback(id: string) {
    return Effect.gen(this, function* () {
      const state = yield* Ref.get(this.state);
      // TODO: When the server is implemented properly, return option here
      // and handle Option.None case on the server level (should be a 404 error)
      return Record.get(state.openEndpoints, id).pipe(
        Option.map((value) => value.callback),
        Option.getOrElse(() => undefined)
      );
    });
  }
}

export class RuntimeContext extends Context.Tag("@synxio/RuntimeContext")<
  RuntimeContext,
  InstanceType<typeof RuntimeContextService>
>() {}
