export function createContentScriptApiServer<T extends object>(
  contentScriptApi: T,
  globalContext: typeof globalThis
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.source === "sandbox") {
      switch (request.messageType) {
        case "ProxyPropertyAccess":
          executePropertyAccess(
            request.functionPath,
            globalContext,
            request.sandboxTabId,
            request.correlationId,
            sendResponse
          );
          break;

        case "ProxyInvocation":
          executeFunctionCall(
            request.functionPath,
            injectCallbackPropogation(
              request.payload,
              globalContext,
              request.sandboxTabId
            ),
            globalContext,
            request.correlationId,
            sendResponse
          );
          break;

        default:
          console.warn(
            `Unhandled sandbox message type: ${request.messageType}`
          );
      }

      return true;
    }

    // Handle non-sandbox messages
    executeFunctionCall(
      request.functionPath,
      request.payload,
      contentScriptApi,
      request.correlationId,
      sendResponse
    );
    return true;
  });
}

const objectStore = new Map<string, any>();
let nextObjectId = 1;

function executePropertyAccess(
  path: string[],
  globalContext: typeof globalThis,
  sandboxTabId: number,
  correlationId: string,
  sendResponse: (response: any) => void
) {
  function traversePath(path: string[]) {
    return path.reduce((current, key) => {
      if (current === undefined) return undefined;
      // Check if the key exists in globalObject
      if (key in globalContext) {
        return (globalContext as any)[key];
      }
      // If not, continue traversing the current object
      return (current as any)[key];
    }, globalContext);
  }

  const result = traversePath(path);

  const response = createResponse(result, correlationId);
  sendResponse(response);
}

function injectCallbackPropogation(
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

function executeFunctionCall(
  messagePath: string[],
  payload: any,
  target: any,
  correlationId: string,
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
    const result = functionToCall.apply(currentTarget, payload);
    if (result instanceof Promise) {
      result
        .then((resolvedResult) => {
          const response = createResponse(resolvedResult, correlationId);
          sendResponse(response);
        })
        .catch((error) => {
          console.error(`Error in ${messagePath.join(".")}:`, error);
          sendResponse(createResponse({ error: error.message }, correlationId));
        });
      return true; // Indicate that we will send a response asynchronously
    } else {
      const response = createResponse(result, correlationId);
      sendResponse(response);
      return false; // Indicate that we've already sent the response
    }
  } else {
    const response = createResponse(functionToCall, correlationId);
    sendResponse(response);
    return false; // Indicate that we've already sent the response
  }
}

// Define the types
export type ObjectReferenceResponse = {
  data: any;
  messageType: "objectReferenceResponse";
  objectId?: string | undefined;
  correlationId: string;
};

function createResponse(result: any, correlationId: string): ObjectReferenceResponse {
  let resultMessage: ObjectReferenceResponse = {
    data: result,
    messageType: "objectReferenceResponse",
    correlationId: correlationId
  };

  if (shouldStoreObjectReference(result)) {
    // Generate a unique ID and store the result
    const objectId = `obj_${nextObjectId++}`;
    objectStore.set(objectId, result);
    resultMessage.objectId = objectId;
  }

  return resultMessage;
}

function hasPrototype(obj: any): boolean {
  return (
    Object.getPrototypeOf(obj) !== null &&
    Object.getPrototypeOf(obj) !== Object.prototype
  );
}

function shouldStoreObjectReference(obj: any): boolean {
  return (
    obj !== undefined && obj !== null && (hasPrototype(obj) || hasMethods(obj))
  );
}

function hasMethods(obj: any): boolean {
  return (
    Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter(
      (prop) => typeof obj[prop] === "function"
    ).length > 0
  );
}
