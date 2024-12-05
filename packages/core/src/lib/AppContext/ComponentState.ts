import {
  Effect,
  Ref,
  Option,
  SubscriptionRef,
  Record,
  Struct,
  pipe,
} from "effect";
import { AppContextState } from "./AppContextState.js";

export class AppContextComponentState {
  constructor(
    readonly state: SubscriptionRef.SubscriptionRef<AppContextState>
  ) {}
  set(componentId: string, newState: Record<string, unknown>) {
    return Effect.gen(this, function* () {
      yield* Ref.update(this.state, (state) => {
        return Struct.evolve(state, {
          components: (components) => {
            return Record.modify(components, componentId, (componentState) => {
              return Struct.evolve(componentState, {
                state: () => newState,
              });
            });
          },
        });
      });
    });
  }
  getKeyValue(componentId: string, key: string) {
    return pipe(
      Ref.get(this.state),
      Effect.map((state) =>
        pipe(
          Record.get(state.components, componentId),
          Option.flatMap((componentState) =>
            Record.get(componentState.state, key)
          )
        )
      )
    );
  }
  updateAndGetKeyValue(
    componentId: string,
    key: string,
    updater: (value: unknown) => unknown
  ) {
    return pipe(
      Ref.updateAndGet(this.state, (state) => {
        return Struct.evolve(state, {
          components: (components) => {
            return Record.modify(components, componentId, (componentState) => {
              return Struct.evolve(componentState, {
                state: (state) => Record.modify(state, key, updater),
              });
            });
          },
        });
      }),
      Effect.map((state) =>
        pipe(
          Record.get(state.components, componentId),
          Option.flatMap((componentState) =>
            Record.get(componentState.state, key)
          )
        )
      )
    );
  }
}
