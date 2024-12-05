import {
  Effect,
  FiberMap,
  pipe,
  Record,
  Ref,
  Scope,
  Struct,
  Option,
  Array,
  Exit,
  SubscriptionRef,
} from "effect";
import { AnyComponent, GetComponentPayload } from "../Component.js";
import {
  ComponentContext,
  ComponentContextService,
  ComponentMountInfo,
  mountInfoToId,
} from "../ComponentContext.js";
import { AppContextState, ComponentState } from "./AppContextState.js";

export class AppContextComponents {
  constructor(
    readonly state: SubscriptionRef.SubscriptionRef<AppContextState>,
    readonly componentFibers: FiberMap.FiberMap<string>
  ) {}
  mount<TComponent extends AnyComponent>(
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
                yield* runtimeContextService.deregister(mountInfo, id);
              } else {
                yield* runtimeContextService.updateStatus(
                  id,
                  Exit.isSuccess(exit) ? "completed" : "failed"
                );
              }
            })
          );

          yield* runtimeContextService.register(
            mountInfo,
            {
              id: componentContextService.id,
              name: component.setup.name,
              state,
            },
            payload
          );

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

  register(
    mountInfo: ComponentMountInfo,
    { id, state, name }: Pick<ComponentState, "id" | "state" | "name">,
    payload: any
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
        componentsMetadata: (componentsMetadata) =>
          Record.set(componentsMetadata, id, {
            generation: 0,
            payload,
          }),
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
  deregister(mountInfo: ComponentMountInfo, id: string) {
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
  updateStatus(
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
}
