import React, { useMemo, useEffect, useCallback } from "react";
import { atom, createStore, useAtom, Provider, useAtomValue } from "jotai";
import invariant from "tiny-invariant";
import { SocialMediaGeneratorApp } from "@repo/synxio-dev-server/app";
import {
  AnyEndpointRef,
  ComponentState,
  ComponentStateForbidden,
  GetEndpointRefValueType,
} from "@repo/core";
import * as jsondiffpatch from "jsondiffpatch";
import { diff_match_patch } from "@dmsnell/diff-match-patch";
import { produce } from "immer";

const jsondiffpatchInstance = jsondiffpatch.create({
  arrays: {
    detectMove: true,
  },
  // @ts-expect-error Original version breaks with surrogate pairs, this is a workaround
  textDiff: { diffMatchPatch: diff_match_patch },
});

const userAuth = "editor";

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
    const initialStoreValue = {
      appId: props.appId,
      components: {},
    };
    const synxioStore = useMemo(() => {
      const store = createStore();
      store.set(synxioValue, initialStoreValue);
      return store;
    }, []);

    useEffect(() => {
      console.log("CONNECTING TO WS", props.appId);
      const socket = new WebSocket(
        `ws://localhost:3000/api/${props.appId}/ws?token=${userAuth}`
      );
      socket.onmessage = (event) => {
        const { type, value } = JSON.parse(event.data);
        if (type === "state") {
          synxioStore.set(synxioValue, {
            appId: props.appId,
            components: value,
          });
        } else if (type === "patch") {
          const currentStoreValue =
            synxioStore.get(synxioValue) ?? initialStoreValue;

          const newValue = produce(currentStoreValue, (draft) => {
            jsondiffpatchInstance.patch(draft.components, value);
          });

          synxioStore.set(synxioValue, newValue);
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

  const useSynxioCallEndpoint = <T extends AnyEndpointRef>(
    endpointRef: T | undefined
  ) => {
    const appId = useAtomValue(synxioValue)?.appId;

    invariant(
      appId,
      "useSynxioCallEndpoint should be used within <Synxio.Provider>"
    );

    const callback = useMemo(() => {
      if (!endpointRef) {
        return null;
      }
      return (payload: GetEndpointRefValueType<T>) => {
        return fetch(
          `http://localhost:3000/api/${appId}/endpoints/${endpointRef}?token=${userAuth}`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
      };
    }, [appId, endpointRef]);

    return callback;
  };

  const SynxioComponent = <TComponentName extends T["components"]["name"]>({
    name,
    id,
    whenRunning,
    whenCompleted,
    whenFailed,
    whenForbidden,
  }: {
    name: TComponentName;
    id?: string;
    whenRunning?: (
      component: Extract<T["components"], { name: TComponentName }> & {
        status: "running";
      }
    ) => React.ReactNode;
    whenCompleted?: (
      component: Extract<T["components"], { name: TComponentName }> & {
        status: "completed";
      }
    ) => React.ReactNode;
    whenFailed?: (
      component: Extract<T["components"], { name: TComponentName }> & {
        status: "failed";
      }
    ) => React.ReactNode;
    whenForbidden?: (
      component: Extract<T["components"], { name: TComponentName }> & {
        status: "forbidden";
      }
    ) => React.ReactNode;
  }) => {
    const component = useSynxio(name, id);

    if (!component) {
      return null;
    }
    const status = component.status;

    if (status === "running") {
      return whenRunning?.(component as any) ?? null;
    }
    if (status === "completed") {
      return whenCompleted?.(component as any) ?? null;
    }
    if (status === "failed") {
      return whenFailed?.(component as any) ?? null;
    }
    if (status === "forbidden") {
      return whenForbidden?.(component as any) ?? null;
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
  makeSynxioApp<SocialMediaGeneratorApp>();
