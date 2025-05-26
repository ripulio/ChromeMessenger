import { resolveResponse, waitForResponse } from "./AsyncResponseDirectory";
import { IterableResponse } from "./Messages/IterableResponse";
import { ObjectReferenceResponse } from "./Messages/ObjectReferenceResponse";
import { generateUniqueId } from "./TypeUtilities";

const objectStore = new Map<string, any>();
let nextObjectId = 1;

// Dedicated log function with fixed prefix
function log(...args: any[]) {
  console.log("[ContentScriptServer]", ...args);
}
function warn(...args: any[]) {
  console.warn("[ContentScriptServer]", ...args);
}
function logError(...args: any[]) {
  // Capture the stack trace but remove the first line (which is this function)
  const stack = new Error().stack?.split("\n").slice(1).join("\n");
  console.error("[ContentScriptServer]", ...args, "\n", stack);
}

export async function createContentScriptApiServer<T extends object>(
  apiFactory: (port: MessagePort) => T,
  globalContext: typeof globalThis,
  getTabId: () => Promise<number>
): Promise<void> {
  log("Starting content script API server initialization");
  const sandboxProxyPort = await getSandboxPort();
  log("Obtained sandbox port, creating API instance");
  const api = apiFactory(sandboxProxyPort);
  log("API instance created successfully");

  const sandboxMessageHandler = async (ev: MessageEvent<any>) => {
    const request = ev.data;

    const createAndSendResponse = (result: any) => {
      const response = createResponse(result, request.correlationId);
      sandboxProxyPort.postMessage(response);
    };

    log("Recieved message over port", ev);
    if (request.source === "sandbox") {
      log(`Processing sandbox message type: ${request.messageType}`);
      switch (request.messageType) {
        case "ProxyAssignment":
          const assignmentResult = executeAssignment(
            request.value,
            getTarget(request.objectId, request.functionPath, globalContext),
            request.property
          );
          createAndSendResponse(assignmentResult);
          return;
        case "ProxyComparison":
          const comparisonResult = executeComparison(
            request.value.operatorKind,
            getTarget(request.objectId, request.functionPath, globalContext),
            hydrateObjectReferenceArg(request.value.value, objectStore)
          );
          createAndSendResponse(comparisonResult);
          return;
        case "ProxyFunctionCall":
          {
            const globalFunction = (globalContext as any)[request.functionName];

            // Enhanced execution with special callback handling
            await executeEnhancedFunctionCall(
              globalFunction,
              injectCallbackPropogationIntoPayload(
                hydrateStoredObjectReferences(request.payload, objectStore),
                request.sandboxTabId,
                sandboxProxyPort
              ),
              createAndSendResponse,
              globalContext,
              request.functionName
            );
          }
          break;
        case "ProxyStoredFunctionCall":
          {
            const storedFunction = objectStore.get(request.objectId);

            // Enhanced execution with special callback handling
            await executeEnhancedFunctionCall(
              storedFunction,
              injectCallbackPropogationIntoPayload(
                hydrateStoredObjectReferences(request.payload, objectStore),
                request.sandboxTabId,
                sandboxProxyPort
              ),
              createAndSendResponse,
              undefined, // No specific target context for stored functions
              `stored_function_${request.objectId}`
            );
          }
          break;
        case "ProxyMethodCall":
          {
            const targetObject = objectStore.get(request.objectId);
            const methodFunction = targetObject[request.methodName];

            // Enhanced execution with special callback handling
            await executeEnhancedFunctionCall(
              methodFunction.bind(targetObject),
              injectCallbackPropogationIntoPayload(
                hydrateStoredObjectReferences(request.payload, objectStore),
                request.sandboxTabId,
                sandboxProxyPort
              ),
              createAndSendResponse,
              targetObject,
              request.methodName
            );
          }
          break;
        case "ProxyPropertyAccess":
          const objectId = request.objectId;
          const objectName = request.objectName;
          const context = request.objectId
            ? objectStore.get(objectId)
            : (globalContext as any)[objectName];
          const property = request.property;
          const result = executePropertyAccess(
            property,
            context,
            createAndSendResponse
          );
          createAndSendResponse(result);
          break;
        case "sandboxCallbackResponse":
          resolveResponse(
            request.correlationId,
            undefined,
            request.data,
            request.error
          );
          break;

        default:
          warn(`Unhandled sandbox message type: ${request.messageType}`);
      }
    } else {
      logError(
        "Recieved non-sandboxed sourced message from sandbox, specify source and/or refactor this",
        request
      );
      executeFunctionCallFromPath(
        request.functionPath,
        injectCallbackPropogationIntoPayload(
          request.payload,
          request.sandboxTabId,
          sandboxProxyPort
        ),
        api,
        createAndSendResponse
      );
    }
  };
  log("Setting up message event listener on sandbox port");
  sandboxProxyPort.addEventListener("message", sandboxMessageHandler);
  sandboxProxyPort.start();
  log("Sandbox port message handling started");

  // for messages from the background?
  log("Setting up Chrome runtime message listener");
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log("Content script recieved message from runtime", request);

    // Handle non-proxy messages
    executeFunctionCallFromPath(
      request.functionPath,
      injectCallbackPropogationIntoPayload(
        request.payload,
        request.sandboxTabId,
        sandboxProxyPort
      ),
      api,
      sendResponse
    );
    return true;
  });
  log("Chrome runtime message listener configured");

  // handle message from the page - from injected code
  // this should only hit calls against the api
  // weakly typed from the page side, so if contentscriptapi functions change, the corresponding
  // injected code will need to change
  log("Setting up window message event listener for injected code");
  window.addEventListener("message", (ev) => {
    if (ev.data.type === "injected-code") {
      log("Received injected-code message from page", ev.data);
      executeFunctionCallFromPath(
        ev.data.functionPath,
        ev.data.payload,
        api,
        () => {}
      );
    }
  });
  log("Window message event listener configured");

  // don't need to wait for this, it's just a notification
  log("Sending ContentScriptReady message to background");
  getTabId().then((tabId) => broadcastReadiness(tabId));

  // If in the future there is a condition where ContentScriptReady is not sent, add a log here explaining why.
  log("Content script API server initialization complete");
}

function broadcastReadiness(tabId: number) {
    // 1. Open a persistent named port - observed in ContentScriptMessenger (sw context)
    const port = chrome.runtime.connect({
      name: "ContentScriptReadiness-" + tabId,
    });
  
    // 2. Send a ping to the port every 25 seconds - observed in ContentScriptMessenger
    const PING_INTERVAL_MS = 25_000;
    setInterval(() => {
      port.postMessage({ type: "ping" });
    }, PING_INTERVAL_MS);
}

async function getSandboxPort(): Promise<MessagePort> {
  // Create and configure the iframe
  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("sandbox.html");

  // Set iframe styles
  Object.assign(iframe.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: "0",
    height: "0",
    border: "none",
    zIndex: "2147483647", // Maximum z-index
    background: "transparent",
  });

  const waitForBody = async () => {
    if (document.body) return document.body;

    return new Promise<HTMLElement>((resolve) => {
      document.addEventListener("DOMContentLoaded", () => {
        resolve(document.body);
      });
    });
  };

  const body = await waitForBody();
  body.appendChild(iframe);

  // Wait for iframe to load
  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
  });

  const channel = new MessageChannel();

  iframe?.contentWindow?.postMessage({ messageType: "port_init" }, "*", [
    channel.port2,
  ]);

  return channel.port1;
}

function getTarget(objectId: string, path: string[], globalContext: any) {
  if (objectId) {
    return objectStore.get(objectId);
  }

  if (path && path.length > 0) {
    let currentTarget = globalContext;
    for (let i = 0; i < path.length - 1; i++) {
      currentTarget = currentTarget[path[i]];
    }
    return currentTarget;
  }

  return globalContext;
}

function executeComparison(
  comparisonIdentifier: string,
  left: any,
  right: any
) {
  log("Executing comparison", comparisonIdentifier, left, right);

  // Map TypeScript SyntaxKind values to comparison operations
  switch (Number(comparisonIdentifier)) {
    case 32: // EqualsEqualsToken
      return left > right;
    case 33: // EqualsEqualsEqualsToken
      return left <= right;
    case 36: // ExclamationEqualsToken
      return left != right;
    case 35: // ExclamationEqualsEqualsToken
      return left !== right;
    case 30: // LessThanToken
      return left < right;
    case 37: // LessThanEqualsToken
      return left === right;
    case 34: // GreaterThanEqualsToken
      return left >= right;
    case 57:
      return left || right;
    default:
      warn(`Unknown comparison operator: ${comparisonIdentifier}`);
      return false;
  }
}

function hydrateStoredObjectReferences(
  payload: any,
  objectStore: Map<string, any>
): any {
  for (const key in payload) {
    const arg = payload[key];
    if (typeof arg === "object") {
      // replace objectReference with actual object
      if (arg !== null && arg.type === "objectReference") {
        payload[key] = objectStore.get(arg.objectId);
      } else {
        // recursively inject object references
        payload[key] = hydrateStoredObjectReferences(arg, objectStore);
      }
    }
  }

  return payload;
}

function hydrateObjectReferenceArg(arg: any, objectStore: Map<string, any>) {
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
  sandboxTabId: number,
  port: MessagePort
): any {
  for (const key in payload) {
    if (
      typeof payload[key] === "string" &&
      payload[key].startsWith("__callback__|")
    ) {
      const callbackReference = payload[key];
      payload[key] = createCallback(callbackReference, sandboxTabId, port);
    }
  }
  return payload;
}

function createCallback(
  callbackReference: string,
  sandboxTabId: number,
  port: MessagePort
) {
  const correlationId = generateUniqueId();
  return async (...args: any[]) => {
    port.postMessage({
      callbackReference: callbackReference,
      sandboxTabId: sandboxTabId,
      messageType: "sandboxCallback",
      correlationId: correlationId,
      args: args.map((arg) => {
        if (typeof arg === "object") {
          return {
            type: "objectReference",
            objectId: storeObjectReference(arg),
            value: stringifyEvent(arg),
          };
        }
        return arg;
      }),
    });
    const result = await waitForResponse<any>(correlationId);
    return result.proxy;
  };
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

function executeAssignment(arg: any, target: any, property: string): boolean {
  return (target[property] = arg);
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
  const eventConstructor = getEventConstructorByName(argument.eventType);
  if (!eventConstructor) {
    logError(`Unknown event type: ${argument.eventType}`);
    return null;
  }

  return new eventConstructor(argument.type, { ...argument });
}

type EventConstructor = {
  new (type: string, eventInitDict?: any): Event;
  prototype: Event;
};

function isEventConstructor(value: any): value is EventConstructor {
  return typeof value === "function";
}

function returnError(
  message: string,
  createAndSendResponse: (response: any) => void
) {
  logError(message);
  createAndSendResponse({ error: message });
  return false;
}

function executeFunctionCall(
  targetFunction: Function,
  payload: any[],
  createAndSendResponse: (response: any) => void
): boolean {
  if (targetFunction === undefined) {
    return returnError(
      `Function ${targetFunction} not found on target.`,
      createAndSendResponse
    );
  }

  log("Transforming events in payload", payload);
  const eventedPayload = transformEventsInPayload(payload);

  log("Executing function", targetFunction, eventedPayload);
  try {
    const result = targetFunction(...eventedPayload);
    Promise.resolve(result)
      .then((resolvedResult: any) => {
        log("Result for function", targetFunction, resolvedResult);
        createAndSendResponse(resolvedResult);
      })
      .catch((error: unknown) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logError(`Error in ${targetFunction.toString()}:`, errorMsg);
        createAndSendResponse({ error: errorMsg });
      });
    return true;
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError(`Error in ${targetFunction.toString()}:`, errorMsg);
    createAndSendResponse({ error: errorMsg });
    return false;
  }
  // Indicate that we will send a response asynchronously
}

function executeFunctionCallFromPath(
  messagePath: string[],
  payload: any,
  target: any,
  createAndSendResponse: (response: any) => void
): boolean {
  log("Recieved function call", messagePath, payload, target);

  const functionName = messagePath[messagePath.length - 1];
  const functionToCall = target[functionName];

  if (functionToCall === undefined) {
    if (payload.length === 0) {
      // potential index call - no args only a path:
      let result = target;
      for (let i = 0; i < messagePath.length; i++) {
        if (result === undefined) {
          const message = `Path ${messagePath
            .slice(0, i + 1)
            .join(".")} access on undefined`;
          return returnError(message, createAndSendResponse);
        }
        result = result[messagePath[i]];
      }

      createAndSendResponse(result);
      return false;
    }

    return returnError(
      `${messagePath.join(".")} not found on target ${target}`,
      createAndSendResponse
    );
  }

  if (typeof functionToCall !== "function" && payload.length === 0) {
    createAndSendResponse(functionToCall);
    return false;
  }

  log("Transforming events in payload", payload);
  const eventedPayload = transformEventsInPayload(payload);

  log("Executing function", functionToCall, eventedPayload);
  try {
    const result = functionToCall.apply(target, eventedPayload);
    Promise.resolve(result)
      .then((resolvedResult: any) => {
        log("Result for function", functionToCall, resolvedResult);
        createAndSendResponse(resolvedResult);
      })
      .catch((error: unknown) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logError(`Error in ${messagePath.join(".")}:`, errorMsg);
        createAndSendResponse({ error: errorMsg });
      });
    return true;
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError(`Error in ${messagePath.join(".")}:`, errorMsg);
    createAndSendResponse({ error: errorMsg });
    return false;
  }
  // Indicate that we will send a response asynchronously
}

function executePropertyAccess(
  property: string,
  target: any,
  createAndSendResponse: (response: any) => void
) {
  log("Recieved property access", property, target);

  let result = target[property];
  if (typeof result === "function") {
    result = result.bind(target);
  }
  createAndSendResponse(result);
}

type FunctionReferenceResponse = {
  messageType: "functionReferenceResponse";
  correlationId: string;
  objectId: string;
  data: string;
};

function createResponse(
  result: any,
  correlationId: string
): ObjectReferenceResponse | FunctionReferenceResponse {
  if (typeof result === "function") {
    const objectId = storeObjectReference(result);
    return {
      messageType: "functionReferenceResponse" as const,
      correlationId: correlationId,
      objectId: objectId,
      data: result.toString(),
    };
  }
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
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError("Error serializing object", errorMsg);
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

// Special callback handling functions
function needsSpecialCallbackHandling(target: any, functionName: string | undefined): boolean {
  if (!functionName) return false;
  
  // List of known callback-based functions that don't return Promises
  const callbackFunctions = new Set([
    'forEach',
    'setTimeout', 
    'setInterval',
    'addEventListener',
    'removeEventListener',
    'requestAnimationFrame',
    'requestIdleCallback'
  ]);

  // Check if it's a known callback function
  if (callbackFunctions.has(functionName)) {
    return true;
  }

  // Check if it's an Array method that takes a callback but doesn't return Promise
  if (Array.isArray(target) && typeof (target as any)[functionName] === 'function') {
    const arrayCallbackMethods = ['forEach'];
    return arrayCallbackMethods.includes(functionName);
  }

  return false;
}

async function transformForEachCall(array: any[], callback: (value: any, index: number, array: any[]) => any): Promise<undefined> {
  // Transform forEach to Promise.all + map for proper async handling
  await Promise.all(array.map(callback));
  return undefined; // forEach returns undefined
}

async function transformSetTimeoutCall(callback: Function, delay: number): Promise<any> {
  return new Promise<any>((resolve) => {
    const timerId = setTimeout(async () => {
      await callback();
      resolve(timerId);
    }, delay);
  });
}

async function executeEnhancedFunctionCall(
  targetFunction: Function,
  payload: any[],
  createAndSendResponse: (response: any) => void,
  target?: any,
  functionName?: string
): Promise<void> {
  if (targetFunction === undefined) {
    returnError(
      `Function ${targetFunction} not found on target.`,
      createAndSendResponse
    );
    return;
  }

  log("Transforming events in payload", payload);
  const eventedPayload = transformEventsInPayload(payload);

  try {
    let result: any;

    // Check if this function needs special callback handling
    if (target && functionName && needsSpecialCallbackHandling(target, functionName)) {
      log(`Applying special handling for ${functionName}`);
      
      if (functionName === 'forEach' && Array.isArray(target)) {
        // Transform forEach to wait for async callbacks
        result = await transformForEachCall(target, eventedPayload[0]);
      } else if (functionName === 'setTimeout') {
        // Transform setTimeout to wait for async callback
        result = await transformSetTimeoutCall(eventedPayload[0], eventedPayload[1]);
      } else {
        // Add more transformations as needed
        log("Executing function with special handling (fallback)", targetFunction, eventedPayload);
        result = targetFunction(...eventedPayload);
      }
    } else {
      // Normal function execution
      log("Executing function", targetFunction, eventedPayload);
      result = targetFunction(...eventedPayload);
    }

    // Handle the result (same as current logic)
    const resolvedResult = await Promise.resolve(result);
    log("Result for function", targetFunction, resolvedResult);
    createAndSendResponse(resolvedResult);
    
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError(`Error in ${functionName || 'function'} execution:`, errorMsg);
    createAndSendResponse({ error: errorMsg });
  }
}
