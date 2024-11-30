import { Effect, type Schema } from "effect";
import { ComponentContext } from "./ComponentContext.js";

export class Endpoint<TEndpointSchema extends Schema.Schema<any, any, never>> {
  private constructor(readonly schema: TEndpointSchema) {}
  static make<TEndpointSchema extends Schema.Schema<any, any, never>>(
    schema: TEndpointSchema
  ) {
    return new Endpoint<TEndpointSchema>(schema);
  }
}

export type AnyEndpoint = Endpoint<Schema.Schema<any, any, never>>;
export type GetEndpointSchemaType<T> =
  T extends Endpoint<infer U> ? Schema.Schema.Type<U> : never;

export function makeOpenEndpoint<TEndpoint extends AnyEndpoint>(
  endpoint: TEndpoint,
  name: string
) {
  return (key: string) =>
    Effect.gen(function* () {
      const componentContext = yield* ComponentContext;
      return yield* componentContext.openEndpoint<
        GetEndpointSchemaType<TEndpoint>
      >(name, key, endpoint.schema);
    });
}

export function endpointIdToUrl(id: string) {
  return id;
}
