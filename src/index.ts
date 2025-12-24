export {
  createContentScriptApiWrapperForServiceWorker as createContentScriptApiWrapper,
  setDirectContentScriptImplementation,
  clearDirectContentScriptImplementation
} from './ContentScriptApiWrapper';


export { createServiceWorkerApiServer } from './ServiceWorkerApiServer';

/**
 * @deprecated These will be unified into a single API wrapper in v2.0.
 */
export { createServiceWorkerApiWrapperForContentScript, createServiceWorkerApiWrapperForSandbox, setDirectImplementation, clearDirectImplementation, isExtensionContext } from './ServiceWorkerApiWrapper';

/**
 * @deprecated Use RefactoredContentScriptServer instead. This legacy proxy server will be removed in v2.0.
 */
export { createSandboxProxyServer } from './SandboxProxyServer';

/**
 * @deprecated This should be moved to dynamic-ts-transformer in v2.0 as it's primarily concerned with code execution, not messaging.
 * 
 * Consider using TranspilationService from dynamic-ts-transformer for transpilation needs.
 */
export { createSandboxDynamicCodeServer } from './SandboxDynamicCodeServer';

export { TabTargetApiWrapper } from './ContentScriptApiWrapper';

// Refactored architecture exports
// Core services
export { Logger, LogLevel } from './core/Logger.js';
export { 
  ServerError, 
  ErrorCodes, 
  ErrorHandlerRegistry,
  DefaultErrorHandler,
  Result,
  success,
  failure,
  tryAsync,
  trySync
} from './core/ErrorHandling.js';
export { ResponseFactory } from './core/ResponseFactory.js';

// Data management
export { ObjectStore, ObjectReference } from './ObjectStore.js';
export { Serializer, shouldSerialize } from './Serialization.js';

// Utilities
export { generateUniqueId } from './TypeUtilities.js';
export { resolveResponse, waitForResponse } from './AsyncResponseDirectory.js';
export { IContentScriptTranspilationProxy } from './SandboxDynamicCodeServer';

// Refactored server
export { 
  ContentScriptServer as RefactoredContentScriptServer,
  createRefactoredContentScriptServer,
  ContentScriptServerConfig
} from './ContentScriptServer.js';