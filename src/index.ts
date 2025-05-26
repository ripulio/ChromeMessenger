export { createContentScriptApiWrapperForServiceWorker as createContentScriptApiWrapper } from './ContentScriptApiWrapper';
export { createContentScriptApiServer} from './ContentScriptServer';
export { createServiceWorkerApiServer } from './ServiceWorkerApiServer';
export { createServiceWorkerApiWrapperForContentScript, createServiceWorkerApiWrapperForSandbox } from './ServiceWorkerApiWrapper';
export { createSandboxProxyServer } from './SandboxProxyServer';
export { createSandboxDynamicCodeServer } from './SandboxDynamicCodeServer';
export { TabTargetApiWrapper } from './ContentScriptApiWrapper';
export { PromisifyNonPromiseMethods} from './TypeUtilities';
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

// Refactored server
export { 
  RefactoredContentScriptServer,
  createRefactoredContentScriptServer,
  ContentScriptServerConfig
} from './RefactoredContentScriptServer.js';