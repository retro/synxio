import { Effect, Context, Option, pipe } from "effect";
import v8 from "node:v8";
import { SqliteClient } from "@effect/sql-sqlite-node";

export class PersistenceService {
  static makeLive(appId: string) {
    return Effect.gen(function* () {
      const sql = yield* SqliteClient.make({
        filename: `./tmp/db.sqlite`,
      });

      yield* sql`\
CREATE TABLE IF NOT EXISTS persistence (
  appId TEXT NOT NULL, 
  id TEXT PRIMARY KEY UNIQUE, 
  position INTEGER NOT NULL, 
  data BLOB NOT NULL
)`;

      return new PersistenceService(appId, sql);
    });
  }

  constructor(
    readonly appId: string,
    readonly sql: SqliteClient.SqliteClient
  ) {}
  get(id: string) {
    return Effect.gen(this, function* () {
      const fullId = `${this.appId}/${id}`;
      const result = yield* this
        .sql`SELECT data FROM persistence WHERE id = ${fullId}`;
      const data = result[0]?.data;

      return pipe(
        Option.fromNullable(data),
        Option.map((data) => v8.deserialize(data as Uint8Array))
      );
    });
  }
  set(id: string, data: unknown) {
    return Effect.gen(this, function* () {
      const fullId = `${this.appId}/${id}`;
      const serialized = new Uint8Array(v8.serialize(data));
      yield* this.sql`\
INSERT OR REPLACE INTO persistence (appId, id, position, data) 
VALUES (
  ${this.appId}, 
  ${fullId}, 
  coalesce((SELECT MAX(position) FROM persistence WHERE appId = ${this.appId}), 0) + 1, 
  ${serialized}
)
        `.pipe(
        Effect.catchTag("SqlError", (value) =>
          Effect.gen(function* () {
            console.log(value.message);
            console.log(value.cause);
            yield* Effect.die(value);
          })
        )
      );
    });
  }
}

export class Persistence extends Context.Tag("@synxio/Persistence")<
  Persistence,
  InstanceType<typeof PersistenceService>
>() {}
