import React, { useMemo, useEffect } from "react";
import { atom, createStore, useAtom, Provider, useAtomValue } from "jotai";
import invariant from "tiny-invariant";
import { App } from "@repo/synxio-dev-server/app";
import { immutableJSONPatch } from "immutable-json-patch";

export function makeSynxioApp<
  T extends { rootName: string; components: any },
>() {
  const synxioValue = atom<T["components"] | null>(null);

  const SynxioProvider = (props: { children: React.ReactNode }) => {
    const synxioStore = useMemo(() => {
      const store = createStore();
      store.set(synxioValue, null);
      return store;
    }, []);

    useEffect(() => {
      const socket = new WebSocket("ws://localhost:3000/api/ws");
      socket.onmessage = (event) => {
        const { type, value } = JSON.parse(event.data);
        if (type === "state") {
          synxioStore.set(synxioValue, value);
        } else if (type === "patch") {
          const currentValue = synxioStore.get(synxioValue);
          if (currentValue) {
            synxioStore.set(
              synxioValue,
              immutableJSONPatch(currentValue, value)
            );
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
          return id
            ? value[id]
            : Object.values(value).filter(
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
  };
}

export const { Synxio, useSynxio } = makeSynxioApp<App>();
