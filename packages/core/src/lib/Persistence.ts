import { Effect, Context, Option, pipe } from "effect";
import v8 from "node:v8";
import { SqliteClient } from "@effect/sql-sqlite-node";

export class PersistenceService {
  static makeLive() {
    return Effect.gen(function* () {
      const sql = yield* SqliteClient.make({
        filename: "./tmp/db.sqlite",
      });

      yield* sql`CREATE TABLE IF NOT EXISTS persistence (id TEXT PRIMARY KEY UNIQUE, data BLOB NOT NULL)`;

      return new PersistenceService(sql);
    });
  }

  constructor(readonly sql: SqliteClient.SqliteClient) {}
  get(id: string) {
    return Effect.gen(this, function* () {
      const result = yield* this
        .sql`SELECT data FROM persistence WHERE id = ${id}`;
      const data = result[0]?.data;

      return pipe(
        Option.fromNullable(data),
        Option.map((data) => v8.deserialize(data as Uint8Array))
      );
    });
  }
  set(id: string, data: unknown) {
    return Effect.gen(this, function* () {
      const serialized = new Uint8Array(v8.serialize(data));
      yield* this
        .sql`INSERT OR REPLACE INTO persistence (id, data) VALUES (${id}, ${serialized})`;
    });
  }
}

export class Persistence extends Context.Tag("@synxio/Persistence")<
  Persistence,
  InstanceType<typeof PersistenceService>
>() {}
