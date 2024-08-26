export function createBackgroundApiServer<T extends object>(
  backgroundApi: T
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const messageType: string = request.messageType;
    const method = backgroundApi[messageType as keyof T];

    if (typeof method !== "function") {
      console.error(`Function ${messageType} not found in backgroundApi`);
      return false;
    }

    Promise.resolve((method as Function).apply(backgroundApi, request.payload))
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error(`Error in ${messageType}:`, error);
        sendResponse({ error: error.message });
      });

    return true;
  });
}
