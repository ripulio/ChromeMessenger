export { createContentScriptApiWrapperForServiceWorker as createContentScriptApiWrapper } from './ContentScriptApiWrapper';


export { createServiceWorkerApiServer } from './ServiceWorkerApiServer';

/**
 * @deprecated These will be unified into a single API wrapper in v2.0.
 */
export { createServiceWorkerApiWrapperForContentScript, createServiceWorkerApiWrapperForSandbox } from './ServiceWorkerApiWrapper';

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

/**
 * @deprecated This interface will be moved to dynamic-ts-transformer in v2.0.
 */
export { IContentScriptTranspilationProxy } from './SandboxDynamicCodeServer';

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
export { ComparisonEngine, ComparisonOperator } from './ComparisonEngine.js';

// Message system
export { 
  MessageRouter,
  MessageHandler,
  SandboxMessage,
  ProxyPropertyAccessMessage,
  ProxyFunctionCallMessage,
  ProxyMethodCallMessage,
  ProxyComparisonMessage,
  ProxyAssignmentMessage,
  SandboxCallbackMessage
} from './MessageTypes.js';

// Message handlers
export { PropertyAccessHandler } from './handlers/PropertyAccessHandler.js';
export { InvocationHandler, FunctionCallHandler, MethodCallHandler, DefaultEventTransformer } from './handlers/InvocationHandler.js';
export { ComparisonHandler } from './handlers/ComparisonHandler.js';
export { AssignmentHandler } from './handlers/AssignmentHandler.js';

// Utilities
export { generateUniqueId } from './TypeUtilities.js';
export { resolveResponse, waitForResponse } from './AsyncResponseDirectory.js';

// Response types
export { IterableResponse } from './Messages/IterableResponse.js';
export { ObjectReferenceResponse } from './Messages/ObjectReferenceResponse.js';

// Refactored server
export { 
  RefactoredContentScriptServer,
  createRefactoredContentScriptServer,
  ContentScriptServerConfig
} from './RefactoredContentScriptServer.js';
export { ExtensionPageMessenger, ExtensionPageApi } from './ExtensionPageMessenger';