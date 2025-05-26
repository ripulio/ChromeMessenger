# ChromeMessenger

A sophisticated Chrome extension framework that enables **dynamic JavaScript execution in sandboxed environments** while providing **transparent access to DOM and browser APIs** through a proxy-based messaging system.

## Overview

ChromeMessenger solves the fundamental Chrome extension security constraint where dynamic code can only run in sandboxed iframes but needs to interact with the main page context. It provides a seamless bridge between these contexts through runtime code transformation and intelligent proxy objects.

## Core Architecture

### Dual-Context Execution Model
- **Sandbox Context**: Where dynamic user code runs (sandboxed iframe)
- **Content Script Context**: Where actual DOM/API operations are executed (main page)
- **Communication Bridge**: MessagePort-based messaging between contexts

### Key Components

#### 1. **TypeUtilities.ts** - Proxy Object System
Creates intelligent proxy objects that route operations through the messaging system:
- `ThenableCallableProxy`: Function-like objects that can be both called and awaited
- `ObjectWrapper`: Wraps remote objects with proxy handlers
- `FunctionWrapper`: Direct wrappers for global functions
- **Serialization Safety**: All proxy objects support JSON serialization and debugging

#### 2. **ContentScriptServer.ts** - Execution Engine
The content script that:
- Maintains an object store mapping IDs to actual DOM/API objects
- Executes operations in the main page context
- Handles callback functions and event propagation
- Transforms arguments between proxy and real objects

#### 3. **SandboxDynamicCodeServer.ts** - Sandbox Environment
Provides the sandboxed execution environment with:
- Proxy object factory for all global objects
- Callback registry for functions callable from content script
- Dynamic function creation with injected proxy objects

## Message Protocol

### Message Types

The system uses a typed message protocol with these key message types:

#### `ProxyFunctionCall`
Used for **direct global function calls**:
```typescript
// Example: setTimeout(callback, 1000)
{
  messageType: "ProxyFunctionCall",
  functionName: "setTimeout",
  payload: [callback, 1000]
}
```

#### `ProxyMethodCall` 
Used for **method calls on objects** (both stored and global):
```typescript
// Example: document.createElement('div')
{
  messageType: "ProxyMethodCall", 
  objectId: "document",
  methodName: "createElement",
  payload: ['div']
}

// Example: storedArray.forEach(callback)
{
  messageType: "ProxyMethodCall",
  objectId: "array123",
  methodName: "forEach", 
  payload: [callback]
}
```

#### `ProxyStoredFunctionCall`
Used for **calling stored function objects**:
```typescript
// Example: calling a stored createElement function
{
  messageType: "ProxyStoredFunctionCall",
  objectId: "obj_19", // The stored function object
  payload: ['table']
}
```

### How Message Types Are Determined

The system automatically determines the correct message type based on **how the proxy object was created**:

#### Path 1: Direct Global Functions
```typescript
// User code: setTimeout(callback, 1000)
// ↓ ObjectWrapperFactory detects typeof setTimeout === "function"
// ↓ Creates: FunctionWrapperWithCallbackRegistry({ functionName: "setTimeout" })
// ↓ Results in: ProxyFunctionCall { functionName: "setTimeout" }
```

#### Path 2: Global Object Methods  
```typescript
// User code: document.createElement('div')
// ↓ ObjectWrapperFactory creates: { kind: "name", value: "document" }
// ↓ Property access creates: ThenableCallableProxy("createElement", { kind: "name", value: "document" })
// ↓ Since "document" is in globalObjectNames set: ProxyMethodCall
```

#### Path 3: Stored Object Methods
```typescript
// User code: array.forEach(callback) 
// ↓ Proxy created with: { kind: "objectId", value: "array123" }
// ↓ Results in: ProxyMethodCall { objectId: "array123", methodName: "forEach" }
```

#### Path 4: Stored Function Objects
```typescript
// User code: createElement('table') where createElement is a stored function
// ↓ Proxy created with: createRemoteFunctionWrapperWithCallbackRegistry("obj_19")
// ↓ Results in: ProxyStoredFunctionCall { objectId: "obj_19" }
```

## Runtime Code Transformation

Works in conjunction with the [dynamic-ts-transformer](../dynamic-ts-transformer) to:
- Convert synchronous calls to asynchronous operations
- Inject proxy detection logic (`isProxy` property access)
- Transform function calls into async IIFEs
- Handle iterators and comparisons

## Key Features

### Transparent Async Conversion
All DOM/API operations become asynchronous but appear synchronous in source code.

### Callback Propagation  
Functions passed as arguments are registered in the sandbox and can be invoked from the content script.

### Object Lifecycle Management
Objects are stored with unique IDs, with automatic serialization/deserialization for primitive values.

### Serialization Safety
- All proxy objects can be safely serialized with `JSON.stringify()`
- Debugging tools can inspect proxy objects without errors
- Transpiled code can access `isProxy` properties for conditional logic

### Error Handling
Comprehensive error propagation between contexts with stack trace preservation.

## Usage Example

```javascript
// User writes normal JavaScript:
const table = document.createElement('table');
const row = table.insertRow();
row.addEventListener('click', () => console.log('clicked'));

// System automatically:
// 1. Transpiles code to use async proxies
// 2. Sends ProxyMethodCall for document.createElement('table')  
// 3. Sends ProxyMethodCall for table.insertRow()
// 4. Sends ProxyMethodCall for row.addEventListener() with callback registration
// 5. Content script executes actual DOM operations
// 6. Results flow back as proxy objects for continued use
```

## Recent Improvements

### Fixed Issues (v1.1.0)
- ✅ **Message Type Determination**: Fixed incorrect `ProxyFunctionCall` vs `ProxyStoredFunctionCall` routing
- ✅ **Serialization Support**: Proxy objects now support JSON serialization and debugging
- ✅ **Transpiler Compatibility**: Fixed `isProxy` property access for transpiled conditional logic
- ✅ **Error Handling**: Improved error messages and stack trace preservation

### Architecture Enhancements
- Robust message type determination based on proxy creation context
- Safe serialization properties (`toJSON`, `valueOf`, `toString` return `undefined`)
- Maintained security boundaries while improving usability

## Architecture Documentation

See [PHASE1_REFACTORING.md](./PHASE1_REFACTORING.md) for details on the service-oriented architecture refactoring.

## Testing

Run the comprehensive test suite:
```bash
npm test
```

The tests include detailed scenarios for message type determination, proxy behavior, serialization safety, and error handling.

## Status

The system is **production-ready** with all major architectural issues resolved. The proxy system correctly handles all message types, supports debugging and serialization, and maintains security boundaries.
