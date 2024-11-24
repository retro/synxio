import {
  Deferred,
  Effect,
  pipe,
  Ref,
  Schema,
  Option,
  Struct,
  Record,
} from "effect";
import { Persistence, PersistenceService } from "../Persistence.js";
import type { RuntimeContextState } from "./RuntimeContextState.js";
import { endpointIdToUrl } from "../Endpoint.js";

export interface EndpointMountInfo {
  componentId: string;
  mountedOnProperty: string;
  id: string;
}

function openAndRegisterEndpoint<T>(
  persistence: PersistenceService,
  stateRef: Ref.Ref<RuntimeContextState>,
  mountInfo: EndpointMountInfo,
  schema: Schema.Schema<any, any, never>
) {
  return Effect.gen(function* () {
    const decoder = Schema.decodeUnknown(schema);
    const deferred = yield* Deferred.make<T>();

    const callback = (value: unknown) =>
      Effect.gen(function* () {
        const parsedValue: T = yield* decoder(value);
        yield* Deferred.succeed(deferred, parsedValue);
      });

    const registerEndpoint = Ref.update(stateRef, (state) =>
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

    const deregisterEndpoint = Ref.update(stateRef, (state) =>
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
      yield* deferred.pipe(
        Effect.andThen((value) => persistence.set(mountInfo.id, value))
      );
    }).pipe(Effect.forkScoped);

    return deferred as Deferred.Deferred<T>;
  });
}

export function openEndpoint<T>(
  stateRef: Ref.Ref<RuntimeContextState>,
  mountInfo: EndpointMountInfo,
  schema: Schema.Schema<any, any, never>
) {
  return Effect.gen(function* () {
    const persistence = yield* Persistence;

    const openEndpoint = pipe(
      Ref.get(stateRef),
      Effect.andThen((state) =>
        Record.get(state.openEndpoints, mountInfo.id).pipe(
          Option.match({
            onSome: (value) =>
              Effect.succeed(value.deferred as Deferred.Deferred<T>),
            onNone: () =>
              openAndRegisterEndpoint<T>(
                persistence,
                stateRef,
                mountInfo,
                schema
              ),
          })
        )
      )
    );

    return yield* pipe(
      persistence.get(mountInfo.id),
      Effect.andThen((value) =>
        pipe(
          value,
          Option.match({
            onSome: (value) => Effect.succeed(Effect.succeed(value as T)),
            onNone: () => openEndpoint,
          })
        )
      )
    );
  });
}
