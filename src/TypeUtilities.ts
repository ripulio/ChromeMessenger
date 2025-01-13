import { waitForResponse } from "./AsyncResponseDirectory";

type Primitive = string | number | boolean | null | undefined;
export type Function = (...args: any[]) => unknown;

export type ApiWrapper<T> = {
  [K in keyof T]: T[K] extends Function
    ? (...args: Parameters<T[K]>) => ReturnType<T[K]>
    : T[K] extends Primitive
    ? T[K]
    : ApiWrapper<T[K]>;
};

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

export function createObjectWrapperWithCallbackRegistry<T>(
  path: string[],
  callbackRegistry: Map<string, Function>,
  iteratorId?: string,
  objectId?: string,
  data?: any
): T {
  const handler = {
    get(target: any, prop: any) {
      if (propIsProxy(prop)) {
        return objectId;
      }
      if (typeof prop === "symbol") {
        if (prop === Symbol.iterator || prop === Symbol.asyncIterator) {
          return handleAsyncIteration(iteratorId);
        }
        if (prop === Symbol.toStringTag) {
          console.error("toStringTag called directly on object in get trap");
          return data.toString();
        }
        if (prop === Symbol.toPrimitive) {
          return (hint: string) => (hint === "number" ? data : data.toString());
        }
      }

      if (prop === "toString") {
        console.error("toString called directly on object in get trap");
        return () => data.toString();
      }

      if (prop === "valueOf") {
        console.error("valueOf called directly on object in get trap");
        return () => data.valueOf();
      }

      if (prop === "toPrimitive") {
        console.error("toPrimitive called directly on object in get trap");
        return (hint: string) => (hint === "number" ? data : data.toString());
      }

      if (prop === "then") {
        console.error("then called directly on object in get trap", [
          ...path,
          prop,
        ]);
        return undefined;
      }

      return createFunctionProxy(
        prop,
        path,
        callbackRegistry,
        (prop === "done" || prop === "next") && iteratorId
          ? iteratorId
          : objectId,
        data
      );
    },
    apply(target: any, thisArg: any, args: any[]) {
      console.error("apply called on object in get trap", thisArg);
      return undefined;
    },
    [Symbol.toStringTag]: () => data.toString(),
    toString: () => data.toString(),
    valueOf: () => data.valueOf(),
    [Symbol.toPrimitive]: (hint: string) => {
      // hint can be 'number', 'string', or 'default'
      return hint === "number" ? data : data.toString();
    },
  };

  return new Proxy(
    {
      [IS_PROXY]: true,
      [Symbol.toStringTag]: data?.toString(),
      [Symbol.toPrimitive]: (hint: string) =>
        hint === "number" ? data : data.toString(),
    } as T,
    handler
  ) as unknown as T;
}

export function createFunctionWrapperWithCallbackRegistry<T>(
  functionPath: string[],
  node: keyof T,
  callbackRegistry: Map<string, Function>
): Function {
  const handler = {
    apply(target: any, thisArg: any, args: any[]) {
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function"
          ? registerCallback(arg, callbackRegistry)
          : arg
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
  invocationHandler: (functionPath: string[], ...args: any[]) => Promise<any>,
  path: string[]
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

function createFunctionProxy(
  prop: any,
  path: string[],
  callbackRegistry: Map<string, Function>,
  objectId: string | undefined,
  data: any
) {
  return new Proxy(function () {}, {
    apply(target: any, thisArg: any, args: any[]) {
      if (typeof prop === "symbol" && prop === Symbol.asyncIterator) {
        return handleAsyncIteration(objectId);
      }

      if (typeof prop === "symbol" && prop === Symbol.iterator) {
        console.error("iterator called directly on object in apply trap", [
          ...path,
          prop,
        ]);
        return Promise.resolve(undefined);
      }

      if (
        data &&
        data[prop] &&
        typeof data[prop] !== "object" &&
        args.length === 0
      ) {
        //console.error("Returning data", [...path, prop], data[prop]);
        //return Promise.resolve(data[prop]);
      }

      const wrappedArgs = args.map((arg) =>
        transformArg(arg, callbackRegistry)
      );

      return functionInvocationHandler(path, prop, objectId, ...wrappedArgs);
    },
    get(target: any, prop: any) {
      if (propIsProxy(prop)) {
        return true;
      }
    }
  });
}

const IS_PROXY = Symbol("isProxy");

function propIsProxy(prop: string) {
  return prop === "isProxy" || (typeof prop === "symbol" && prop === IS_PROXY);
}

function isProxy(obj: any): string | undefined {
  return obj && obj[IS_PROXY];
}

function handleAsyncIteration(objectId: string | undefined) {
  return async function* () {
    const getNext = async () => {
      const correlationId = generateUniqueId();
      const message = {
        correlationId: correlationId,
        messageType: "ProxyInvocation",
        functionPath: ["next"],
        objectId: objectId,
        payload: [],
        source: "sandbox",
        destination: "content",
      };

      window.parent.postMessage(message, "*");

      const { proxy, raw } = await waitForResponse<any>(correlationId);

      const done = raw.data.deserializeData
        ? JSON.parse(raw.data).done
        : raw.data.done;
      return {
        value: proxy,
        done: done,
      };
    };
    let done = false;
    while (!done) {
      const { value, done: nowDone } = await getNext();
      done = nowDone;
      if (done) {
        return;
      }
      yield await value.value();
    }
  };
}

async function functionInvocationHandler<T>(
  functionPath: string[],
  prop: any,
  objectId: string | undefined,
  ...args: any[]
): Promise<T[keyof T]> {
  if (prop === "then") {
    console.error(
      "then called directly on object in function invocation trap",
      [...functionPath, prop]
    );
  }
  const correlationId = generateUniqueId();

  const message = {
    correlationId: correlationId,
    messageType: "ProxyInvocation",
    functionPath: [...functionPath, prop],
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

function registerCallback(
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

export function transformArg(arg: any, callbackRegistry: Map<string, Function>): any {
  switch (typeof arg) {
    case "function":
      return registerCallback(arg, callbackRegistry);
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

export function generateUniqueId(): string {
  return Math.random().toString(36).substring(2, 11);
}

export {};
