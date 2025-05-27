# Phase 1 Refactoring: Service-Oriented Architecture

This document describes the Phase 1 refactoring that introduces a service-oriented architecture to replace the monolithic ContentScriptServer.

## Overview

The refactoring extracts core services from the monolithic server and introduces proper separation of concerns, structured error handling, and improved type safety.

## New Architecture

### Core Services

#### 1. Logger (`src/core/Logger.ts`)
- Structured logging with configurable levels (DEBUG, INFO, WARN, ERROR)
- Component-based logging with prefixes
- Optional log storage for debugging
- Child logger creation for hierarchical logging

```typescript
const logger = new Logger({
  level: LogLevel.INFO,
  component: 'MyComponent',
  enableConsole: true,
  enableStorage: true
});

logger.info('Operation completed', { data: result });
logger.error('Operation failed', error, { context: 'additional info' });
```

#### 2. Error Handling (`src/core/ErrorHandling.ts`)
- Structured error types with error codes
- Error handler registry for different error types
- Result wrapper types for safe error handling
- Utility functions for common error scenarios

```typescript
// Create specific errors
const error = createObjectNotFoundError('obj_123');

// Use Result wrapper for safe operations
const result = await tryAsync(async () => {
  return await riskyOperation();
});

if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error.message);
}
```

#### 3. Object Store (`src/ObjectStore.ts`)
- Centralized object storage with unique IDs
- Metadata support for iterables and serialization
- Garbage collection for unused objects
- Type-safe object references

```typescript
const store = new ObjectStore();
const reference = store.store(myObject);
console.log(reference.objectId); // "obj_1"

// Later retrieve
const retrieved = store.retrieve(reference.objectId);
```

#### 4. Serialization (`src/Serialization.ts`)
- Comprehensive serialization with circular reference handling
- Configurable depth limits and custom serializers
- Support for DOM nodes, events, errors, and other complex types
- Safe serialization with fallback handling

```typescript
const serializer = new Serializer({
  maxDepth: 3,
  includeNonEnumerable: false,
  includeFunctions: false
});

const serialized = serializer.serialize(complexObject);
```

#### 5. Comparison Engine (`src/ComparisonEngine.ts`)
- Centralized comparison logic with correct TypeScript operator mappings
- Support for proxy object comparisons
- Proper operator precedence and type handling

```typescript
const engine = new ComparisonEngine(logger.debug);
const result = engine.compare(ComparisonOperator.LessThan, left, right);
```

#### 6. Response Factory (`src/core/ResponseFactory.ts`)
- Centralized response creation logic
- Integration with ObjectStore and Serializer
- Consistent response format across all handlers

### Message System

#### Message Types (`src/MessageTypes.ts`)
- Centralized message type definitions with proper TypeScript interfaces
- Message router for type-safe message handling
- Base message interface for consistent structure

**Key Message Types:**
- `ProxyFunctionCall`: For direct global function calls (e.g., `setTimeout`)
- `ProxyMethodCall`: For method calls on objects, both stored objects and global objects like `document`
- `ProxyPropertyAccess`: For property access operations
- `ProxyComparison`: For comparison operations between proxy objects
- `ProxyAssignment`: For property assignment operations

**Message Type Determination:**
The system automatically determines the correct message type based on how proxy objects are created:
- Direct global functions → `FunctionWrapper` → `ProxyFunctionCall`
- Global object methods → `ThenableCallableProxy` with global object detection → `ProxyMethodCall`
- Stored object methods → `ThenableCallableProxy` with `objectId` → `ProxyMethodCall`

#### Message Handlers
Each message type has its own dedicated handler:

- **PropertyAccessHandler**: Handles property access operations
- **InvocationHandler**: Handles function calls with event transformation
- **ComparisonHandler**: Handles comparison operations
- **AssignmentHandler**: Handles property assignments

### Refactored Server

#### RefactoredContentScriptServer (`src/RefactoredContentScriptServer.ts`)
The new server uses dependency injection and composition:

```typescript
const server = new RefactoredContentScriptServer(
  apiFactory,
  globalContext,
  getTabId,
  {
    logLevel: LogLevel.DEBUG,
    enableStoredLogs: true,
    serializationMaxDepth: 5
  }
);

await server.start();
```

## Key Improvements

### 1. Separation of Concerns
- Each service has a single responsibility
- Message handlers are isolated and testable
- Core logic is separated from transport concerns

### 2. Error Handling
- Structured error types with context
- Consistent error handling patterns
- Result wrapper types for safe operations

### 3. Type Safety
- Proper TypeScript interfaces throughout
- Reduced use of `any` types
- Type-safe message routing

### 4. Testability
- Services can be unit tested in isolation
- Dependency injection enables mocking
- Clear interfaces for all components

### 5. Observability
- Structured logging with configurable levels
- Performance monitoring capabilities
- Debug information for troubleshooting

## Migration Guide

### From Original ContentScriptServer

1. **Replace the server creation:**
```typescript
// Old
await createContentScriptApiServer(apiFactory, globalContext, getTabId);

// New
const server = await createRefactoredContentScriptServer(
  apiFactory, 
  globalContext, 
  getTabId,
  { logLevel: LogLevel.INFO }
);
```

2. **Access new debugging features:**
```typescript
// Get object store statistics
const stats = server.getObjectStoreStats();

// Get logs for debugging
const logs = server.getLogs(LogLevel.ERROR);

// Perform garbage collection
server.performGarbageCollection(activeReferences);
```

### Custom Message Handlers

You can register custom message handlers:

```typescript
const customHandler: MessageHandler<MyCustomMessage> = {
  async handle(message: MyCustomMessage) {
    // Custom logic here
    return result;
  }
};

server.messageRouter.register('MyCustomMessageType', customHandler);
```

## Benefits

1. **Maintainability**: Clear separation of concerns makes the code easier to understand and modify
2. **Testability**: Each service can be tested in isolation with proper mocking
3. **Reliability**: Structured error handling and logging improve debugging and monitoring
4. **Performance**: Optimized serialization and object storage with garbage collection
5. **Extensibility**: New message types and handlers can be easily added

## Next Steps (Phase 2)

- Add comprehensive unit tests for all services
- Implement performance monitoring and metrics
- Add configuration management system
- Create integration tests for the complete system
- Add documentation for custom extensions

## Backward Compatibility

The refactored server maintains backward compatibility with existing message formats and APIs. The original ContentScriptServer can still be used alongside the new implementation during migration. 