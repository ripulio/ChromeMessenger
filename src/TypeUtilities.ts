import { waitForResponse } from "./SandboxDynamicCodeServer";

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

export function createCallbackRegistry(): Map<string, Function> {
  return new Map<string, Function>();
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

      if (prop === "__setProp") {
        return (property: string, value: any) => {
          return propertyAssignmentHandler(
            callbackRegistry,
            property,
            value,
            objectId,
            path[0]
          );
        };
      }

      if (prop === "__compare"){
        return (comparison: {value: any, operatorKind: number}) => {
          return comparisonHandler(comparison, objectId, callbackRegistry);
        }
      }

      return propertyAccessHandler(prop, objectId, path[0]);
    },
    apply(target: any, thisArg: any, args: any[]) {
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function"
          ? registerCallback(arg, callbackRegistry)
          : arg
      );
      return functionInvocationHandler(
        path[0],
        objectId,
        callbackRegistry,
        ...wrappedArgs
      );
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

export function createFunctionWrapperWithCallbackRegistry(
  functionName: string | undefined,
  callbackRegistry: Map<string, Function>,
  objectId?: string
): Function {
  const handler = {
    get(target: any, prop: any) {
      if (prop === "isProxy") {
        return true;
      }
    },
    apply(target: any, thisArg: any, args: any[]) {
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function"
          ? registerCallback(arg, callbackRegistry)
          : arg
      );
      return functionInvocationHandler(
        functionName,
        objectId,
        callbackRegistry,
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

export type PropertyAccessMessage = {
  correlationId: string;
  messageType: "propertyAccess";
  propertyName: string;
  source: "sandbox" | "content";
  destination: "sandbox" | "content";
  objectId?: string | undefined;
  objectName?: string | undefined;
};

async function propertyAccessHandler(
  prop: any,
  objectId: string | undefined,
  objectName?: string | undefined
): Promise<any> {
  if (prop === "then") {
    console.error(
      "then called directly on object in function invocation trap",
      [objectId, prop]
    );
  }
  const correlationId = generateUniqueId();

  const message: PropertyAccessMessage = {
    correlationId: correlationId,
    messageType: "propertyAccess",
    propertyName: prop,
    source: "sandbox",
    destination: "content",
    objectId: objectId,
    objectName: objectName,
  };

  return await awaitMessageResponse(message, correlationId);
}

export type ProxyInvocationMessage = {
  correlationId: string;
  messageType: "ProxyInvocation";
  functionName: string;
  objectId: string | undefined;
  payload: any[];
  source: "sandbox" | "content";
  destination: "sandbox" | "content";
};

async function functionInvocationHandler(
  prop: any,
  objectId: string | undefined,
  callbackRegistry: Map<string, Function>,
  ...args: any[]
): Promise<any> {
  if (prop === "then") {
    console.error(
      "then called directly on object in function invocation trap",
      [prop]
    );
  }
  const correlationId = generateUniqueId();

  const message: ProxyInvocationMessage = {
    correlationId: correlationId,
    messageType: "ProxyInvocation",
    functionName: prop,
    objectId: objectId,
    payload: args,
    source: "sandbox",
    destination: "content",
  };

  for (const key in message.payload) {
    message.payload[key] = transformArg(message.payload[key], callbackRegistry);
  }

  return await awaitMessageResponse(message, correlationId);
}

export type PropertyAssignmentMessage = {
  correlationId: string;
  messageType: "propertyAssignment";
  propertyName: string;
  value: any;
  source: "sandbox" | "content";
  destination: "sandbox" | "content";
  objectId: string | undefined;
  objectName?: string | undefined;
};

export type ComparisonMessage = {
  correlationId: string;
  messageType: "comparison";
  value: any;
  operatorKind: number;
  source: "sandbox" | "content";
  destination: "sandbox" | "content";
  objectId: string;
  objectName?: string | undefined;
};

async function comparisonHandler(
  comparison: {value: any, operatorKind: number},
  objectId: string | undefined,
  callbackRegistry: Map<string, Function>
) {
  const correlationId = generateUniqueId();
  const baseMessage = {
    correlationId: correlationId,
    messageType: "comparison",
    operatorKind: comparison.operatorKind,
    source: "sandbox",
    destination: "content",
    objectId: objectId,
    objectName: undefined,
    value: transformArg(comparison.value, callbackRegistry),
  };

  return (await awaitMessageResponse(baseMessage, correlationId, "raw")).data;
}

async function propertyAssignmentHandler(
  callbackRegistry: Map<string, Function>,
  property: string,
  value: any,
  objectId: string | undefined,
  objectName?: string | undefined
) {
  const correlationId = generateUniqueId();

  const message: PropertyAssignmentMessage = {
    correlationId: correlationId,
    messageType: "propertyAssignment",
    propertyName: property,
    value: transformArg(value, callbackRegistry),
    objectId: objectId,
    objectName: objectName,
    source: "sandbox",
    destination: "content",
  };

  return await awaitMessageResponse(message, correlationId);
}

async function awaitMessageResponse(message: any, correlationId: string, result: "proxy" | "raw" = "proxy") {
  try {
    window.parent.postMessage(message, "*");
  } catch (e) {
    console.error("Error sending message", e);
    throw e;
  }

  const response = await waitForResponse(correlationId);
  return result === "proxy" ? response.proxy : response.raw;
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

function transformArg(arg: any, callbackRegistry: Map<string, Function>): any {
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
