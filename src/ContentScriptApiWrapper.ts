import { createObjectWrapper, PromisifyNonPromiseMethods } from "./TypeUtilities";

export type TabTargetApiWrapper<T> = {
  forTab(tabId: number): T;
};

export function createContentScriptApiWrapper<T>(): TabTargetApiWrapper<PromisifyNonPromiseMethods<T>> {
  const tabTargetApiWrapper = {
    forTab(tabId: number) {
      const messageHandler = (functionPath: string[], ...args: any[]): Promise<any> => {
        const message = {
          messageType: functionPath,
          functionPath: functionPath,
          payload: args,
        };

        return new Promise<any>((resolve, reject) => {
          console.log(`Sending message: ${JSON.stringify(message)}`);
          chrome.tabs.sendMessage(tabId, message, {}, (response) => {
            console.log(`Received response: ${JSON.stringify(response)}`);
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
      };
      return createObjectWrapper<T>(messageHandler, []);
    },
  };
  return tabTargetApiWrapper;
}
