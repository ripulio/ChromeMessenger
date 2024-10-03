import { ApiWrapper, createObjectWrapper } from "./TypeUtilities";

export function createBackgroundApiWrapper<T>(): T {
  const messageHandler = (functionPath: string[], ...args: any[]): Promise<any> => {
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

export function createProxyObjectForSandboxContext<T>(tabId?: number | undefined) : T {
  
  const messageHandler = (functionPath: string[], ...args: any[]): Promise<any> => {
    return new Promise((resolve, reject) => {
      const message = {
        messageType: functionPath,
        payload: args,
        source: "sandbox",
        destination: "content",
        targetTabId: tabId
      };

      for (const key in message.payload){
        if (typeof message.payload[key] === 'function'){
          message.payload[key] = message.payload[key].toString();
        }
      }
      console.log(`Sending message: ${JSON.stringify(message)}`);
      window.parent.postMessage(message, "*");
    });
  };

  return createObjectWrapper<T>(messageHandler, []) as T;
}