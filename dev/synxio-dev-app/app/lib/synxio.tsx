import React, { useMemo, useEffect } from "react";
import { atom, createStore, useAtom, Provider } from "jotai";
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
    const [value] = useAtom(synxioValue);
    if (!value) {
      return null;
    }

    const componentValue = id
      ? value[id]
      : Object.values(value).filter(
          (component) => component.name === componentName
        )[0];
    invariant(componentValue, `Component ${componentName} not found`);

    return componentValue as Extract<T["components"], { name: TComponentName }>;
  };

  return {
    SynxioProvider,
    useSynxio,
  };
}

export const { SynxioProvider, useSynxio } = makeSynxioApp<App>();
