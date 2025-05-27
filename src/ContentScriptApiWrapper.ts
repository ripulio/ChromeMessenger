import {
  createObjectWrapper,
  PromisifyNonPromiseMethods,
} from "./TypeUtilities";

import { ContentScriptMessenger } from "./ContentScriptMessenger";

export type TabTargetApiWrapper<T> = {
  forTab(tabId: number): PromisifyNonPromiseMethods<T>;
};

export function createContentScriptApiWrapperForServiceWorker<
  T
>(): TabTargetApiWrapper<T> {
  const messenger = new ContentScriptMessenger();

  const tabTargetApiWrapper = {
    forTab(tabId: number) {
      const messageHandler = async (
        functionPath: string[],
        ...args: any[]
      ): Promise<any> => {
        const message = {
          messageType: functionPath,
          functionPath: functionPath,
          payload: args,
        };
        console.log(`Sending message: ${JSON.stringify(message)}`);

        try {
          // Try to send the message immediately
          return await messenger.sendMessage(tabId, message);
        } catch (error) {
          console.error(`Error sending message to tab ${tabId}: ${error}`);
          // Message failed, likely because content script isn't ready
          throw error;
        }
      };
      return createObjectWrapper<T>(messageHandler, []);
    },
  };
  return tabTargetApiWrapper;
}
