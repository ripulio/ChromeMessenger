export function createBackgroundApiServer<T extends object>(
  backgroundApi: T
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const messageType: string = request.messageType;
    const method = backgroundApi[messageType as keyof T];
    if (typeof method === "function") {
      (method as Function)(...request.payload, sender).then((response: any) =>
        sendResponse(response)
      );
    }
  });
}
