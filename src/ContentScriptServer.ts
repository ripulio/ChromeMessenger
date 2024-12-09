export function createContentScriptApiServer<T extends object>(
  contentScriptApi: T,
  globalContext: typeof globalThis
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    const createAndSendResponse = (result: any) => {
      const response = createResponse(result, request.correlationId);
      sendResponse(response);
    }

    if (request.source === "sandbox") {
      console.log("Recieved sandbox message", request);
      switch (request.messageType) {
        case "ProxyInvocation":

          const target = getTarget(request, globalContext);

          if (isComparison(request.functionPath)) {
            const result = executeComparison(
              request.payload[0],
              target,
              transformObjectReferenceArg(request.payload[1], objectStore)
            );
            createAndSendResponse(result);
            return false;
          }

          if (isAssignment(request.payload)) {
            const arg = request.payload[0].value;
            const transformedArg = transformObjectReferenceArg(
              arg,
              objectStore
            );
            const result = executeAssignment(transformedArg, target, request.functionPath);
            createAndSendResponse(result);
            return false;
          }

          executeFunctionCall(
            request.functionPath,
            injectCallbackPropogationIntoPayload(
              injectStoredObjectReferencesIntoPayload(request.payload, objectStore),
              globalContext,
              request.sandboxTabId
            ),
            target,
            createAndSendResponse
          );
          break;

        default:
          console.warn(
            `Unhandled sandbox message type: ${request.messageType}`
          );
      }

      return true;
    }

    // Handle non-proxy messages
    executeFunctionCall(
      request.functionPath,
      request.payload,
      contentScriptApi,
      (result) => sendResponse(result)
    );
    return true;
  });
}

const objectStore = new Map<string, any>();
let nextObjectId = 1;

function getTarget(request: any, globalContext: typeof globalThis){ 
  return request.objectId === undefined
  ? globalContext
  : objectStore.get(request.objectId); 
}

function executeComparison(
  comparisonIdentifier: string,
  left: any,
  right: any
) {
  console.log("Executing comparison", comparisonIdentifier, left, right);

  // Map TypeScript SyntaxKind values to comparison operations
  switch (comparisonIdentifier) {
    case "32": // EqualsEqualsToken
      return left > right;
    case "33": // EqualsEqualsEqualsToken
      return left <= right;
    case "36": // ExclamationEqualsToken
      return left != right;
    case "35": // ExclamationEqualsEqualsToken
      return left !== right;
    case "30": // LessThanToken
      return left < right;
    case "37": // LessThanEqualsToken
      return left === right;
    case "34": // GreaterThanEqualsToken
      return left >= right;
    default:
      console.warn(`Unknown comparison operator: ${comparisonIdentifier}`);
      return false;
  }
}

function injectStoredObjectReferencesIntoPayload(
  payload: any,
  objectStore: Map<string, any>
) : any {
  for (const key in payload) {
    const arg = payload[key];
    if (typeof arg === "object") {
      // replace objectReference with actual object
      if (arg !== null && arg.type === "objectReference") {
        payload[key] = objectStore.get(arg.objectId);
      } else {
        // recursively inject object references
        payload[key] = injectStoredObjectReferencesIntoPayload(arg, objectStore);
      }
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

function injectCallbackPropogationIntoPayload(
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

function isComparison(path: string[]): boolean {
  return path.length > 0 && path[0] === "__compare";
}

function executeAssignment(arg: any, target: any, path: string[]): boolean {
  let current = target;

  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }

  return current[path[path.length - 1]] = arg;
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
    const hydratedEventInit = injectStoredObjectReferencesIntoPayload(
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
  createAndSendResponse: (response: any) => void
): boolean {
  console.log("Recieved function call", messagePath, payload, target);

  const returnError = (message: string) => {
    console.error(message);
    createAndSendResponse({ error: message });
    return false;
  };

  let currentTarget = target;
  for (let i = 0; i < messagePath.length - 1; i++) {
    if (currentTarget[messagePath[i]] === undefined) {
      const message = `Path ${messagePath
        .slice(0, i + 1)
        .join(".")} not found in target ${currentTarget}`;
      return returnError(message);
    }
    currentTarget = currentTarget[messagePath[i]];
  }

  const functionName = messagePath[messagePath.length - 1];
  const functionToCall = currentTarget[functionName];

  if (functionToCall === undefined) {
    if (payload.length === 0) {
      // potential index call - no args only a path:
      let result = target;
      for (let i = 0; i < messagePath.length; i++) {
        if (result === undefined) {
          const message = `Path ${messagePath
            .slice(0, i + 1)
            .join(".")} access on undefined`;
          return returnError(message);
        }
        result = result[messagePath[i]];
      }

      createAndSendResponse(result);
      return false;
    }

    return returnError(
      `${messagePath.join(".")} not found on target ${currentTarget}`
    );
  }

  if (typeof functionToCall !== "function" && payload.length === 0) {
    createAndSendResponse(functionToCall);
    return false;
  }

  console.log("Transforming events in payload", payload);
  const eventedPayload = transformEventsInPayload(payload);

  console.log("Executing function", functionToCall, eventedPayload);
  try{
    const result = functionToCall.apply(currentTarget, eventedPayload);
    Promise.resolve(result)
      .then((resolvedResult: any) => {
        console.log("Result for function", functionToCall, resolvedResult);
        createAndSendResponse(resolvedResult);
      })
      .catch((error: any) => {
        console.error(`Error in ${messagePath.join(".")}:`, error);
        createAndSendResponse({ error: error.message });
      });
    return true; 
  } catch (error) {
    console.error(`Error in ${messagePath.join(".")}:`, error);
    createAndSendResponse({ error: error });
    return false;
  }
  // Indicate that we will send a response asynchronously
}

// Define the types
export type ObjectReferenceResponse = {
  data: any;
  messageType: "objectReferenceResponse";
  objectId?: string | undefined;
  iteratorId?: string | undefined;
  correlationId: string;
  deserializeData?: boolean;
};

export type IterableResponse = ObjectReferenceResponse & {
  iteratorId?: string | undefined;
};

function createResponse(
  result: any,
  correlationId: string
): ObjectReferenceResponse {
  const baseResponse = {
    messageType: "objectReferenceResponse" as const,
    correlationId: correlationId,
  };
  if (!result) {
    return {
      ...baseResponse,
      data: result,
    };
  }

  const shouldSerialize = shouldSerializeResult(result);

  let resultMessage: any = {
    ...baseResponse,
    deserializeData: shouldSerialize,
  };

  if (shouldSerialize) {
    try {
      const cloneableObject = makeObjectCloneable(result);
      if (cloneableObject) {
        resultMessage.data = JSON.stringify(cloneableObject);
      } else {
        resultMessage.data = JSON.stringify(result);
      }
    } catch (error) {
      console.error("Error serializing object", error);
      throw error;
    }
  } else {
    resultMessage.data = result;
  }

  const isIterable =
    result !== undefined &&
    result !== null &&
    result[Symbol.iterator] !== undefined;
  if (isIterable) {
    resultMessage = addIterablesToResponse(result, resultMessage);
  }

  if (shouldStoreObjectReference(result)) {
    resultMessage = {
      ...resultMessage,
      objectId: storeObjectReference(result),
    };
  }

  return resultMessage;
}

// TODO: This is a hack to prevent circular references and functions from being serialized.
// When we need the objects in the iframe, revisit this.
function makeObjectCloneable(data: any): any {
  if (data === undefined || data === null || typeof data === "function") {
    return undefined;
  }

  if (Array.isArray(data)) {
    return { length: data.length };
  }

  if (typeof data === "object") {
    const obj: any = {};

    for (let key in data) {
      obj[key] =
        typeof data[key] === "object" || typeof data[key] === "function"
          ? undefined
          : data[key];
    }

    return obj;
  }

  return data;
}

function addIterablesToResponse(
  result: any,
  message: ObjectReferenceResponse
): ObjectReferenceResponse {
  const iterator = result[Symbol.iterator]();

  const iteratorId = storeObjectReference(iterator);

  let resultMessage: IterableResponse = {
    ...message,
    iteratorId: iteratorId,
  };

  return resultMessage;
}

function shouldSerializeResult(result: any): boolean {
  if (
    typeof result === "number" ||
    typeof result === "boolean" ||
    typeof result === "string" ||
    result === null ||
    result === undefined
  ) {
    return false;
  }
  return hasPrototype(result) || hasMethods(result);
}

function hasPrototype(obj: any): boolean {
  return (
    Object.getPrototypeOf(obj) !== null &&
    Object.getPrototypeOf(obj) !== Object.prototype
  );
}

const nullTarget = { value: null };

function storeObjectReference(obj: any) {
  if (obj === undefined || obj === null) {
    objectStore.set("null", nullTarget);
    return "null";
  }
  // Generate a unique ID and store the result
  const objectId = `obj_${nextObjectId++}`;
  objectStore.set(objectId, obj);
  return objectId;
}

function shouldStoreObjectReference(obj: any): boolean {
  return true;
}

function hasMethods(obj: any): boolean {
  return (
    Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter(
      (prop) => typeof obj[prop] === "function"
    ).length > 0
  );
}
