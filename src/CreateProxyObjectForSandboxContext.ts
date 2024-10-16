import { createFunctionWrapperWithCallbackRegistry, createObjectWrapperWithCallbackRegistry } from "./TypeUtilities";
import { Function } from "./TypeUtilities";

export function createProxyObjectFactoryForSandboxContext<T>(
  callbackRegistry: Map<string, Function>,
  obj: T
): T {
  return createObjectWrapperFactory<T>(
    functionInvocationHandler,
    propertyAccessHandler,
    callbackRegistry,
    obj
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

function createObjectWrapperFactory<T>(
  invocationHandler: (functionPath: string[], ...args: any[]) => any,
  propertyAccessHandler: (path: string[]) => any,
  callbackRegistry: Map<string, Function>,
  obj: T
): T {
  const handler = {
    get(target: any, prop: string, receiver: any) {
      let propType: string;
      try{
        propType = typeof obj[prop as keyof T];
        switch (propType) {
          case "function":
            return createFunctionWrapperWithCallbackRegistry(
              invocationHandler,
              [prop],
              callbackRegistry,
            );
          case "object":
            return createObjectWrapperWithCallbackRegistry(
              invocationHandler,
              propertyAccessHandler,
              [prop],
              callbackRegistry,
            );
          default:
            console.log("prop type:", propType);
            console.warn("prop type not supported:", propType);
            return undefined;
        }
      } catch (e) {
        console.error("error", e);
        return undefined;
      }
      
    },
  };

  return new Proxy(function () {}, handler) as T;
}

function propertyAccessHandler(path: string[]): Promise<any> {
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

  return waitForResponse(correlationId);
}

function functionInvocationHandler(functionPath: string[], ...args: any[]): Promise<any> {
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

  return waitForResponse(correlationId);
}

const pendingPromises = new Map<string, (arg: any) => void>();
window.addEventListener("message", function handler(event){
  console.log("Recieved message in sandbox", event.data);
  const correlationId = event.data.correlationId;
  if (event.data.messageType === "objectReferenceResponse" ) {
    if (pendingPromises.has(correlationId)) {
      pendingPromises.get(correlationId)?.(event.data);
      pendingPromises.delete(correlationId);
    }
  }
});

function waitForResponse(correlationId: string): Promise<any> {
  const promise = new Promise((resolve, reject) => {
    pendingPromises.set(correlationId, resolve);
    // todo handle timeout
  });
  return promise;
}

export function generateUniqueId(): string {
  return Math.random().toString(36).substr(2, 9);
}