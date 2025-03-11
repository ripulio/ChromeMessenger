import {
  createObjectWrapper,
  PromisifyNonPromiseMethods,
} from "./TypeUtilities";

export type TabTargetApiWrapper<T> = {
  forTab(tabId: number): T;
};

export function createContentScriptApiWrapperForServiceWorker<
  T
>(): TabTargetApiWrapper<PromisifyNonPromiseMethods<T>> {
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
        let complete = false;
        // Create a promise that resolves when the content script is ready
        const contentScriptReadyPromise = new Promise<void>(
          (resolve, reject) => {
            const listener = (
              msg: any,
              sender: chrome.runtime.MessageSender
            ) => {
              // Check if this is a ready message from our tab
              if (
                msg.type === "ContentScriptReady" &&
                sender.tab &&
                sender.tab.id === tabId
              ) {
                // Remove this listener once we got the ready message
                chrome.runtime.onMessage.removeListener(listener);
                resolve();
              }
              return false; // Don't use sendResponse
            };

            // Add the listener
            chrome.runtime.onMessage.addListener(listener);
          }
        );

        try {
          // Try to send the message immediately
          const response = await chrome.tabs.sendMessage(tabId, message);
          return response;
        } catch (error) {
          console.error(`Error sending message to tab ${tabId}: ${error}`);
          // Message failed, likely because content script isn't ready

          // Wait for content script ready message with a timeout
          try {
            await Promise.race([
              contentScriptReadyPromise,
              new Promise<void>((_, reject) => {
                setTimeout(() => {
                  reject(
                    new Error(
                      `Timeout waiting for content script in tab ${tabId}`
                    )
                  );
                }, 5000); // 5 second timeout
              }),
            ]);

            // Now that the content script is ready, try again
            return await chrome.tabs.sendMessage(tabId, message);
          } catch (timeoutError) {
            // Either timed out or another error occurred waiting for content script
            throw timeoutError;
          }
        }
      };
      return createObjectWrapper<T>(messageHandler, []);
    },
  };
  return tabTargetApiWrapper;
}
