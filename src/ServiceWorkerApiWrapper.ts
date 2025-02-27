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
    async function sendMessageWithRetry(message: any, maxRetries = 5, delay = 1000) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await chrome.runtime.sendMessage(message);
          return response;
        } catch (error) {
          // If it's the final attempt, throw the error.
          if (attempt === maxRetries) {
            throw error;
          }
          // Wait before retrying.
          await new Promise(resolve => setTimeout(resolve, delay));
          // Optionally, increase the delay for the next attempt.
          delay *= 2;
        }
      }
    }
    return (await sendMessageWithRetry(message)).data;
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
        functionPath: functionPath.filter(o => o !== "then"),
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
