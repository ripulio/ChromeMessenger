// mapping of port to tabId

export function createServiceWorkerApiServer<T extends object>(
  serviceWorkerApi: T
): { stop: () => void } {
  const messageListener = (request: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    console.log(
      "Service worker message received in backgroundApiServer",
      request
    );
    if (request.messageType == "sandboxCallback") {
      console.error("Recieved non-sandboxed sourced message from sandbox, specify source and/or refactor this", request);
      return true;
    }

    if (request.source === "sandbox") {
      console.error("Recieved non-sandboxed sourced message from sandbox, specify source and/or refactor this", request)
      return true;
    }

    if (!request.messageType) {
      console.log("Message received without messageType, not handled by ServiceWorkerApiServer", request);
      return false; // Let other listeners handle this message
    }

    const messagePath: string[] = request.messageType;

    let target: any = serviceWorkerApi;

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
          sendResponse({ ...baseMessage, data: result });
        })
        .catch((error) => {
          console.error(`Error in ${messagePath.join(".")}:`, error, request.payload);
          sendResponse({ ...baseMessage, error: JSON.stringify(error, Object.getOwnPropertyNames(error)) });
        });
      return true;
    }

    // if its not a function, then it should be a value
    sendResponse({ ...baseMessage, data: functionToCall });
    return false;
  };

  // Register the listener
  chrome.runtime.onMessage.addListener(messageListener);

  // To deregister the listener, use removeListener
  return { stop: () => chrome.runtime.onMessage.removeListener(messageListener) };
}
