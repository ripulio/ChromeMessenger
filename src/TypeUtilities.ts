import { waitForResponse } from "./AsyncResponseDirectory";

export type Function = (...args: any[]) => unknown;

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

function createThenableCallableProxy(
  originalProperty: string,
  node: ProxyInfo,
  port: MessagePort
) {
  // Return a proxy over the callable function.
  return new Proxy(function () {}, {
    // Intercept property access.
    get(target, property: string, receiver) {
      // If the property being accessed is "then", that means someone is trying to await it.
      if (property === "then") {
        // Return a then function that performs async work A.
        return (
          resolve: (value: any) => void,
          reject: (reason: any) => void
        ) => {
          PropertyAccessHandler(node, originalProperty, port)
            .then((result) => resolve(result))
            .catch((error) => reject(error));
        };
      }
      // If the property being accessed is "isProxy", return the node info.
      // This is needed by the transpiler to check if the object is a proxy.
      if (property === "isProxy") {
        return node;
      }
      
      // Handle Symbol properties that are commonly accessed during serialization
      if (typeof property === "symbol") {
        // Return undefined for Symbol properties to avoid errors during JSON.stringify
        // and other operations that inspect objects
        return undefined;
      }
      
      // Handle specific properties that are accessed during serialization
      if (property === "toJSON" || property === "valueOf" || property === "toString") {
        // Return undefined to indicate these methods don't exist
        return undefined;
      }
      
      // For any other property, delegate to the target.
      throw new Error(
        `get for property ${String(property)} on ThenableCallable - this should only be called or awaited (get -> then)`
      );
    },
    // Intercept calls to the function.
    apply(target, thisArg, args) {
      // Transform arguments before calling functionInvocationHandler
      // This is the same pattern used in createRemoteFunctionWrapperWithCallbackRegistry
      // and createFunctionWrapperWithCallbackRegistry
      const callbackRegistry = getCallbackRegistry();
      const wrappedArgs = args.map((arg: any) =>
        transformArg(arg, callbackRegistry)
      );
      
      // Determine the function call info based on the node type
      let functionCallInfo: FunctionCallInfo;
      if (node.kind === "objectId") {
        // For method calls on stored objects, include both objectId and methodName
        functionCallInfo = { objectId: node.value, methodName: originalProperty };
      } else {
        // For global objects with kind "name", we need to distinguish between:
        // 1. Global functions (like setTimeout) - should use ProxyFunctionCall
        // 2. Methods on global objects (like document.createElement) - should use ProxyMethodCall
        
        // Special case: if the node.value is a known global object name, treat as method call
        const globalObjectNames = new Set(['document', 'window', 'console', 'navigator']);
        
        if (globalObjectNames.has(node.value)) {
          // This is a method on a global object (e.g., document.createElement)
          functionCallInfo = { objectId: node.value, methodName: originalProperty };
        } else {
          // This is a global function (e.g., setTimeout)
          functionCallInfo = { functionName: originalProperty };
        }
      }
      
      return functionInvocationHandler(
        functionCallInfo,
        port,
        ...wrappedArgs
      );
    },
  });
}

type ProxyInfo =
  | { kind: "objectId"; value: string }
  | { kind: "name"; value: string };

export function createObjectWrapperWithCallbackRegistry(
  node: ProxyInfo,
  callbackRegistry: Map<string, Function>,
  port: MessagePort,
  iteratorId?: string,
  data?: any
) {
  const createProxy = (handler: ProxyHandler<any>) => {
    return new Proxy(
      {
        [IS_PROXY]: node,
        toString: () => data?.toString?.() ?? '[object Object]',
        valueOf: () => data?.valueOf?.() ?? data,
        [Symbol.toStringTag]: data?.toString?.() ?? '[object Object]',
        [Symbol.toPrimitive]: (hint: string) =>
          hint === "number" ? data : (data?.toString?.() ?? '[object Object]'),
      },
      handler
    );
  };

  const handler = {
    get(target: any, property: any, reciever: any) {
      if (property === "then") {
        return undefined;
      }
      if (property === "isProxy") {
        return node;
      }
      if (property === "__setProp") {
        return (property: string, value: any) =>
          assignmentHandler(node, property, value, port);
      }
      if (property === "__compare") {
        return (value: any, operatorKind: number) =>
          comparisonHandler(node, value, operatorKind, port);
      }
      return createThenableCallableProxy(property, node, port);
    },
  };
  return createProxy(handler);
}

export function createRemoteFunctionWrapperWithCallbackRegistry<T>(
  objectId: string,
  callbackRegistry: Map<string, Function>,
  port: MessagePort
): Function {
  const handler = {
    apply(target: any, thisArg: any, args: any[]) {
      const wrappedArgs = args.map((arg: any) =>
        transformArg(arg, callbackRegistry)
      );
      return functionInvocationHandler(
        { objectId: objectId },
        port,
        ...wrappedArgs
      );
    },
    get(target: any, property: string, receiver: any) {
      // Handle then property for awaiting the result
      if (property === "then") {
        // This means someone is trying to await the result of calling this stored function
        // We should return undefined because this proxy represents the function itself,
        // not a promise. The actual promise is returned by the apply handler.
        return undefined;
      }
      
      // Handle isProxy property for transpiled code detection
      if (property === "isProxy") {
        return { objectId: objectId };
      }
      
      // Handle Symbol properties that are commonly accessed during serialization
      if (typeof property === "symbol") {
        return undefined;
      }
      
      // Handle specific properties that are accessed during serialization
      if (property === "toJSON" || property === "valueOf" || property === "toString") {
        return undefined;
      }
      
      // For any other property access, throw an error to maintain security
      throw new Error(
        `get for property ${String(property)} on ThenableCallable - this should only be called or awaited (get -> then)`
      );
    },
  };
  return new Proxy(function () {}, handler) as Function;
}

export function createFunctionWrapperWithCallbackRegistry<T>(
  functionCallInfo: FunctionCallInfo,
  callbackRegistry: Map<string, Function>,
  port: MessagePort
): Function {
  const handler = {
    apply(target: any, thisArg: any, args: any[]) {
      const wrappedArgs = args.map((arg: any) =>
        transformArg(arg, callbackRegistry)
      );
      return functionInvocationHandler(functionCallInfo, port, ...wrappedArgs);
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

/*
function createFunctionProxy(
  prop: any,
  path: string[],
  callbackRegistry: Map<string, Function>,
  objectId: string | undefined,
  data: any,
  port: MessagePort
) {
  const proxyInfo = objectId ? {objectId: objectId} : {name: prop};
  return new Proxy(function () {}, {
    apply(target: any, thisArg: any, args: any[]) {
      if (typeof prop === "symbol" && prop === Symbol.asyncIterator) {
        return handleAsyncIteration(objectId, port);
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

      return functionInvocationHandler(
        path,
        prop,
        objectId,
        port,
        ...wrappedArgs
      );
    },
    get(target: any, prop: any) {
      if (propIsProxy(prop)) {
        return proxyInfo; 
      }
    },
  });
}
*/
const IS_PROXY = Symbol("isProxy");

function propIsProxy(prop: string) {
  return prop === "isProxy" || (typeof prop === "symbol" && prop === IS_PROXY);
}

function isProxy(
  obj: any
): { objectId: string } | { name: string } | undefined {
  return obj && obj[IS_PROXY];
}

export function handleAsyncIteration(iteratorId: string, port: MessagePort) {
  return async function* () {
    const getNext = async () => {
      const correlationId = generateUniqueId();
      const message = {
        correlationId: correlationId,
        messageType: "ProxyInvocation",
        functionPath: ["next"],
        objectId: iteratorId,
        source: "sandbox",
        destination: "content",
      };

      port.postMessage(message);

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
function decorateMessageWithProxyInfo<T>(message: T, node: ProxyInfo): T {
  if (node.kind === "objectId") {
    (message as any).objectId = node.value;
  } else {
    (message as any).objectName = node.value;
  }
  return message;
}

async function PropertyAccessHandler<T>(
  node: ProxyInfo,
  property: string,
  port: MessagePort
) {
  const correlationId = generateUniqueId();
  const message = decorateMessageWithProxyInfo(
    {
      correlationId: correlationId,
      messageType: "ProxyPropertyAccess",
      property: property,
      source: "sandbox",
      destination: "content",
    },
    node
  );

  console.log(`Sending message: ${JSON.stringify(message)}`);
  try {
    port.postMessage(message);
  } catch (e) {
    console.error("Error sending message", e);
  }

  const response = await waitForResponse<T>(correlationId);
  return response.proxy;
}

async function comparisonHandler(
  node: ProxyInfo,
  value: any,
  operatorKind: number,
  port: MessagePort
) {
  const correlationId = generateUniqueId();
  const message = decorateMessageWithProxyInfo(
    {
      correlationId: correlationId,
      messageType: "ProxyComparison",
      value: value,
      operatorKind: operatorKind,
      source: "sandbox",
      destination: "content",
    },
    node
  );

  port.postMessage(message);

  const response = await waitForResponse<any>(correlationId);
  return response.proxy;
}

async function assignmentHandler(
  node: ProxyInfo,
  prop: string,
  value: any,
  port: MessagePort
) {
  const correlationId = generateUniqueId();
  const message = decorateMessageWithProxyInfo(
    {
      correlationId: correlationId,
      messageType: "ProxyAssignment",
      property: prop,
      value: value,
      source: "sandbox",
      destination: "content",
    },
    node
  );

  port.postMessage(message);

  await waitForResponse<any>(correlationId);
  return true;
}

export type FunctionCallInfo =
  | { objectId: string; methodName?: string }
  | { functionName: string };
async function functionInvocationHandler<T>(
  functionCallInfo: FunctionCallInfo,
  port: MessagePort,
  ...args: any[]
): Promise<T[keyof T]> {
  const correlationId = generateUniqueId();

  let message: any;
  
  if ("objectId" in functionCallInfo) {
    if (functionCallInfo.methodName) {
      // Method call on stored object
      message = {
        correlationId: correlationId,
        messageType: "ProxyMethodCall",
        objectId: functionCallInfo.objectId,
        methodName: functionCallInfo.methodName,
        payload: args,
        source: "sandbox",
        destination: "content",
      };
    } else {
      // Function call on stored function object (like obj_24)
      // This should be treated as a ProxyStoredFunctionCall, not ProxyFunctionCall
      message = {
        correlationId: correlationId,
        messageType: "ProxyStoredFunctionCall",
        objectId: functionCallInfo.objectId,
        payload: args,
        source: "sandbox",
        destination: "content",
      };
    }
  } else {
    // Global function call
    message = {
      correlationId: correlationId,
      messageType: "ProxyFunctionCall",
      functionName: functionCallInfo.functionName,
      payload: args,
      source: "sandbox",
      destination: "content",
    };
  }

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
    port.postMessage(message);
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

export function transformArg(
  arg: any,
  callbackRegistry: Map<string, Function>
): any {
  switch (typeof arg) {
    case "function":
      return registerCallback(arg, callbackRegistry);
    case "object":
      if (!arg) return arg;
      const proxyInfo = isProxy(arg);
      if (proxyInfo) {
        // Extract the actual ID string from the proxy info object
        const objectId = "objectId" in proxyInfo ? proxyInfo.objectId : proxyInfo.name;
        return { type: "objectReference", objectId };
      }
      if (arg.type === "assignment") {
        const proxyInfo = isProxy(arg.value);
        if (proxyInfo) {
          // Extract the actual ID string from the proxy info object
          const objectId = "objectId" in proxyInfo ? proxyInfo.objectId : proxyInfo.name;
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
