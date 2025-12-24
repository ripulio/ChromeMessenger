import {
  createObjectWrapper,
  PromisifyNonPromiseMethods,
} from "./TypeUtilities";

import { ContentScriptMessenger } from "./ContentScriptMessenger";
import { isExtensionContext } from "./ServiceWorkerApiWrapper";

export type TabTargetApiWrapper<T> = {
  forTab(tabId: number): PromisifyNonPromiseMethods<T>;
};

// Direct implementation for web context (no Chrome extension message passing)
let directContentScriptImplementation: Record<string, any> | null = null;

/**
 * Sets a direct implementation to use when running outside a Chrome extension context.
 * When set, createContentScriptApiWrapperForServiceWorker will return this implementation
 * directly instead of creating a message-passing proxy.
 *
 * @param impl The implementation object (typically implementing IContentScriptApi or similar)
 */
export function setDirectContentScriptImplementation<T>(impl: T): void {
  directContentScriptImplementation = impl as Record<string, any>;
}

/**
 * Clears any previously set direct implementation, reverting to normal behavior.
 */
export function clearDirectContentScriptImplementation(): void {
  directContentScriptImplementation = null;
}

export function createContentScriptApiWrapperForServiceWorker<
  T
>(): TabTargetApiWrapper<T> {
  // Web context with registered implementation: return wrapper that uses direct impl
  if (!isExtensionContext() && directContentScriptImplementation) {
    console.log('[ContentScriptApiWrapper] Using direct implementation (web context)');
    return {
      forTab(_tabId: number) {
        // In web context, tabId is ignored - we operate on current page
        return directContentScriptImplementation as PromisifyNonPromiseMethods<T>;
      }
    } as TabTargetApiWrapper<T>;
  }

  const messenger = new ContentScriptMessenger();

  const tabTargetApiWrapper = {
    forTab(tabId: number) {
      const messageHandler = async (
        functionPath: string[],
        ...args: any[]
      ): Promise<any> => {
        const message = {
          messageType: functionPath,
          functionPath: functionPath,
          payload: args,
        };
        console.log(`Sending message: ${JSON.stringify(message)}`);

        try {
          // Try to send the message immediately
          return await messenger.sendMessage(tabId, message, false);
        } catch (error) {
          console.error(`Error sending message to tab ${tabId}: ${error}`);
          // Message failed, likely because content script isn't ready
          throw error;
        }
      };
      return createObjectWrapper<T>(messageHandler, []);
    },
  };
  return tabTargetApiWrapper;
}
