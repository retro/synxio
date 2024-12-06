import {
  Deferred,
  Effect,
  Option,
  pipe,
  Record,
  Ref,
  Schema,
  Struct,
  SubscriptionRef,
} from "effect";
import { AppContextState } from "./AppContextState.js";
import { AppContextPersistence } from "./Persistence.js";
import { endpointIdToUrl } from "../Endpoint.js";

export interface EndpointMountInfo {
  componentId: string;
  mountedOnProperty: string;
  path: string;
  id: string;
}

export class AppContextEndpoints {
  constructor(
    private readonly state: SubscriptionRef.SubscriptionRef<AppContextState>,
    private readonly persistence: AppContextPersistence
  ) {}
  open<T>(
    mountInfo: EndpointMountInfo,
    schema: Schema.Schema<any, any, never>
  ) {
    return Effect.gen(this, function* () {
      const openEndpoint = pipe(
        Ref.get(this.state),
        Effect.andThen((state) =>
          Record.get(state.openEndpoints, mountInfo.path).pipe(
            Option.match({
              onSome: (value) =>
                Effect.succeed(value.deferred as Deferred.Deferred<T>),
              onNone: () => this.openAndRegisterEndpoint<T>(mountInfo, schema),
            })
          )
        )
      );

      return yield* pipe(
        this.persistence.get(mountInfo.path),
        Effect.andThen((value) =>
          pipe(
            value,
            Option.match({
              onSome: (value) =>
                Effect.gen(this, function* () {
                  yield* this.persistence.resumeStreamData(mountInfo.path);
                  return Effect.succeed(value.payload as T);
                }),
              onNone: () => openEndpoint,
            })
          )
        )
      );
    });
  }

  getCallback(id: string) {
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

  private openAndRegisterEndpoint<T>(
    mountInfo: EndpointMountInfo,
    schema: Schema.Schema<any, any, never>
  ) {
    return Effect.gen(this, function* () {
      const decoder = Schema.decodeUnknown(schema);
      const deferred = yield* Deferred.make<T>();

      const callback = (value: unknown) =>
        Effect.gen(function* () {
          const parsedValue: T = yield* decoder(value);
          yield* Deferred.succeed(deferred, parsedValue);
          yield* Effect.yieldNow();
        });

      const registerEndpoint = Ref.update(this.state, (state) =>
        Struct.evolve(state, {
          components: (components) =>
            Record.modify(components, mountInfo.componentId, (component) =>
              Struct.evolve(component, {
                endpoints: (endpoints) =>
                  Record.set(
                    endpoints,
                    mountInfo.mountedOnProperty,
                    endpointIdToUrl(mountInfo.id)
                  ),
              })
            ),
          openEndpoints: (openEndpoints) =>
            Record.set(openEndpoints, mountInfo.id, {
              callback,
              deferred,
            }),
        })
      );

      const deregisterEndpoint = Ref.update(this.state, (state) =>
        Struct.evolve(state, {
          components: (components) =>
            Record.modify(components, mountInfo.componentId, (component) =>
              Struct.evolve(component, {
                endpoints: (endpoints) =>
                  Record.remove(endpoints, mountInfo.mountedOnProperty),
              })
            ),
          openEndpoints: (openEndpoints) =>
            Record.remove(openEndpoints, mountInfo.id),
        })
      );

      yield* registerEndpoint;

      yield* Effect.gen(function* () {
        yield* Effect.addFinalizer(() => deregisterEndpoint);
      }).pipe(Effect.forkScoped);

      return Effect.gen(this, function* () {
        const value = yield* deferred;
        yield* deregisterEndpoint;
        yield* this.persistence.set({
          type: "data",
          id: mountInfo.path,
          payload: value,
        });
        return value;
      });
    });
  }
}
