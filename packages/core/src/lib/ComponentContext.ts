import { Context, Effect, pipe, Schema, Option, Scope } from "effect";
import { RuntimeContext } from "./RuntimeContext.js";
import { Persistence } from "./Persistence.js";
import type { AnyComponent, GetComponentPayload } from "./Component.js";
import { endpointIdToUrl } from "./Endpoint.js";
import crypto from "node:crypto";

function hashString(path: string) {
  const hasher = crypto.createHash("sha256");
  hasher.update(path);
  return hasher.digest("base64url");
}

export type ComponentMountInfo =
  | {
      type: "singleton";
      parentId: string;
      parentPath: string;
      parentMountedOnProperty: string;
      name: string;
    }
  | {
      type: "list";
      parentId: string;
      parentPath: string;
      parentMountedOnProperty: string;
      name: string;
      key: string | number;
    }
  | {
      type: "root";
      name: string;
    };

export class ComponentContextService {
  static make(scope: Scope.Scope, mountInfo: ComponentMountInfo) {
    return Effect.succeed(new ComponentContextService(scope, mountInfo));
  }

  readonly path: string;
  readonly id: string;

  constructor(
    readonly scope: Scope.Scope,
    readonly mountInfo: ComponentMountInfo
  ) {
    this.path =
      mountInfo.type === "root"
        ? mountInfo.name
        : mountInfo.type === "singleton"
          ? `${mountInfo.parentPath}/${mountInfo.parentMountedOnProperty}:${mountInfo.name}`
          : `${mountInfo.parentPath}/${mountInfo.parentMountedOnProperty}:${mountInfo.name}:${mountInfo.key}`;
    this.id = hashString(this.path);
    console.log(this.path);
    console.log(this.id);
  }
  openEndpoint<T>(
    mountedOnProperty: string,
    key: string,
    schema: Schema.Schema<any, any, never>
  ) {
    return Effect.gen(this, function* () {
      const runtimeContext = yield* RuntimeContext;
      const path = `endpoint:${this.path}/${mountedOnProperty}:${key}`;
      const id = hashString(path);
      const value = yield* runtimeContext.openEndpoint<T>(
        {
          componentId: this.id,
          mountedOnProperty,
          id,
        },
        schema
      );

      console.log(path);
      console.log(id);
      return {
        value,
        url: endpointIdToUrl(id),
      };
    });
  }
  setState(newState: Record<string, unknown>) {
    return Effect.gen(this, function* () {
      const runtimeContextService = yield* RuntimeContext;
      return yield* runtimeContextService.setComponentState(this.id, newState);
    });
  }
  getStateKeyValue(key: string) {
    return Effect.gen(this, function* () {
      const runtimeContextService = yield* RuntimeContext;
      return yield* runtimeContextService.getComponentStateKeyValue(
        this.id,
        key
      );
    });
  }
  updateAndGetStateKeyValue(key: string, updater: (value: unknown) => unknown) {
    return Effect.gen(this, function* () {
      const runtimeContextService = yield* RuntimeContext;
      return yield* runtimeContextService.updateAndGetComponentStateKeyValue(
        this.id,
        key,
        updater
      );
    });
  }
  io<T>(key: string, eff: Effect.Effect<T, never, never>) {
    return Effect.gen(this, function* () {
      const persistence = yield* Persistence;
      const id = `io:${this.path}/${key}`;
      return yield* pipe(
        persistence.get(id),
        Effect.flatMap((value) =>
          pipe(
            value,
            Option.match({
              onSome: (value) => Effect.succeed(value as T),
              onNone: () =>
                Effect.gen(this, function* () {
                  const value = yield* eff;
                  yield* persistence.set(id, value);
                  return value;
                }),
            })
          )
        )
      );
    });
  }
  mount<TComponent extends AnyComponent>(
    component: TComponent,
    mountInfo:
      | { type: "singleton"; parentMountedOnProperty: string }
      | { type: "list"; parentMountedOnProperty: string; key: string | number },
    payload: GetComponentPayload<TComponent>
  ) {
    return Effect.gen(this, function* () {
      const runtimeContextService = yield* RuntimeContext;
      return yield* runtimeContextService.mountComponent<TComponent>(
        this.scope,
        component,
        {
          ...mountInfo,
          parentId: this.id,
          parentPath: this.path,
          name: component.setup.name,
        },
        payload
      );
    });
  }
}

export class ComponentContext extends Context.Tag("@synxio/ComponentContext")<
  ComponentContext,
  InstanceType<typeof ComponentContextService>
>() {}
