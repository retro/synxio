import { Context, Effect, Record } from "effect";
import {
  type AnyEndpoint,
  type GetEndpointSchemaType,
  makeOpenEndpoint,
} from "./Endpoint.js";
import {
  StateInstance,
  type AnyState,
  type GetStateValueType,
} from "./State.js";
import { ComponentContext } from "./ComponentContext.js";
import type { Simplify } from "effect/Types";

type ComponentConfigEndpoints = Record<string, AnyEndpoint>;
type ComponentConfigState = Record<string, AnyState>;

function makeComponentMount<TComponent extends AnyComponent>(
  mountedOnProperty: string,
  component: TComponent
) {
  return (payload: GetComponentPayload<TComponent>) =>
    Effect.gen(function* () {
      const componentContextService = yield* ComponentContext;
      return yield* componentContextService.mount(
        component,
        {
          type: "singleton",
          parentMountedOnProperty: mountedOnProperty,
        },
        payload
      );
    });
}

function makeComponentListMount<TComponentList extends AnyComponentList>(
  mountedOnProperty: string,
  componentList: TComponentList
) {
  return (
    key: string | number,
    payload: GetComponentPayload<GetComponentListComponent<TComponentList>>
  ) =>
    Effect.gen(function* () {
      const componentContextService = yield* ComponentContext;
      const component =
        componentList.component as GetComponentListComponent<TComponentList>;
      return yield* componentContextService.mount(
        component,
        {
          type: "list",
          parentMountedOnProperty: mountedOnProperty,
          key,
        },
        payload
      );
    });
}

export type ComponentConfig<
  TEndpoints extends ComponentConfigEndpoints,
  TState extends ComponentConfigState,
  TComponents extends Record<string, AnyComponent | AnyComponentList>,
> = {
  endpoints: TEndpoints;
  state: TState;
  components: TComponents;
};

export type AnyComponentConfig = ComponentConfig<
  Record<string, AnyEndpoint>,
  Record<string, AnyState>,
  Record<string, AnyComponent | AnyComponentList>
>;

type StateConfigToStateApi<TStateConfig extends Record<string, AnyState>> = {
  [TKey in keyof TStateConfig]: StateInstance<TStateConfig[TKey]>;
};

type EndpointsConfigToEndpointApi<
  TEndpointConfig extends Record<string, AnyEndpoint>,
> = {
  [TKey in keyof TEndpointConfig]: ReturnType<
    typeof makeOpenEndpoint<TEndpointConfig[TKey]>
  >;
};

type ComponentsConfigToComponentApi<
  TComponentConfig extends Record<string, AnyComponent | AnyComponentList>,
> = {
  [TKey in keyof TComponentConfig]: TComponentConfig[TKey] extends AnyComponent
    ? ReturnType<typeof makeComponentMount<TComponentConfig[TKey]>>
    : TComponentConfig[TKey] extends AnyComponentList
      ? ReturnType<typeof makeComponentListMount<TComponentConfig[TKey]>>
      : never;
};

type ComponentConfigToComponentApi<
  TComponentConfig extends AnyComponentConfig,
> = {
  state: StateConfigToStateApi<TComponentConfig["state"]>;
  endpoints: EndpointsConfigToEndpointApi<TComponentConfig["endpoints"]>;
  components: ComponentsConfigToComponentApi<TComponentConfig["components"]>;
};

type AnyComponentHandler = (
  api: any,
  payload: any
) => Effect.Effect<any, any, any>;

export interface ComponentApiId<_TComponentName extends string> {
  readonly _: unique symbol;
}

export class ComponentSetup<
  TComponentName extends string,
  TComponentConfig extends AnyComponentConfig,
> {
  readonly Api = this.apiTag();

  constructor(
    readonly name: TComponentName,
    readonly config: TComponentConfig
  ) {}
  private apiTag() {
    return Context.GenericTag<
      ComponentApiId<TComponentName>,
      ComponentConfigToComponentApi<TComponentConfig>
    >(`@synxio/ComponentApi/${this.name}`);
  }
  build<
    THandlerPayload,
    THandler extends (
      api: ComponentConfigToComponentApi<TComponentConfig>,
      payload: THandlerPayload
    ) => Effect.Effect<any, any, any>,
  >(handler: THandler) {
    return new Component<
      ComponentSetup<TComponentName, TComponentConfig>,
      THandlerPayload,
      Effect.Effect.Success<ReturnType<THandler>>,
      Effect.Effect.Error<ReturnType<THandler>>,
      Effect.Effect.Context<ReturnType<THandler>>
    >(this, handler);
  }
  getInitialState() {
    const stateConfig = this.config.state;
    return Record.map(stateConfig, (value) => value.initFn()) as Record<
      string,
      unknown
    >;
  }
  getLiveApi() {
    return Effect.gen(this, function* () {
      const state = Record.mapEntries(this.config.state, (value, key) => [
        key,
        new StateInstance(key, value),
      ]) as StateConfigToStateApi<TComponentConfig["state"]>;

      const endpoints = Record.mapEntries(
        this.config.endpoints,
        (value, key) => [key, makeOpenEndpoint(value, key)]
      ) as EndpointsConfigToEndpointApi<TComponentConfig["endpoints"]>;

      const components = Record.mapEntries(
        this.config.components,
        (value, key) => [
          key,
          value instanceof ComponentList
            ? makeComponentListMount(key, value)
            : makeComponentMount(key, value),
        ]
      ) as ComponentsConfigToComponentApi<TComponentConfig["components"]>;

      return { state, endpoints, components };
    });
  }
}

export type AnyComponentSetup = ComponentSetup<any, any>;

export class Component<
  TComponentSetup extends ComponentSetup<any, any>,
  TComponentHandlerPayload,
  TComponentHandlerA,
  TComponentHandlerE,
  TComponentHandlerR,
> {
  static setup<
    TComponentName extends string,
    TComponentConfig extends AnyComponentConfig,
  >(name: TComponentName, config: TComponentConfig) {
    return new ComponentSetup<TComponentName, TComponentConfig>(name, config);
  }

  readonly List = new ComponentList<this>(this);

  constructor(
    readonly setup: TComponentSetup,
    readonly handler: AnyComponentHandler
  ) {}

  mount(payload: TComponentHandlerPayload) {
    const Api = this.setup.Api;
    return Effect.gen(this, function* () {
      // TODO: Figure out why inference fails here
      const api = yield* this.setup.getLiveApi();
      const handlerEffect = this.handler(api, payload) as Effect.Effect<
        TComponentHandlerA,
        TComponentHandlerE,
        TComponentHandlerR
      >;
      return yield* Effect.provideService(handlerEffect, Api, api);
    });
  }
}

export type AnyComponent = Component<any, any, any, any, any>;
export type GetComponentPayload<TComponent extends AnyComponent> =
  TComponent extends Component<any, infer P, any, any, any> ? P : never;
export type GetComponentSuccess<TComponent extends AnyComponent> =
  TComponent extends Component<any, any, infer A, any, any> ? A : never;
export type GetComponentError<TComponent extends AnyComponent> =
  TComponent extends Component<any, any, any, infer E, any> ? E : never;
export type GetComponentContext<TComponent extends AnyComponent> =
  TComponent extends Component<infer C, any, any, any, any> ? C : never;

export class ComponentList<TComponent extends AnyComponent> {
  constructor(readonly component: TComponent) {}
}
export type AnyComponentList = ComponentList<AnyComponent>;
export type GetComponentListComponent<TComponentList extends AnyComponentList> =
  TComponentList extends ComponentList<infer C> ? C : never;

export type GetAppType<T extends AnyComponent> = {
  rootName: T["setup"]["name"];
  components: GetComponentTreeType<T>;
};

export type GetComponentTreeType<T extends AnyComponent> =
  | GetComponentType<T>
  | {
      [K in keyof GetComponentSetupConfig<
        T["setup"]
      >["components"]]: GetComponentSetupConfig<
        T["setup"]
      >["components"][K] extends AnyComponent
        ? GetComponentTreeType<
            GetComponentSetupConfig<T["setup"]>["components"][K]
          >
        : GetComponentSetupConfig<
              T["setup"]
            >["components"][K] extends AnyComponentList
          ? GetComponentTreeType<
              GetComponentListComponent<
                GetComponentSetupConfig<T["setup"]>["components"][K]
              >
            >
          : never;
    }[keyof GetComponentSetupConfig<T["setup"]>["components"]];

export type GetComponentType<T extends AnyComponent> =
  | Simplify<{
      name: T["setup"]["name"];
      id: string;
      parentId: string | null;
      status: "running" | "completed" | "failed";
      state: GetComponentStateType<T["setup"]>;
      endpoints: GetComponentEndpointsType<T["setup"]>;
      components: GetComponentComponentsType<T["setup"]>;
    }>
  | {
      name: T["setup"]["name"];
      id: string;
      parentId: string | null;
      status: "forbidden";
    };

export type GetComponentSetupConfig<T> =
  T extends ComponentSetup<any, infer C> ? C : never;

export type GetComponentStateType<T extends AnyComponentSetup> = Simplify<{
  [TKey in keyof GetComponentSetupConfig<T>["state"]]: GetStateValueType<
    GetComponentSetupConfig<T>["state"][TKey]
  >;
}>;

export type EndpointRef<T> = string & {
  readonly _tag: unique symbol;
  readonly _type: T;
};
export type AnyEndpointRef = EndpointRef<any>;
export type GetEndpointRefValueType<T> =
  T extends EndpointRef<infer U> ? U : never;

export type GetComponentEndpointsType<T extends AnyComponentSetup> = Simplify<{
  [TKey in keyof GetComponentSetupConfig<T>["endpoints"]]: EndpointRef<
    GetEndpointSchemaType<GetComponentSetupConfig<T>["endpoints"][TKey]>
  >;
}>;

export type ComponentRef<_T> = string & { readonly _tag: unique symbol };

export type GetComponentComponentsType<T extends AnyComponentSetup> = Simplify<{
  [TKey in keyof GetComponentSetupConfig<T>["components"]]?: GetComponentSetupConfig<T>["components"][TKey] extends AnyComponent
    ? ComponentRef<
        GetComponentSetupConfig<T>["components"][TKey]["setup"]["name"]
      >
    : GetComponentSetupConfig<T>["components"][TKey] extends AnyComponentList
      ? ComponentRef<
          GetComponentListComponent<
            GetComponentSetupConfig<T>["components"][TKey]
          >["setup"]["name"]
        >[]
      : never;
}>;

export type GetAppComponentsPayloads<T extends AnyComponent> =
  | GetAppComponentPayload<T>
  | {
      [K in keyof GetComponentSetupConfig<
        T["setup"]
      >["components"]]: GetComponentSetupConfig<
        T["setup"]
      >["components"][K] extends AnyComponent
        ? GetAppComponentsPayloads<
            GetComponentSetupConfig<T["setup"]>["components"][K]
          >
        : GetComponentSetupConfig<
              T["setup"]
            >["components"][K] extends AnyComponentList
          ? GetAppComponentsPayloads<
              GetComponentListComponent<
                GetComponentSetupConfig<T["setup"]>["components"][K]
              >
            >
          : never;
    }[keyof GetComponentSetupConfig<T["setup"]>["components"]];

export type GetAppComponentPayload<T extends AnyComponent> = {
  name: T["setup"]["name"];
  payload: Parameters<T["mount"]>[0];
};
