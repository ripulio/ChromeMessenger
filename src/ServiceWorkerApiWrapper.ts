import { waitForResponse } from "./AsyncResponseDirectory";
import {
  createObjectWrapper,
  generateUniqueId,
  getCallbackRegistry,
  transformArg,
} from "./TypeUtilities";

// Direct implementation for web context (no Chrome extension message passing)
let directImplementation: Record<string, any> | null = null;

/**
 * Sets a direct implementation to use when running outside a Chrome extension context.
 * When set, createServiceWorkerApiWrapperForContentScript will return this implementation
 * directly instead of creating a message-passing proxy.
 *
 * @param impl The implementation object (typically implementing IBackgroundApi or similar)
 */
export function setDirectImplementation<T>(impl: T): void {
  directImplementation = impl as Record<string, any>;
}

/**
 * Clears any previously set direct implementation, reverting to normal behavior.
 */
export function clearDirectImplementation(): void {
  directImplementation = null;
}

/**
 * Checks if we're running in a Chrome extension context with message passing available.
 * Note: chrome.runtime.id is only defined when running inside an extension
 * (content script, service worker, popup, etc.)
 * Regular web pages have chrome.runtime but NOT chrome.runtime.id.
 *
 * Also checks for chrome.storage.local since some dev environments may have
 * chrome.runtime.id but not the storage API.
 */
export function isExtensionContext(): boolean {
  return (
    typeof chrome !== "undefined" &&
    chrome.runtime !== undefined &&
    chrome.runtime.id !== undefined &&
    chrome.storage?.local !== undefined
  );
}

export function createServiceWorkerApiWrapperForContentScript<T>(): T {
  // Web context with registered implementation: return direct impl (no message passing)
  if (!isExtensionContext() && directImplementation) {
    console.log(
      "[ServiceWorkerApiWrapper] Using direct implementation (web context)",
    );
    return directImplementation as T;
  }

  const messageHandler = async (
    functionPath: string[],
    ...args: any[]
  ): Promise<any> => {
    const message = {
      messageType: functionPath,
      payload: args,
    };

    async function sendMessageWithRetry(
      message: any,
      maxRetries = 5,
      delay = 2000,
    ) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Sending message:`, message);
          const response = await chrome.runtime.sendMessage(message);
          return response;
        } catch (error) {
          console.log(`Error sending message: `, error);
          // If it's the final attempt, throw the error.
          if (attempt === maxRetries) {
            throw error;
          }
          // Wait before retrying.
          await new Promise((resolve) => setTimeout(resolve, delay));
          // Optionally, increase the delay for the next attempt.
          delay *= 2;
        }
      }
    }

    const response = await sendMessageWithRetry(message);

    if (!response) {
      const error = chrome.runtime.lastError;
      if (error) {
        console.log(
          "[ServiceWorkerApiWrapper] chrome.runtime.lastError:",
          error,
        );
        throw new Error(error.message);
      }
      throw new Error("No response from service worker");
    }
    if (response.error) {
      // If error is already a stringified object, parse it
      let errorToThrow;
      try {
        errorToThrow = JSON.parse(response.error);
        console.log(
          "[ServiceWorkerApiWrapper] Parsed error object:",
          errorToThrow,
        );
      } catch (e) {
        // Not JSON, create a new error
        errorToThrow = new Error(response.error);
      }
      throw errorToThrow;
    }
    return response.data;
  };
  return createObjectWrapper<T>(messageHandler, []) as T;
}

export function createServiceWorkerApiWrapperForSandbox<T>(
  port: MessagePort,
): T {
  const messageHandler = (
    functionPath: string[],
    ...args: any[]
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const correlationId = generateUniqueId();
      // transform args;
      const callbackRegistry = getCallbackRegistry();
      const transformedArgs = args.map((arg) =>
        callbackRegistry ? transformArg(arg, callbackRegistry) : arg,
      );

      const message = {
        messageType: "ContentScriptApiInvocation",
        functionPath: functionPath.filter((o) => o !== "then"),
        payload: transformedArgs,
        correlationId: correlationId,
      };
      port.postMessage(message);

      return waitForResponse(correlationId).then((response) => {
        resolve(response.raw.data);
      });
    });
  };
  return createObjectWrapper<T>(messageHandler, []) as T;
}
