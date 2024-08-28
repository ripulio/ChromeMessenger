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
