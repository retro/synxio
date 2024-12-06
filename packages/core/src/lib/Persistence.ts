import { Effect, Context, Option, pipe, Schema, Either } from "effect";
import v8 from "node:v8";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Reactivity } from "@effect/experimental";

export type PersistenceInputStreamDataPayload = {
  type: "streamData";
  id: string;
  parentId: string;
  payload: unknown;
};

export type PersistenceInputPayload =
  | {
      type: "data";
      id: string;
      payload: unknown;
    }
  | PersistenceInputStreamDataPayload
  | {
      type: "streamDone";
      id: string;
    }
  | {
      type: "error";
      id: string;
      payload: unknown;
    };

const PersistenceOutputPayload = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("data"),
    id: Schema.String,
    payload: Schema.Unknown,
    position: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("streamData"),
    id: Schema.String,
    parentId: Schema.String,
    payload: Schema.Unknown,
    position: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("streamDone"),
    id: Schema.String,
    position: Schema.Number,
  }),
  Schema.Struct({
    type: Schema.Literal("error"),
    id: Schema.String,
    payload: Schema.Unknown,
    position: Schema.Number,
  })
);

const persistenceOutputPayloadDecoder = Schema.decodeUnknownEither(
  PersistenceOutputPayload
);

export class PersistenceService {
  static makeLive(appId: string) {
    return Effect.gen(function* () {
      const sql = yield* SqliteClient.make({
        filename: `./tmp/db.sqlite`,
      }).pipe(Effect.provide(Reactivity.layer));

      yield* sql`\
CREATE TABLE IF NOT EXISTS persistence (
  appId TEXT NOT NULL, 
  parentId TEXT,
  id TEXT NOT NULL, 
  fullId TEXT PRIMARY KEY UNIQUE,
  position INTEGER NOT NULL, 
  type TEXT NOT NULL,
  payload BLOB
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
      const result = (yield* this
        .sql`SELECT appId, id, parentId, position, type, payload FROM persistence WHERE id = ${id} AND appId = ${this.appId}`)[0];

      return this.parsePersistedPayload(result);
    });
  }
  getAfter(id: string) {
    return Effect.gen(this, function* () {
      const result = (yield* this.sql`\
SELECT appId, id, parentId, position, type, payload 
FROM persistence 
WHERE appId = ${this.appId} AND position > (SELECT position FROM persistence WHERE appId = ${this.appId} AND id = ${id}) 
ORDER BY position ASC LIMIT 1
      `)[0];

      return this.parsePersistedPayload(result);
    });
  }
  private parsePersistedPayload(result: unknown) {
    return pipe(
      Option.fromNullable(result),
      Option.flatMap((result) =>
        pipe(
          persistenceOutputPayloadDecoder(result),
          Either.match({
            onLeft: () => Option.none(),
            onRight: (value) => Option.some(value),
          })
        )
      ),
      Option.map((value) => ({
        ...value,
        payload:
          "payload" in value
            ? value.payload
              ? v8.deserialize(value.payload as Uint8Array)
              : null
            : null,
      }))
    );
  }
  set(input: PersistenceInputPayload) {
    return Effect.gen(this, function* () {
      const fullId = `${this.appId}/${input.id}`;
      const serialized =
        "payload" in input
          ? input.payload
            ? new Uint8Array(v8.serialize(input.payload))
            : null
          : null;

      yield* this.sql`\
INSERT OR REPLACE INTO persistence (appId, id, fullId, parentId, position, type, payload) 
VALUES (
  ${this.appId}, 
  ${input.id},
  ${fullId}, 
  ${"parentId" in input ? input.parentId : null},
  coalesce((SELECT MAX(position) FROM persistence WHERE appId = ${this.appId}), 0) + 1, 
  ${input.type},
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
