import { waitForResponse } from "./AsyncResponseDirectory";
import {
  createObjectWrapper,
  generateUniqueId,
  getCallbackRegistry,
  transformArg,
} from "./TypeUtilities";
export type TransportType = "fromSandbox" | "fromContentScript";

export function createServiceWorkerApiWrapperForContentScript<T>(): T {
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
        response.error ? reject(response.error) : resolve(response.data);
      });
    });
  };
  return createObjectWrapper<T>(messageHandler, []) as T;
}

export function createServiceWorkerApiWrapperForSandbox<T>(): T {
  const messageHandler = (
    functionPath: string[],
    ...args: any[]
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const correlationId = generateUniqueId();
      // transform args;
      const callbackRegistry = getCallbackRegistry();
      const transformedArgs = args.map((arg) =>
        callbackRegistry ? transformArg(arg, callbackRegistry) : arg
      );

      const message = {
        messageType: functionPath,
        payload: transformedArgs,
        correlationId: correlationId,
      };
      window.parent.postMessage(message, "*");

      return waitForResponse(correlationId).then((response) => {
        resolve(
          response.raw.deserializeData
            ? JSON.parse(response.raw.data)
            : response.raw.data
        );
      });
    });
  };
  return createObjectWrapper<T>(messageHandler, []) as T;
}
