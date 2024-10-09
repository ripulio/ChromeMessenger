import { createObjectWrapperWithCallbackRegistry } from "./TypeUtilities";
import { Function } from "./TypeUtilities";

export function createProxyObjectForSandboxContext<T>(
  callbackRegistry: Map<string, Function>
): T {
  return createObjectWrapperWithCallbackRegistry<T>(
    invocationHandler,
    [],
    callbackRegistry
  ) as T;
}

function invocationHandler(functionPath: string[], ...args: any[]): any {
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

  let response: any | undefined = undefined;
  let error: chrome.runtime.LastError | undefined = undefined;
  return;
  // WIP
  function waitForResponse() {
    if (error !== undefined) {
      throw error;
    }

    if (response === undefined) {
      setTimeout(waitForResponse, 5);
    }

    return response;
  }
}

export function generateUniqueId(): string {
  return Math.random().toString(36).substr(2, 9);
}
