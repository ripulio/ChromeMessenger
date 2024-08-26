export function createContentScriptApiServer<
  T extends object
>(contentScriptApi: T): any {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const messageType: string = request.messageType;
    const functionToCall = contentScriptApi[messageType as keyof T];
    if (typeof functionToCall !== "function") {
        return;
    }
    functionToCall(...request.payload).then(sendResponse);
  });
}
