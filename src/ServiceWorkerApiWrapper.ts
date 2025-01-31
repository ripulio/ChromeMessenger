import { waitForResponse } from "./AsyncResponseDirectory";
import {
  createObjectWrapper,
  generateUniqueId,
  getCallbackRegistry,
  transformArg,
} from "./TypeUtilities";
export type TransportType = "fromSandbox" | "fromContentScript";

export function createServiceWorkerApiWrapperForContentScript<T>(): T {
  const messageHandler = async (
    functionPath: string[],
    ...args: any[]
  ): Promise<any> => {
    const message = {
      messageType: functionPath,
      payload: args,
    };

    console.log(`Sending message: ${JSON.stringify(message)}`);
    return (await chrome.runtime.sendMessage(message)).data;
  };
  return createObjectWrapper<T>(messageHandler, []) as T;
}

export function createServiceWorkerApiWrapperForSandbox<T>(port: MessagePort): T {
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
        messageType: "ContentScriptApiInvocation",
        functionPath: functionPath,
        payload: transformedArgs,
        correlationId: correlationId,
      };
      port.postMessage(message);

      return waitForResponse(correlationId).then((response) => {
        resolve(response.raw.data);
      });
    });
  };
  return createObjectWrapper<T>(messageHandler, []) as T;
}
