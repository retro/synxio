import { Effect, Option, pipe, Function } from "effect";
import { ComponentContext } from "./ComponentContext.js";

export class StateInstance<TState extends AnyState> {
  constructor(
    readonly name: string,
    readonly state: TState
  ) {}
}

export type GetStateInstanceValueType<T> =
  T extends StateInstance<infer U> ? GetStateValueType<U> : never;
export type AnyStateInstance = StateInstance<AnyState>;

export class State<TState> {
  static make<TState>(initFn: () => TState) {
    return new State<TState>(initFn);
  }

  private constructor(readonly initFn: () => TState) {}

  static get<TStateInstance extends AnyStateInstance>(
    stateInstance: TStateInstance
  ) {
    return Effect.gen(function* () {
      const state = stateInstance.state;
      const componentContext = yield* ComponentContext;
      const value = (yield* pipe(
        componentContext.getStateKeyValue(stateInstance.name),
        Effect.map(Option.getOrElse(state.initFn()))
      )) as GetStateInstanceValueType<TStateInstance>;
      return value;
    });
  }

  static update<TStateInstance extends AnyStateInstance>(
    stateInstance: TStateInstance,
    value: GetStateInstanceValueType<TStateInstance>
  ): Effect.Effect<
    GetStateInstanceValueType<TStateInstance>,
    never,
    ComponentContext
  >;
  static update<TStateInstance extends AnyStateInstance>(
    stateInstance: TStateInstance,
    updateFn: (
      value: GetStateInstanceValueType<TStateInstance>
    ) => GetStateInstanceValueType<TStateInstance>
  ): Effect.Effect<
    GetStateInstanceValueType<TStateInstance>,
    never,
    ComponentContext
  >;

  static update<TStateInstance extends AnyStateInstance>(
    stateInstance: TStateInstance,
    value: unknown
  ) {
    const updaterFn = Function.isFunction(value) ? value : () => value;

    return Effect.gen(function* () {
      const componentContext = yield* ComponentContext;
      const value = yield* pipe(
        componentContext.updateAndGetStateKeyValue(
          stateInstance.name,
          (currentValue) => {
            return updaterFn(currentValue);
          }
        ),
        Effect.map((value) =>
          Option.getOrElse(value, () => updaterFn(stateInstance.state.initFn()))
        )
      );
      return value;
    });
  }
}

export type AnyState = State<any>;
export type GetStateValueType<T> = T extends State<infer U> ? U : never;
