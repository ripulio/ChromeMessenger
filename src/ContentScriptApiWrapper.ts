import { ApiWrapper } from "./TypeUtilities";

type TabTargetApiWrapper<T> = {
  forTab(tabId: number): ApiWrapper<T>;
};

export function createContentScriptApiWrapper<T>(): TabTargetApiWrapper<T> {
  const tabTargetApiWrapper = {
    forTab(tabId: number) {
      const messageHandler = (
        methodName: string,
        ...args: any[]
      ): Promise<any> => {
        return new Promise((resolve, reject) => {
          const message = {
            messageType: methodName,
            payload: args,
          };

          console.log(`Sending message: ${JSON.stringify(message)}`);
          chrome.tabs.sendMessage(tabId, message);
          // In a real extension, you'd use chrome.tabs.sendMessage here
          // For this example, we'll just resolve with a mock response
          setTimeout(() => resolve("Mock response"), 100);
        });
      };
      return new Proxy({} as ApiWrapper<T>, {
        get: (target, prop: string) => {
          return (...args: any[]) => messageHandler(prop, ...args);
        },
      });
    },
  };

  return tabTargetApiWrapper;
}
