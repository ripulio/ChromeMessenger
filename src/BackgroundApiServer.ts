export function createBackgroundApiServer<T extends object>(
  backgroundApi: T
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

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

    if (request.source === "sandbox") {
      const destinationTab = request.targetTabId;
      // forward to content script for active page
      chrome.tabs.sendMessage(destinationTab, request, (response) => {
        sendResponse(response);
      });
      // return here or wait for the response to propogate? 
      return;
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

    if (typeof functionToCall === "function") {
      Promise.resolve(
        (functionToCall as Function).apply(target, [...request.payload, sender])
      )
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          console.error(`Error in ${messagePath.join(".")}:`, error);
          sendResponse({ error: error.message });
        });
    } else {
      // if its not a function, then it should be a value
      sendResponse(functionToCall);
    }

    // Return true to indicate that we will send a response asynchronously
    return true;
  });
}
