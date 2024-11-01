import { waitForResponse } from "./CreateSandboxDynamicCodeServer";
import {
  createFunctionWrapperWithCallbackRegistry,
  createObjectWrapperWithCallbackRegistry,
} from "./TypeUtilities";
import { Function } from "./TypeUtilities";

export function createProxyObjectFactoryForSandboxContext<T>(
  callbackRegistry: Map<string, Function>,
  referenceState: T
): T {
  return createObjectWrapperFactory<T>(
    functionInvocationHandler,
    callbackRegistry,
    referenceState
  ) as T;
}

export function createProxyObjectForSandboxContext<T>(
  callbackRegistry: Map<string, Function>,
  referenceState: T,
  object: Partial<T>,
  objectId: string
): T {
  return createObjectWrapperWithCallbackRegistry(
    functionInvocationHandler,
    [],
    callbackRegistry,
    referenceState,
    object,
    objectId
  );
}

function createObjectWrapperFactory<T>(
  invocationHandler: (
    functionPath: string[],
    node: keyof T,
    ...args: any[]
  ) => any,
  callbackRegistry: Map<string, Function>,
  obj: T
): T {
  const handler = {
    get(target: any, prop: string, receiver: any) {
      let propType: string;
      try {
        propType = typeof obj[prop as keyof T];
        switch (propType) {
          case "function":
            return createFunctionWrapperWithCallbackRegistry(
              invocationHandler,
              [],
              prop as keyof T,
              callbackRegistry
            );
          case "object":
            return createObjectWrapperWithCallbackRegistry(
              invocationHandler,
              [prop],
              callbackRegistry,
              obj
            );
          default:
            console.warn("prop type not supported:", propType);
            console.log("prop type:", propType);
            console.log("prop", prop);
            return undefined;
        }
      } catch (e) {
        console.error("error", e);
        return undefined;
      }
    },
    set(target: any, prop: string, value: any, receiver: any) {
      console.log("set", prop, value);
      debugger;
      return true;
    }
  };

  return new Proxy(function () {}, handler) as T;
}

function propertyAccessHandler<T>(
  propertyPath: string[],
  node: keyof T
): Promise<T[keyof T]> {
  if (node === "then") {
    console.error("then called directly on object in property access trap", [...propertyPath, node]);
  }

  const correlationId = generateUniqueId();

  const message = {
    correlationId: correlationId,
    messageType: "ProxyPropertyAccess",
    functionPath: [...propertyPath, node],
    source: "sandbox",
    destination: "content",
  };

  console.log(`Sending message: ${JSON.stringify(message)}`);
  window.parent.postMessage(message, "*");

  return waitForResponse(correlationId);
}

function functionInvocationHandler<T>(
  functionPath: string[],
  node: keyof T,
  objectId: string | undefined,
  ...args: any[]
): Promise<T[keyof T]> {
  if (node === "then") {
    console.error("then called directly on object in function invocation trap", [...functionPath, node]);
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
    if (typeof message.payload[key] === "function") {
      message.payload[key] = message.payload[key].toString();
    }
  }

  console.log(`Sending message: ${JSON.stringify(message)}`);
  window.parent.postMessage(message, "*");

  return waitForResponse(correlationId);
}

export function generateUniqueId(): string {
  return Math.random().toString(36).substr(2, 9);
}