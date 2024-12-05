import { Queue } from "effect";
import { PersistenceService } from "../Persistence.js";

export type PersistencePayload =
  | {
      type: "data";
      id: string;
      data: unknown;
    }
  | {
      type: "streamData";
      id: string;
      data: unknown;
    }
  | {
      type: "error";
      id: string;
      error: unknown;
    };

export class AppContextPersistence {
  constructor(
    private readonly persistence: PersistenceService,
    private readonly persistenceQueue: Queue.Queue<PersistencePayload>
  ) {}
  get(id: string) {
    return this.persistence.get(id);
  }
  set(persistencePayload: PersistencePayload) {
    return this.persistenceQueue.offer(persistencePayload);
  }
}
