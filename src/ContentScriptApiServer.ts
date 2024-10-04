export function createContentScriptApiServer<T extends object>(
  contentScriptApi: T,
  globalContext: typeof globalThis
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.source === "sandbox") {
      const payload = mutatePayload(
        request.payload,
        globalContext,
        request.sandboxTabId
      );
      return createFunctionCall(
        request.messageType,
        payload,
        globalContext,
        sendResponse
      );
    }
    return createFunctionCall(
      request.messageType,
      request.payload,
      contentScriptApi,
      sendResponse
    );
  });
}

function mutatePayload(
  payload: any,
  globalContext: typeof globalThis,
  sandboxTabId: number
): any {
  for (const key in payload) {
    if (
      typeof payload[key] === "string" &&
      payload[key].startsWith("__callback__|")
    ) {
      const callbackReference = payload[key];
      payload[key] = (...args: any[]) =>
        globalContext.chrome.runtime.sendMessage({
          callbackReference: callbackReference,
          sandboxTabId: sandboxTabId,
          messageType: "sandboxCallback",
          args: args.map((arg) => {
            try {
              return stringifyEvent(arg);
            } catch (error) {
              return `[Unserializable: ${typeof arg}]`;
            }
          }),
        });
    }
  }
  return payload;
}

function stringifyEvent(e: any) {
  const obj: any = {};
  for (let k in e) {
    obj[k] = e[k];
  }
  return JSON.stringify(
    obj,
    (k, v) => {
      if (v instanceof Node) return undefined;
      if (v instanceof Window) return undefined;
      return v;
    },
    " "
  );
}

function serializeObject(obj: any): any {
  const simpleObject: any = {};
  for (let prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      try {
        simpleObject[prop] =
          typeof obj[prop] === "object"
            ? serializeObject(obj[prop])
            : obj[prop];
      } catch (e) {
        simpleObject[prop] = undefined;
      }
    }
  }
  return simpleObject;
}

function createFunctionCall(
  messagePath: string[],
  payload: any,
  target: any,
  sendResponse: (response: any) => void
): boolean {
  let currentTarget = target;
  for (let i = 0; i < messagePath.length - 1; i++) {
    if (currentTarget[messagePath[i]] === undefined) {
      throw new Error(
        `Path ${messagePath.slice(0, i + 1).join(".")} not found in target`
      );
    }
    currentTarget = currentTarget[messagePath[i]];
  }

  const functionName = messagePath[messagePath.length - 1];
  const functionToCall = currentTarget[functionName];

  if (functionToCall === undefined) {
    throw new Error(`${messagePath.join(".")} not found on target`);
  }

  if (typeof functionToCall === "function") {
    Promise.resolve(functionToCall.apply(currentTarget, payload))
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        console.error(`Error in ${messagePath.join(".")}:`, error);
        sendResponse({ error: error.message });
      });
  } else {
    // if it's not a function, then it should be a value
    sendResponse(functionToCall);
  }

  // Return true to indicate that we will send a response asynchronously
  return true;
}
