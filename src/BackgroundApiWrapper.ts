import { createObjectWrapper, createObjectWrapperWithCallbackRegistry } from "./TypeUtilities";
import { Function } from "./TypeUtilities";
export function createBackgroundApiWrapper<T>(): T {
  const messageHandler = (
    functionPath: string[],
    ...args: any[]
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const message = {
        messageType: functionPath,
        payload: args,
      };

      console.log(`Sending message: ${JSON.stringify(message)}`);
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
    });
  };

  return createObjectWrapper<T>(messageHandler, []) as T;
}

export function createProxyObjectForSandboxContext<T>(
  tabId: number | undefined,
  callbackRegistry: Map<string, Function>
): T {
  const invocationHandler = (
    functionPath: string[],
    ...args: any[]
  ): any => {
    const correlationId = generateUniqueId();

    const message = {
      correlationId: correlationId,
      messageType: "ProxyInvocation",
      functionPath: functionPath,
      payload: args,
      source: "sandbox",
      destination: "content",
      targetTabId: tabId,
    };

    for (const key in message.payload) {
      if (typeof message.payload[key] === "function") {
        message.payload[key] = message.payload[key].toString();
      }
    }

    console.log(`Sending message: ${JSON.stringify(message)}`);
    window.parent.postMessage(message, "*");

  };

  return createObjectWrapperWithCallbackRegistry<T>(
    invocationHandler,
    [],
    callbackRegistry
  ) as T;
}

function generateUniqueId(): string {
  return Math.random().toString(36).substr(2, 9);
}
