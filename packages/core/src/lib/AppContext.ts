import {
  Context,
  Effect,
  SubscriptionRef,
  pipe,
  FiberMap,
  Queue,
  Stream,
  Option,
  Ref,
  SynchronizedRef,
  Struct,
  Array,
} from "effect";
import {
  makeAppContextState,
  type AppContextState,
} from "./AppContext/AppContextState.js";

import {
  Persistence,
  PersistenceInputPayload,
  PersistenceInputStreamDataPayload,
  PersistenceService,
} from "./Persistence.js";
import { AppContextPersistence } from "./AppContext/Persistence.js";
import { AppContextEndpoints } from "./AppContext/Endpoints.js";
import { AppContextComponents } from "./AppContext/Components.js";
import { AppContextComponentState } from "./AppContext/ComponentState.js";
import { AppContextIo } from "./AppContext/Io.js";
import { NonEmptyArray } from "effect/Array";

// TODO: Refactor this so that sub-services are created in the make method
export class AppContextService {
  static make(appId: string) {
    return Effect.gen(function* () {
      const componentFibers = yield* FiberMap.make<string>();
      const state = yield* SubscriptionRef.make(makeAppContextState(appId));
      const persistenceService = yield* Persistence;
      const persistenceQueue =
        yield* Queue.unbounded<PersistenceInputPayload>();
      const persistedQueues = yield* Ref.make({});
      const resumingStreamDataSemaphore = yield* Effect.makeSemaphore(1);

      const pendingStreamData = yield* SynchronizedRef.make<
        Option.Option<{
          parentId: string;
          parts: NonEmptyArray<PersistenceInputStreamDataPayload>;
        }>
      >(Option.none());

      yield* Effect.forkDaemon(
        pipe(
          persistenceQueue,
          Stream.fromQueue,
          Stream.runForEach((value) =>
            Effect.gen(function* () {
              yield* pipe(
                pendingStreamData,
                SynchronizedRef.updateEffect((currentPendingStreamData) =>
                  pipe(
                    currentPendingStreamData,
                    Option.match({
                      onNone: () =>
                        Effect.gen(function* () {
                          if (value.type === "streamData") {
                            const parts: NonEmptyArray<PersistenceInputStreamDataPayload> =
                              [value];
                            return Option.some({
                              parentId: value.parentId,
                              parts,
                            });
                          }

                          return Option.none();
                        }),

                      onSome: (currentPendingStreamData) =>
                        Effect.gen(function* () {
                          if (
                            value.type === "streamData" &&
                            currentPendingStreamData.parentId === value.parentId
                          ) {
                            return Option.some(
                              Struct.evolve(currentPendingStreamData, {
                                parts: (parts) => Array.append(parts, value),
                              })
                            );
                          }

                          const persistencePayload: PersistenceInputStreamDataPayload =
                            {
                              type: "streamData",
                              id: currentPendingStreamData.parts[0].id,
                              parentId: currentPendingStreamData.parentId,
                              payload: Array.map(
                                currentPendingStreamData.parts,
                                (part) => part.payload
                              ),
                            };

                          yield* persistenceService.set(persistencePayload);

                          if (value.type === "streamData") {
                            const parts: NonEmptyArray<PersistenceInputStreamDataPayload> =
                              [value];
                            return Option.some({
                              parentId: value.parentId,
                              parts,
                            });
                          }

                          return Option.none();
                        }),
                    })
                  )
                )
              );

              if (value.type !== "streamData") {
                yield* persistenceService.set(value);
              }
            })
          )
        )
      );

      return new AppContextService(
        state,
        componentFibers,
        persistenceService,
        persistenceQueue,
        persistedQueues,
        resumingStreamDataSemaphore
      );
    });
  }

  readonly persistence: AppContextPersistence;
  readonly endpoints: AppContextEndpoints;
  readonly components: AppContextComponents;
  readonly componentState: AppContextComponentState;
  readonly io: AppContextIo;

  constructor(
    readonly state: SubscriptionRef.SubscriptionRef<AppContextState>,
    private readonly componentFibers: FiberMap.FiberMap<string>,
    private readonly persistenceService: PersistenceService,
    private readonly persistenceQueue: Queue.Queue<PersistenceInputPayload>,
    private readonly persistedQueues: Ref.Ref<Record<string, Queue.Queue<any>>>,
    private readonly resumingStreamDataSemaphore: Effect.Semaphore
  ) {
    this.persistence = new AppContextPersistence(
      this.persistenceService,
      this.persistenceQueue,
      this.persistedQueues,
      this.resumingStreamDataSemaphore
    );
    this.endpoints = new AppContextEndpoints(this.state, this.persistence);
    this.components = new AppContextComponents(
      this.state,
      this.componentFibers
    );
    this.componentState = new AppContextComponentState(this.state);
    this.io = new AppContextIo(this.persistence);
  }
}

export class AppContext extends Context.Tag("@synxio/AppContext")<
  AppContext,
  InstanceType<typeof AppContextService>
>() {}
