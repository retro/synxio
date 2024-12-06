import {
  Context,
  Effect,
  SubscriptionRef,
  pipe,
  FiberMap,
  Queue,
  Stream,
  Ref,
} from "effect";
import {
  makeAppContextState,
  type AppContextState,
} from "./AppContext/AppContextState.js";

import {
  Persistence,
  PersistencePayload,
  PersistenceService,
} from "./Persistence.js";
import { AppContextPersistence } from "./AppContext/Persistence.js";
import { AppContextEndpoints } from "./AppContext/Endpoints.js";
import { AppContextComponents } from "./AppContext/Components.js";
import { AppContextComponentState } from "./AppContext/ComponentState.js";
import { AppContextIo } from "./AppContext/Io.js";

export class AppContextService {
  static make(appId: string) {
    return Effect.gen(function* () {
      const componentFibers = yield* FiberMap.make<string>();
      const state = yield* SubscriptionRef.make(makeAppContextState(appId));
      const persistenceService = yield* Persistence;
      const persistenceQueue = yield* Queue.unbounded<PersistencePayload>();
      const persistedQueues = yield* Ref.make({});
      const resumingStreamDataSemaphore = yield* Effect.makeSemaphore(1);

      yield* Effect.forkDaemon(
        pipe(
          persistenceQueue,
          Stream.fromQueue,
          Stream.runForEach((value) =>
            Effect.gen(function* () {
              console.log("PERSIST", value);
              yield* persistenceService.set(value);
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
    private readonly persistenceQueue: Queue.Queue<PersistencePayload>,
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
