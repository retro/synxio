import { Deferred, Effect, Fiber, ParseResult, Option, FiberMap } from "effect";
import { SqlError } from "@effect/sql";

export interface OpenEndpoint {
  callback: (
    value: unknown
  ) => Effect.Effect<void, ParseResult.ParseError | SqlError.SqlError, never>;
  deferred: Deferred.Deferred<any>;
}

export interface ComponentState {
  name: string;
  id: string;
  parentId: string | null;
  status: "running" | "completed" | "failed";
  state: Record<string, unknown>;
  endpoints: Record<string, string>;
  components: Record<string, string | string[]>;
}

export interface RuntimeContextState {
  openEndpoints: Record<string, OpenEndpoint>;
  components: Record<string, ComponentState>;
}

export function makeRuntimeContextState(): RuntimeContextState {
  return { openEndpoints: {}, components: {} };
}
