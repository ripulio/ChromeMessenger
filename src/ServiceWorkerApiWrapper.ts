import { waitForResponse } from "./SandboxDynamicCodeServer";
import { createObjectWrapper, generateUniqueId } from "./TypeUtilities";

export type TransportType = "fromSandbox" | "fromContentScript";

export function createServiceWorkerApiWrapper<T>(transportType: TransportType): T {
  if (transportType === "fromContentScript") {
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

  const messageHandler = (
    functionPath: string[],
    ...args: any[]
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const correlationId = generateUniqueId();
      const message = {
        messageType: functionPath,
        payload: args,
        correlationId: correlationId,
      };
      window.parent.postMessage(message, "*");

      return waitForResponse(correlationId).then((response) => {
        resolve(response.raw.deserializeData ? JSON.parse(response.raw.data) : response.raw.data);
      });
    });

  };
  return createObjectWrapper<T>(messageHandler, []) as T;
}
