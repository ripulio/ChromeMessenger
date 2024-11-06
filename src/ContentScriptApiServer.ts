export function createContentScriptApiServer<T extends object>(
  contentScriptApi: T,
  globalContext: typeof globalThis
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.source === "sandbox") {
      console.log("Recieved sandbox message", request);
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
          const target =
            request.objectId === undefined
              ? globalContext
              : objectStore.get(request.objectId);

          if (isAssignment(request.payload)) {
            const arg = request.payload[0].value;
            const transformedArg = transformObjectReferenceArg(
              arg,
              objectStore
            );
            executeAssignment(transformedArg, target, request.functionPath);
            const response = createResponse(true, request.correlationId);
            sendResponse(response);
            return false;
          }

          executeFunctionCall(
            request.functionPath,
            injectCallbackPropogation(
              injectStoredObjectReferences(request.payload, objectStore),
              globalContext,
              request.sandboxTabId
            ),
            target,
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

function injectStoredObjectReferences(
  payload: any,
  objectStore: Map<string, any>
) {
  for (const key in payload) {
    const arg = payload[key];
    if (
      typeof arg === "object" &&
      arg !== null &&
      arg.type === "objectReference"
    ) {
      payload[key] = objectStore.get(arg.objectId);
    }
  }

  return payload;
}

function transformObjectReferenceArg(arg: any, objectStore: Map<string, any>) {
  if (
    typeof arg === "object" &&
    arg !== null &&
    arg.type === "objectReference"
  ) {
    return objectStore.get(arg.objectId);
  }
  return arg;
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

function isAssignment(payload: any): boolean {
  return payload.length > 0 && payload[0].type === "assignment";
}

function executeAssignment(arg: any, target: any, path: string[]) {
  let current = target;

  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }

  current[path[path.length - 1]] = arg;
}

function transformEventsInPayload(payload: any[]): any[] {
  return payload.map((arg) => {
    return argumentToEvent(arg) ?? arg;
  });
}

function argumentIsEvent(argument: any): boolean {
  if (!argument || typeof argument !== "object") {
    return false;
  }

  if (argument.eventType) {
    return true;
  }

  return false;
}

function getEventConstructorByName(name: string): EventConstructor | null {
  try {
    const constructor = (window as any)[name];
    return isEventConstructor(constructor) ? constructor : null;
  } catch {
    return null;
  }
}

function argumentToEvent(argument: any): Event | null {
  if (!argumentIsEvent(argument)) {
    return null;
  }

  try {
    const { eventType, type, ...eventInit } = argument;
    const constructor = getEventConstructorByName(eventType);
    if (!constructor) {
      console.warn(`Failed to get event constructor for ${argument.eventType}`);
      return null;
    }
    const hydratedEventInit = injectStoredObjectReferences(
      eventInit,
      objectStore
    );
    return createTypedEvent(constructor, hydratedEventInit, type);
  } catch (error) {
    console.warn(`Failed to create event:`, error);
    return null;
  }
}

type EventConstructor = {
  new (type: string, eventInitDict?: any): Event;
  prototype: Event;
};

function isEventConstructor(value: any): value is EventConstructor {
  return typeof value === "function" && value.prototype instanceof Event;
}

function createTypedEvent(
  constructor: EventConstructor,
  initArgs: any,
  eventType: string
): Event {
  return new constructor(eventType, initArgs);
}

function executeFunctionCall(
  messagePath: string[],
  payload: any,
  target: any,
  correlationId: string,
  sendResponse: (response: any) => void
): boolean {
  console.log("Recieved function call", messagePath, payload, target);

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

  if (typeof functionToCall !== "function") {
    // its a property access
    console.log("Property access", functionToCall);
    const response = createResponse(functionToCall, correlationId);
    sendResponse(response);
    return false; // Indicate that we've already sent the response
  }

  console.log("Transforming events in payload", payload);
  const eventedPayload = transformEventsInPayload(payload);

  console.log("Executing function", functionToCall, eventedPayload);
  const result = functionToCall.apply(currentTarget, eventedPayload);
  if (result instanceof Promise) {
    result
      .then((resolvedResult) => {
        console.log("Result for function", functionToCall, resolvedResult);
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
}

// Define the types
export type ObjectReferenceResponse = {
  data: any;
  messageType: "objectReferenceResponse";
  objectId?: string | undefined;
  correlationId: string;
};

function createResponse(
  result: any,
  correlationId: string
): ObjectReferenceResponse {
  const serializeObject = (data: any) => {
    const obj: any = {};
    for (let key in data) {
      obj[key] = data[key];
    }
    return obj;
  };

  const shouldSerialize = shouldSerializeResult(result);

  let resultMessage: ObjectReferenceResponse = {
    data: shouldSerialize ? serializeObject(result) : result,
    messageType: "objectReferenceResponse",
    correlationId: correlationId,
  };

  if (shouldStoreObjectReference(result)) {
    // Generate a unique ID and store the result
    const objectId = `obj_${nextObjectId++}`;
    objectStore.set(objectId, result);
    resultMessage.objectId = objectId;
  }

  return resultMessage;
}

function shouldSerializeResult(result: any): boolean {
  return (
    result !== undefined &&
    result !== null &&
    (hasPrototype(result) || hasMethods(result))
  );
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
