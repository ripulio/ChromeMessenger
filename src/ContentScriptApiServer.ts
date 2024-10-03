export function createContentScriptApiServer<T extends object>(
  contentScriptApi: T
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    return createFunctionCall(request.messageType, request.payload, contentScriptApi, sendResponse);      
  });
}

function createFunctionCall(
  messagePath: string[],
  payload: any,
  target: any,
  sendResponse: (response: any) => void
) : boolean {
  for (let i = 0; i < messagePath.length - 1; i++) {
    if (target[messagePath[i]] === undefined) {
      throw new Error(`Function ${messagePath} not found in contentScriptApi`);
    }
    target = target[messagePath[i]];
  }

  const functionName = messagePath[messagePath.length - 1];
  const functionToCall = target[functionName];

  if (functionToCall === undefined) {
    throw new Error(`${messagePath.join(".")} not found on contentScriptApi`);
  }

  if (typeof functionToCall === "function") {
    Promise.resolve((functionToCall as Function).apply(target, payload))
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
}
