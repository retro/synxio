import React, { useMemo, useEffect, useCallback } from "react";
import { atom, createStore, useAtom, Provider, useAtomValue } from "jotai";
import invariant from "tiny-invariant";
import { App } from "@repo/synxio-dev-server/app";
import { immutableJSONPatch } from "immutable-json-patch";
import { AnyEndpointRef, GetEndpointRefValueType } from "@repo/core";

export function makeSynxioApp<
  T extends { rootName: string; components: Record<string, any> },
>() {
  const synxioValue = atom<{
    components: T["components"];
    appId: string;
  } | null>(null);

  const SynxioProvider = (props: {
    children: React.ReactNode;
    appId: string;
  }) => {
    const synxioStore = useMemo(() => {
      const store = createStore();
      store.set(synxioValue, {
        appId: props.appId,
        components: {},
      });
      return store;
    }, []);

    useEffect(() => {
      const socket = new WebSocket(`ws://localhost:3000/api/${props.appId}/ws`);
      socket.onmessage = (event) => {
        const { type, value } = JSON.parse(event.data);
        if (type === "state") {
          synxioStore.set(synxioValue, {
            appId: props.appId,
            components: value,
          });
        } else if (type === "patch") {
          const currentComponents = synxioStore.get(synxioValue)?.components;
          if (currentComponents) {
            const newValue = immutableJSONPatch(
              currentComponents,
              value
            ) as Record<string, any>;
            synxioStore.set(synxioValue, {
              appId: props.appId,
              components: newValue,
            });
          }
        }
      };
      return () => {
        socket.close();
      };
    }, []);
    return <Provider store={synxioStore}>{props.children}</Provider>;
  };

  const useSynxio = <TComponentName extends T["components"]["name"]>(
    componentName: TComponentName & string,
    id?: string
  ) => {
    const valueAtom = useMemo(
      () =>
        atom<T["components"] | null>((get) => {
          const value = get(synxioValue);

          if (!value) {
            return null;
          }

          const components = value.components;

          return id
            ? components[id]
            : Object.values(components).filter(
                (component) => component.name === componentName
              )[0];
        }),
      [componentName, id]
    );

    const componentValue = useAtomValue(valueAtom);

    if (!componentValue) {
      return null;
    }

    invariant(componentValue, `Component ${componentName} not found`);

    return componentValue as Extract<T["components"], { name: TComponentName }>;
  };

  const useSynxioCallEndpoint = <T extends AnyEndpointRef>(endpointRef: T) => {
    const appId = useAtomValue(synxioValue)?.appId;

    invariant(
      appId,
      "useSynxioCallEndpoint should be used within <Synxio.Provider>"
    );

    const callback = useCallback(
      (payload: GetEndpointRefValueType<T>) => {
        return fetch(
          `http://localhost:3000/api/${appId}/endpoints/${endpointRef}`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
      },
      [appId, endpointRef]
    );

    return callback;
  };

  const SynxioComponent = <TComponentName extends T["components"]["name"]>({
    name,
    id,
    whenRunning,
    whenCompleted,
    whenFailed,
  }: {
    name: TComponentName;
    id?: string;
    whenRunning?: (
      component: Extract<T["components"], { name: TComponentName }>
    ) => React.ReactNode;
    whenCompleted?: (
      component: Extract<T["components"], { name: TComponentName }>
    ) => React.ReactNode;
    whenFailed?: (
      component: Extract<T["components"], { name: TComponentName }>
    ) => React.ReactNode;
  }) => {
    const component = useSynxio(name, id);
    if (!component) {
      return null;
    }
    const status = component.status;

    if (status === "running") {
      return whenRunning?.(component) ?? null;
    }
    if (status === "completed") {
      return whenCompleted?.(component) ?? null;
    }
    if (status === "failed") {
      return whenFailed?.(component) ?? null;
    }
    return null;
  };

  return {
    Synxio: {
      Provider: SynxioProvider,
      Component: SynxioComponent,
    },
    useSynxio,
    useSynxioCallEndpoint,
  };
}

export const { Synxio, useSynxio, useSynxioCallEndpoint } =
  makeSynxioApp<App>();
