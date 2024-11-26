import { createProxyObjectForSandboxContext } from "./CreateProxyObjectForSandboxContext";
import { waitForResponse } from "./CreateSandboxDynamicCodeServer";

type Primitive = string | number | boolean | null | undefined;
export type Function = (...args: any[]) => unknown;

export type ApiWrapper<T> = {
  [K in keyof T]: T[K] extends Function
    ? (...args: Parameters<T[K]>) => ReturnType<T[K]>
    : T[K] extends Primitive
    ? T[K]
    : ApiWrapper<T[K]>;
};

function handleAsyncIteration(path: string[], callbackRegistry: Map<string, Function>, objectId: string | undefined, data: any) {
  return async function* () {
    const getNext = async () => {
      const correlationId = generateUniqueId();
      const message = {
        correlationId: correlationId,
        messageType: "ProxyInvocation",
        functionPath: ["getNext"],
        objectId: objectId,
        payload: [],
        source: "sandbox",
        destination: "content"
      };

      window.parent.postMessage(message, "*");

      const {raw} = await waitForResponse<any>(correlationId);

      objectId = raw.data.iteratorId;

      return {
        value: createProxyObjectForSandboxContext(
          callbackRegistry,
          raw.data.objectId,
          raw.data
        ),
        done: raw.data.done,
      };
    };
    let done = false;
    while (!done){
      const { value, done: nowDone } = await getNext();
      done = nowDone;
      yield value;
    }
  };
}

export function createObjectWrapperWithCallbackRegistry<T>(
  path: string[],
  callbackRegistry: Map<string, Function>,
  iteratorId?: string,
  objectId?: string,
  data?: any
): T {
  const handler = {
    get(target: any, prop: string) {
      if (prop === "isProxy"){
        return objectId;
      }
      if (typeof prop === "symbol") {
        if (prop === IS_PROXY) {
          return objectId;
        }

        if (prop === Symbol.asyncIterator || prop === Symbol.iterator) {
          return () => createObjectWrapperWithCallbackRegistry(path, callbackRegistry, iteratorId, objectId, data);
        }
      }

      const newPath = [...path, prop];

      if (prop === "then") {
        console.error("then called directly on object in get trap", newPath);
        return undefined;
      }

      if (data && data[prop] && typeof data[prop] !== "object") {
        console.error("Returning data", newPath, data[prop]);
        return () => Promise.resolve(data[prop]);
      }

      return (...args: any[]): Promise<any> => {

        if (typeof prop === "symbol" && prop === Symbol.asyncIterator) {
          return Promise.resolve(handleAsyncIteration(path, callbackRegistry, objectId, data));
        }

        if (typeof prop === "symbol" && prop === Symbol.iterator) {
          console.error("iterator called directly on object in get trap", newPath);
          return Promise.resolve(undefined);
        }

        const wrappedArgs = args.map((arg) =>
          transformArg(arg, callbackRegistry)
        );

        return functionInvocationHandler(
          path,
          prop as keyof T,
          objectId,
          ...wrappedArgs
        );
      };
    }
  };

  return new Proxy({ [IS_PROXY]: true } as T, handler) as unknown as T;
}

const IS_PROXY = Symbol("isProxy");

function isProxy(obj: any): string | undefined {
  return obj[IS_PROXY];
}

async function functionInvocationHandler<T>(
  functionPath: string[],
  node: keyof T,
  objectId: string | undefined,
  ...args: any[]
): Promise<T[keyof T]> {
  if (node === "then") {
    console.error(
      "then called directly on object in function invocation trap",
      [...functionPath, node]
    );
  }
  const correlationId = generateUniqueId();

  const message = {
    correlationId: correlationId,
    messageType: "ProxyInvocation",
    functionPath: [...functionPath, node],
    objectId: objectId,
    payload: args,
    source: "sandbox",
    destination: "content",
  };

  for (const key in message.payload) {
    // Convert functions to strings to avoid serialization issues
    if (typeof message.payload[key] === "function") {
      console.error("Transforming argument", key, message.payload[key]);
      message.payload[key] = message.payload[key].toString();
      continue;
    }
  }

  console.log(`Sending message: ${JSON.stringify(message)}`);
  try {
    window.parent.postMessage(message, "*");
  } catch (e) {
    console.error("Error sending message", e);
  }

  const response = await waitForResponse<T>(correlationId);
  return response.proxy;
}

export function createFunctionWrapperWithCallbackRegistry<T>(
  functionPath: string[],
  node: keyof T,
  callbackRegistry: Map<string, Function>
): Function {
  const handler = {
    apply(target: any, thisArg: any, args: any[]) {
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
      );
      return functionInvocationHandler(
        functionPath,
        node,
        undefined,
        ...wrappedArgs
      );
    },
  };
  return new Proxy(function () {}, handler) as Function;
}

export function createObjectWrapper<T>(
  invocationHandler: (functionPath: string[], ...args: any[]) => any,
  path: string[]
): T {
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

  return new Proxy(function () {}, handler) as T;
}

function wrapCallback(
  callback: Function,
  callbackRegistry: Map<string, Function>
): string {
  // Generate a unique ID for this callback
  const callbackId = generateUniqueId();
  // Register the callback with the message handler
  callbackRegistry.set(callbackId, callback);
  // Return an object that represents the callback
  return "__callback__|" + callbackId;
}

function generateUniqueId(): string {
  return Math.random().toString(36).slice(2, 11);
}

type PromisifyFunction<T> = T extends (...args: infer A) => infer R
  ? R extends Promise<any>
    ? T
    : (...args: A) => Promise<R>
  : never;

type PromisifyProperty<T> = T extends Function
  ? PromisifyFunction<T>
  : T extends object
  ? PromiseWrapNamespace<T>
  : Promise<T>;

type PromiseWrapNamespace<T> = {
  [K in keyof T as `ripul_${string & K}`]: PromisifyProperty<T[K]>;
};

function transformArg(arg: any, callbackRegistry: Map<string, Function>): any {
  switch (typeof arg) {
    case "function":
      return wrapCallback(arg, callbackRegistry);
    case "object":
      if (!arg) return arg;
      const objectId = isProxy(arg);
      if (objectId) {
        return { type: "objectReference", objectId };
      }
      if (arg.type === "assignment") {
        const objectId = isProxy(arg.value);
        if (objectId) {
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
        ])
      );
      return resultArg;
    default:
      return arg;
  }
}

export {};
