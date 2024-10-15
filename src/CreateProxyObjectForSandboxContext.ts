import { createObjectWrapperWithCallbackRegistry } from "./TypeUtilities";
import { Function } from "./TypeUtilities";

export function createProxyObjectFactoryForSandboxContext<T>(
  callbackRegistry: Map<string, Function>,
  waitForResponse: () => any
): T {
  return createObjectWrapperFactory<T>(
    functionInvocationHandler,
    propertyAccessHandler,
    callbackRegistry,
    waitForResponse,
  ) as T;
}

export function createProxyObjectForSandboxContext<T>(
  callbackRegistry: Map<string, Function>,
  object: Partial<T>,
  
): T {
  return createObjectWrapperWithCallbackRegistry(
    functionInvocationHandler,
    propertyAccessHandler,
    [],
    callbackRegistry,
    object
  );
}

export function createObjectWrapperFactory<T>(
  invocationHandler: (functionPath: string[], ...args: any[]) => any,
  propertyAccessHandler: (path: string[]) => any,
  callbackRegistry: Map<string, Function>,
  waitForResponse: () => any
): T {
  const handler = {
    get(target: any, prop: string) {
      return createObjectWrapperWithCallbackRegistry(
        withWaitForResponse(waitForResponse, invocationHandler),
        withWaitForResponse(waitForResponse, propertyAccessHandler),
        [prop],
        callbackRegistry,
      );
    },
  };

  return new Proxy(function () {}, handler) as T;
}

function withWaitForResponse(waitForResponse: () => any, handler: (path: string[]) => any): (path: string[]) => any {
  return (path: string[]) => {
    handler(path);
    return waitForResponse();
  };
}


function propertyAccessHandler(path: string[]): any {
  const correlationId = generateUniqueId();

  const message = {
    correlationId: correlationId,
    messageType: "ProxyPropertyAccess",
    functionPath: path,
    source: "sandbox",
    destination: "content",
  };
  
  console.log(`Sending message: ${JSON.stringify(message)}`);
  window.parent.postMessage(message, "*",);
}

function functionInvocationHandler(functionPath: string[], ...args: any[]): any {
  const correlationId = generateUniqueId();

  const message = {
    correlationId: correlationId,
    messageType: "ProxyInvocation",
    functionPath: functionPath,
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
  window.parent.postMessage(message, "*",);
}

export function generateUniqueId(): string {
  return Math.random().toString(36).substr(2, 9);
}