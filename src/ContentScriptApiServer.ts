export function createContentScriptApiServer<T extends object>(
  contentScriptApi: T
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const messageType: string = request.messageType;
    const functionToCall = contentScriptApi[messageType as keyof T];

    if (typeof functionToCall !== "function") {
      console.error(`Function ${messageType} not found in contentScriptApi`);
      return false;
    }

    Promise.resolve(
      (functionToCall as Function).apply(contentScriptApi, request.payload)
    )
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error(`Error in ${messageType}:`, error);
        sendResponse({ error: error.message });
      });

    // Return true to indicate that we will send a response asynchronously
    return true;
  });
}
