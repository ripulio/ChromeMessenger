import { ApiWrapper } from "./TypeUtilities";

export function createBackgroundApiWrapper<T>(): ApiWrapper<T> {
  const messageHandler = (methodName: string, ...args: any[]): Promise<any> => {
    return new Promise((resolve, reject) => {
      const message = {
        messageType: methodName,
        payload: args,
      };

      console.log(`Sending message: ${JSON.stringify(message)}`);
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response);
      });
      setTimeout(() => resolve("Mock response"), 100);
    });
  };

  return new Proxy({} as ApiWrapper<T>, {
    get: (target, prop: string) => {
      return (...args: any[]) => messageHandler(prop, ...args);
    },
  });
}
