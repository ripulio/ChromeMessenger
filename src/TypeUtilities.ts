import { waitForResponse } from "./AsyncResponseDirectory";
import {
  ProxyFunctionCallMessage,
  ProxyMethodCallMessage,
  ProxyStoredFunctionCallMessage,
} from "./MessageTypes";

export type PromisifyNonPromiseMethods<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? R extends Promise<any>
      ? T[K]
      : (...args: A) => Promise<R>
    : T[K];
};

const callbackRegistry = new Map<string, Function>();
export function getCallbackRegistry(): Map<string, Function> {
  return callbackRegistry;
}

type ProxyInfo =
  | { kind: "objectId"; value: string }
  | { kind: "name"; value: string };

export function createObjectWrapper<T>(
  invocationHandler: (functionPath: string[], ...args: any[]) => Promise<any>,
  path: string[],
): PromisifyNonPromiseMethods<T> {
  const handler = {
    get(target: any, prop: string) {
      const newPath = [...path, prop];
      return createObjectWrapper(invocationHandler, newPath);
    },
    apply(target: any, thisArg: any, args: any[]) {
      // Wrap function arguments
      return invocationHandler(path, ...args);
    },
  };

  return new Proxy(function () {}, handler) as PromisifyNonPromiseMethods<T>;
}

const IS_PROXY = Symbol("isProxy");

function isProxy(
  obj: any,
): { objectId: string } | { name: string } | undefined {
  return obj && obj[IS_PROXY];
}

function registerCallback(
  callback: Function,
  callbackRegistry: Map<string, Function>,
): string {
  // Generate a unique ID for this callback
  const callbackId = generateUniqueId();
  // Register the callback with the message handler
  callbackRegistry.set(callbackId, callback);
  // Return an object that represents the callback
  return "__callback__|" + callbackId;
}

export function transformArg(
  arg: any,
  callbackRegistry: Map<string, Function>,
): any {
  switch (typeof arg) {
    case "function":
      return registerCallback(arg, callbackRegistry);
    case "object":
      if (!arg) return arg;
      const proxyInfo = isProxy(arg);
      if (proxyInfo) {
        // Extract the actual ID string from the proxy info object
        const objectId =
          "objectId" in proxyInfo ? proxyInfo.objectId : proxyInfo.name;
        return { type: "objectReference", objectId };
      }
      if (arg.type === "assignment") {
        const proxyInfo = isProxy(arg.value);
        if (proxyInfo) {
          // Extract the actual ID string from the proxy info object
          const objectId =
            "objectId" in proxyInfo ? proxyInfo.objectId : proxyInfo.name;
          return {
            ...arg,
            value: { type: "objectReference", objectId },
          };
        }
      }
      if (Array.isArray(arg)) {
        return arg.map((item) => transformArg(item, callbackRegistry));
      }

      if (arg instanceof Event) {
        (arg as any).eventType = arg.constructor.name;
      }

      const serializeObject = (data: any) => {
        const obj: any = {};
        for (let key in data) {
          if (typeof data[key] === "function") {
            continue;
          }
          obj[key] = data[key];
        }
        return obj;
      };

      const resultArg = Object.fromEntries(
        Object.entries(serializeObject(arg)).map(([key, value]) => [
          key,
          typeof value === "object"
            ? transformArg(value, callbackRegistry)
            : value,
        ]),
      );
      return resultArg;
    default:
      return arg;
  }
}

export function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export {};
