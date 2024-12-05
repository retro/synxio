import { Context, Effect, Schema, Scope } from "effect";
import { AppContext } from "./AppContext.js";
import type { AnyComponent, GetComponentPayload } from "./Component.js";
import { endpointIdToUrl } from "./Endpoint.js";
import crypto from "node:crypto";
import { IOLazyEffect } from "./AppContext/Io.js";

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

export function mountInfoToPath(mountInfo: ComponentMountInfo) {
  return mountInfo.type === "root"
    ? mountInfo.name
    : mountInfo.type === "singleton"
      ? `${mountInfo.parentPath}/${mountInfo.parentMountedOnProperty}:${mountInfo.name}`
      : `${mountInfo.parentPath}/${mountInfo.parentMountedOnProperty}:${mountInfo.name}:${mountInfo.key}`;
}

export function mountInfoToId(mountInfo: ComponentMountInfo) {
  return hashString(mountInfoToPath(mountInfo));
}

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
    this.path = mountInfoToPath(mountInfo);

    this.id = hashString(this.path);
    //console.log("!", this.path);
    //console.log("!!", this.id);
  }
  openEndpoint<T>(
    mountedOnProperty: string,
    key: string,
    schema: Schema.Schema<any, any, never>
  ) {
    return Effect.gen(this, function* () {
      const runtimeContext = yield* AppContext;
      const path = `endpoint:${this.path}/${mountedOnProperty}:${key}`;
      const id = hashString(path);
      const value = yield* runtimeContext.endpoints.open<T>(
        {
          componentId: this.id,
          mountedOnProperty,
          path,
          id,
        },
        schema
      );

      //console.log("!!!", path);
      //console.log("!!!!", id);
      return {
        value,
        url: endpointIdToUrl(id),
      };
    });
  }
  setState(newState: Record<string, unknown>) {
    return Effect.gen(this, function* () {
      const appContextService = yield* AppContext;
      return yield* appContextService.componentState.set(this.id, newState);
    });
  }
  getStateKeyValue(key: string) {
    return Effect.gen(this, function* () {
      const appContextService = yield* AppContext;
      return yield* appContextService.componentState.getKeyValue(this.id, key);
    });
  }
  updateAndGetStateKeyValue(key: string, updater: (value: unknown) => unknown) {
    return Effect.gen(this, function* () {
      const appContextService = yield* AppContext;
      return yield* appContextService.componentState.updateAndGetKeyValue(
        this.id,
        key,
        updater
      );
    });
  }
  io<A, E, R>(key: string, eff: Effect.Effect<A, E, R>) {
    return Effect.gen(this, function* () {
      const id = `io:${this.path}/${key}`;
      const appContextService = yield* AppContext;
      return yield* appContextService.io.run(id, eff);
    });
  }
  ioWithoutEventStream<A, E, R>(
    key: string,
    lazyEffect: IOLazyEffect<A, E, R, never>
  ) {
    return Effect.gen(this, function* () {
      const id = `io:${this.path}/${key}`;
      const appContextService = yield* AppContext;
      return yield* appContextService.io.runWithoutEventStream(id, lazyEffect);
    });
  }
  ioWithEventStream<T, A, E, R>(
    key: string,
    lazyEffect: IOLazyEffect<A, E, R, T>
  ) {
    return Effect.gen(this, function* () {
      const id = `io:${this.path}/${key}`;
      const appContextService = yield* AppContext;
      return yield* appContextService.io.runWithEventStream(id, lazyEffect);
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
      const appContextService = yield* AppContext;
      return yield* appContextService.components.mount<TComponent>(
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
