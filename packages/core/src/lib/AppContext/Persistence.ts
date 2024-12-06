import { Effect, Queue, Ref, Record, Option, pipe } from "effect";
import { PersistencePayload, PersistenceService } from "../Persistence.js";
import { SqlError } from "@effect/sql";

export class AppContextPersistence {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly persistenceQueue: Queue.Queue<PersistencePayload>,
    private readonly persistedQueues: Ref.Ref<Record<string, Queue.Queue<any>>>,
    private readonly resumingStreamDataSemaphore: Effect.Semaphore
  ) {}
  get(id: string) {
    return this.persistence.get(id);
  }
  set(persistencePayload: PersistencePayload) {
    return this.persistenceQueue.offer(persistencePayload);
  }
  getPersistedQueue<T>(id: string) {
    return Effect.gen(this, function* () {
      const persistedQueues = yield* Ref.get(this.persistedQueues);
      return yield* pipe(
        Record.get(persistedQueues, id),
        Option.match({
          onSome: (value) => Effect.succeed(value as Queue.Queue<T>),
          onNone: () =>
            Effect.gen(this, function* () {
              const queue = yield* Queue.bounded<T>(1);
              yield* Ref.update(this.persistedQueues, (persistedQueues) =>
                Record.set(persistedQueues, id, queue)
              );
              return queue;
            }),
        })
      );
    });
  }
  resumeStreamData(fromId: string) {
    return this.resumingStreamDataSemaphore
      .withPermits(1)(
        Effect.gen(this, function* () {
          yield* this.resumeStreamDataStep(fromId);
        })
      )
      .pipe(Effect.forkDaemon);
  }
  private resumeStreamDataStep(
    fromId: string
  ): Effect.Effect<void, SqlError.SqlError> {
    return Effect.gen(this, function* () {
      const after = yield* this.persistence.getAfter(fromId);
      yield* pipe(
        after,
        Option.match({
          onSome: (value) =>
            Effect.gen(this, function* () {
              switch (value.type) {
                case "streamData": {
                  const persistedQueue = yield* this.getPersistedQueue(
                    value.parentId
                  );

                  yield* Queue.offer(persistedQueue, value.payload);

                  return yield* Effect.suspend(() =>
                    this.resumeStreamDataStep(value.id)
                  );
                }
                case "streamDone": {
                  const persistedQueue = yield* this.getPersistedQueue(
                    value.id
                  );

                  while (!(yield* Queue.isEmpty(persistedQueue))) {
                    yield* Effect.yieldNow();
                  }

                  yield* Queue.shutdown(persistedQueue);
                  return yield* Effect.suspend(() =>
                    this.resumeStreamDataStep(value.id)
                  );
                }
              }
            }),
          onNone: () => Effect.void,
        })
      );
    });
  }
}
