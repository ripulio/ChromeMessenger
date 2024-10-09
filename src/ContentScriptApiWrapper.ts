import { ApiWrapper, createObjectWrapper } from "./TypeUtilities";

type TabTargetApiWrapper<T> = {
  forTab(tabId: number): T;
};

export function createContentScriptApiWrapper<T>(): TabTargetApiWrapper<T> {
  const tabTargetApiWrapper = {
    forTab(tabId: number) {
      const messageHandler = (functionPath: string[], ...args: any[]): any => {
        const message = {
          messageType: functionPath,
          payload: args,
        };

        console.log(`Sending message: ${JSON.stringify(message)}`);
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            response = chrome.runtime.lastError;
          } else {
            response = response;
          }
        });

        return;
      };
      return createObjectWrapper<T>(messageHandler, []) as T;
    },
  };
  return tabTargetApiWrapper;
}
