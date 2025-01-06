import {
  getFunctionReference,
  getObjectReference,
  storeFunctionReference,
  storeObjectReference,
  storeStaticFunctionReference,
  storeStaticObjectReference,
} from "./ContentScriptReferenceStore";
import {
  PropertyAccessMessage,
  PropertyAssignmentMessage,
  ProxyInvocationMessage,
} from "./TypeUtilities";

export function createContentScriptApiServer<T extends object>(
  contentScriptApi: T,
  globalContext: typeof globalThis
): void {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const createAndSendStaticFunctionResponse = (result: Function) => {
      const functionId = storeStaticFunctionReference(result);
      const response = createFunctionResponse(
        request.correlationId,
        functionId
      );
      sendResponse(response);
    };
    const createAndSendFunctionResponse = (
      key: string,
      contextObjectId: string
    ) => {
      const functionId = storeFunctionReference(contextObjectId, key);
      const response = createFunctionResponse(
        request.correlationId,
        functionId
      );
      sendResponse(response);
    };

    const createAndSendStaticResponse = (result: any) => {
      const objectId = storeStaticObjectReference(result);
      const response = createResponse(objectId, result, request.correlationId);
      sendResponse(response);
    };

    const createAndSendResponse = (
      result: any,
      key: string,
      contextObjectId: string
    ) => {
      const objectId = storeObjectReference(contextObjectId, key);
      const response = createResponse(objectId, result, request.correlationId);
      sendResponse(response);
    };

    if (request.source === "sandbox") {
      console.log("Recieved sandbox message", request);

      switch (request.messageType) {
        case "ProxyInvocation":
          const message = request as ProxyInvocationMessage;
          const target =
            message.objectId !== undefined
              ? getObjectReference(globalContext, message.objectId)
              : globalContext;

          /*
          if (isComparison(message.functionName)) {
            const result = executeComparison(
              message.payload[0],
              target,
              transformObjectReferenceArg(globalContext, message.payload[1])
            );
            createAndSendStaticResponse(result);
            return false;
          }
          */

          if (!request.objectId) {
            request.objectId = storeFunctionReference(
              "global",
              message.functionName
            );
          }

          executeFunctionCall(
            request.objectId,
            injectCallbackPropogationIntoPayload(
              injectStoredObjectReferencesIntoPayload(
                globalContext,
                request.payload
              ),
              globalContext,
              request.sandboxTabId
            ),
            (result: any) =>
              typeof result === "function"
                ? createAndSendStaticFunctionResponse(result)
                : createAndSendStaticResponse(result),
            globalContext
          );

          break;
        case "propertyAccess":
          const propertyAccessMessage = request as PropertyAccessMessage;
          const propertyAccessTarget = getPropertyAccessTarget(
            globalContext,
            propertyAccessMessage
          );
          const contextObjectId = getContextObjectId(propertyAccessMessage);
          executePropertyAccess(
            propertyAccessMessage.propertyName,
            propertyAccessTarget,
            (result: any) =>
              typeof result === "function"
                ? createAndSendFunctionResponse(
                    propertyAccessMessage.propertyName,
                    contextObjectId
                  )
                : createAndSendResponse(
                    result,
                    propertyAccessMessage.propertyName,
                    contextObjectId
                  )
          );
          return false;
        case "propertyAssignment":
          const propertyAssignmentMessage =
            request as PropertyAssignmentMessage;
          const propertyAssignmentTarget = getPropertyAccessTarget(
            globalContext,
            propertyAssignmentMessage
          );

          const transformedValue = transformObjectReferenceArg(
            globalContext,
            propertyAssignmentMessage.value
          );

          const result = executeAssignment(
            transformedValue,
            propertyAssignmentTarget,
            propertyAssignmentMessage.propertyName
          );
          createAndSendStaticResponse(result);
          return false;
        default:
          console.warn(
            `Unhandled sandbox message type: ${request.messageType}`
          );
      }

      return true;
    }

    // Handle non-proxy messages
    executeFunctionCall(
      request.objectId,
      request.payload,
      (result) => sendResponse(result),
      globalContext
    );
    return true;
  });
}

function getPropertyAccessTarget(
  globalContext: any,
  propertyAccessMessage: PropertyAccessMessage | PropertyAssignmentMessage
) {
  if (propertyAccessMessage.objectId !== undefined) {
    return getObjectReference(globalContext, propertyAccessMessage.objectId);
  }

  storeObjectReference("global", propertyAccessMessage.objectName!);
  return (globalContext as any)[propertyAccessMessage.objectName!];
}

function getContextObjectId(propertyAccessMessage: PropertyAccessMessage) {
  if (propertyAccessMessage.objectId !== undefined) {
    return propertyAccessMessage.objectId;
  }
  if (propertyAccessMessage.objectName !== undefined) {
    return storeObjectReference("global", propertyAccessMessage.objectName);
  }
  return "global";
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
  globalContext: any,
  payload: any
): any {
  for (const key in payload) {
    const arg = payload[key];
    if (typeof arg === "object") {
      // replace objectReference with actual object
      if (arg !== null && arg.type === "objectReference") {
        payload[key] = getObjectReference(globalContext, arg.objectId);
      } else {
        // recursively inject object references
        payload[key] = injectStoredObjectReferencesIntoPayload(
          globalContext,
          arg
        );
      }
    }
  }

  return payload;
}

function transformObjectReferenceArg(globalContext: any, arg: any) {
  if (
    typeof arg === "object" &&
    arg !== null &&
    arg.type === "objectReference"
  ) {
    return getObjectReference(globalContext, arg.objectId);
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
            if (typeof arg === "function") {
              const storedArg = storeStaticFunctionReference(arg);
              return { type: "functionReference", functionId: storedArg };
            }
            const storedArg = storeStaticObjectReference(arg);
            try{
              const stringifiedArg = stringifyEvent(arg);
              return {
                type: "objectReference",
                objectId: storedArg,
                value: stringifiedArg
              };
            } catch (error) {
              return {
                type: "objectReference",
                objectId: storedArg,
                value: undefined,
              };
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

function executeAssignment(value: any, target: any, prop: string): any {
  return (target[prop] = value);
}

function transformEventsInPayload(globalContext: any, payload: any[]): any[] {
  return payload.map((arg) => {
    return argumentToEvent(globalContext, arg) ?? arg;
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

function argumentToEvent(globalContext: any, argument: any): Event | null {
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
      globalContext,
      eventInit
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
  functionObjectId: string,
  payload: any,
  createAndSendResponse: (response: any) => void,
  globalContext: any
): boolean {
  const functionToCall = getFunctionReference(globalContext, functionObjectId);
  console.log("Recieved function call", payload);

  const returnError = (message: string) => {
    console.error(message);
    createAndSendResponse({ error: message });
    return false;
  };

  if (functionToCall === undefined) {
    return returnError(`Function not found on target ${functionObjectId}`);
  }

  console.log("Transforming events in payload", payload);
  const eventedPayload = transformEventsInPayload(globalContext, payload);

  console.log("Executing function", functionToCall, eventedPayload);
  try {
    const result = functionToCall(...eventedPayload);
    Promise.resolve(result)
      .then((resolvedResult: any) => {
        console.log("Result for function", functionToCall, resolvedResult);
        createAndSendResponse(resolvedResult);
      })
      .catch((error: any) => {
        console.error(`Error in function call:`, error);
        createAndSendResponse({ error: error.message });
      });
    return true;
  } catch (error) {
    console.error(`Error in function call:`, error);
    createAndSendResponse({ error: error });
    return false;
  }
  // Indicate that we will send a response asynchronously
}

function executePropertyAccess(
  property: string,
  target: any,
  createAndSendResponse: (response: any) => void
): boolean {
  console.log("Recieved property access", property, target);

  const value = target[property];
  createAndSendResponse(value);
  return false;
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

export type FunctionReferenceResponse = {
  data: { type: "function" };
  messageType: "functionReferenceResponse";
  functionId?: string | undefined;
  iteratorId?: string | undefined;
  correlationId: string;
  deserializeData?: boolean;
};

export type IterableResponse = ObjectReferenceResponse & {
  iteratorId?: string | undefined;
};

function createFunctionResponse(
  correlationId: string,
  functionId: string
): FunctionReferenceResponse {
  return {
    messageType: "functionReferenceResponse" as const,
    correlationId: correlationId,
    deserializeData: false,
    data: { type: "function" },
    functionId: functionId,
  };
}

function createResponse(
  objectId: string,
  result: any,
  correlationId: string
): ObjectReferenceResponse {
  const baseResponse = {
    messageType: "objectReferenceResponse" as const,
    correlationId: correlationId,
  };
  if (!result) {
    return { ...baseResponse, data: undefined };
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
    resultMessage = addIterablesToResponse(objectId, resultMessage);
  }

  return {
    ...resultMessage,
    objectId: objectId,
  };
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
  objectId: string,
  message: ObjectReferenceResponse
): ObjectReferenceResponse {
  const iteratorId = storeObjectReference(objectId, Symbol.iterator);

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
    result === undefined ||
    typeof result === "function"
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

function hasMethods(obj: any): boolean {
  return (
    Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter(
      (prop) => typeof obj[prop] === "function"
    ).length > 0
  );
}
