export {
  createContentScriptApiWrapperForServiceWorker,
  setDirectContentScriptImplementation,
  clearDirectContentScriptImplementation,
} from "./ContentScriptApiWrapper";

export { createServiceWorkerApiServer } from "./ServiceWorkerApiServer";

/**
 * @deprecated These will be unified into a single API wrapper in v2.0.
 */
export {
  createServiceWorkerApiWrapperForContentScript,
  createServiceWorkerApiWrapperForSandbox,
  setDirectImplementation,
  clearDirectImplementation,
  isExtensionContext,
} from "./ServiceWorkerApiWrapper";

export { TabTargetApiWrapper } from "./ContentScriptApiWrapper";

// Refactored architecture exports
// Core services
export { Logger, LogLevel } from "./core/Logger.js";
export {
  ServerError,
  ErrorCodes,
  ErrorHandlerRegistry,
  DefaultErrorHandler,
  Result,
  success,
  failure,
  tryAsync,
  trySync,
} from "./core/ErrorHandling.js";

// Data management
export { ObjectStore, ObjectReference } from "./ObjectStore.js";
export { Serializer, shouldSerialize } from "./Serialization.js";

// Utilities
export { generateUniqueId } from "./TypeUtilities.js";
export { resolveResponse, waitForResponse } from "./AsyncResponseDirectory.js";

// Refactored server
export {
  ContentScriptServer as RefactoredContentScriptServer,
  createRefactoredContentScriptServer,
  ContentScriptServerConfig,
} from "./ContentScriptServer.js";
