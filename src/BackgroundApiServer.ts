// mapping of port to tabId

export function createBackgroundApiServer<T extends object>(
  backgroundApi: T
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    console.log("BackgroundApiServer request", request);
    if (request.messageType == "sandboxCallback") {
      // send message to sandbox iframe
      const tabId = request.sandboxTabId;
      const callbackReference = request.callbackReference;
      
      chrome.tabs.sendMessage(tabId, {
        callbackReference: callbackReference,
        sandboxTabId: tabId
      }, (response) => {
        console.log("sandboxCallback response", response);
      });

      return;
    }

    // MessageType: "ProxyPropertyAccess" or "ProxyInvocation"
    if (request.source === "sandbox") {

      const destinationTab = request.contentScriptTabId;
      // forward to content script for active page
      chrome.tabs.sendMessage(destinationTab, request, (response) => {
        console.log("Invocation response", response);
        console.log("For request", request);
        sendResponse(response);
      });
      // return here or wait for the response to propogate? 
      return true;
    }

    const messagePath: string[] = request.messageType;

    let target: any = backgroundApi;

    for (let i = 0; i < messagePath.length - 1; i++) {
      if (target[messagePath[i]] === undefined) {
        throw new Error(`Function ${messagePath} not found in backgroundApi`);
      }
      target = target[messagePath[i]];
    }
    
    const functionName = messagePath[messagePath.length - 1];
    const functionToCall = target[functionName];

    if (functionToCall === undefined) {
      throw new Error(`Function ${messagePath} not found in backgroundApi`);
    }

    let baseMessage: any = {};

    if (request.correlationId) {
      baseMessage.correlationId = request.correlationId;
    }

    if (typeof functionToCall === "function") {
      Promise.resolve(
        (functionToCall as Function).apply(target, [...request.payload, sender])
      )
        .then((result) => {
          sendResponse({...baseMessage, data: result});
        })
        .catch((error) => {
          console.error(`Error in ${messagePath.join(".")}:`, error);
          sendResponse({...baseMessage, error: error.message });
        });
    } else {
      // if its not a function, then it should be a value
      sendResponse({...baseMessage, data: functionToCall});
    }

    // Return true to indicate that we will send a response asynchronously
    return true;
  });
}
