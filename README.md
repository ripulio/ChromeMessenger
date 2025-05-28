# ChromeMessenger

A production-ready messaging framework for natural method calling between all components of a Chrome extension with sandboxed execution support.

## Overview

ChromeMessenger enables seamless communication between different parts of a Chrome extension (background scripts, content scripts, popups, and sandboxed environments) using a natural, promise-based API that feels like direct method calls.

## Key Features

- **Natural Method Calling**: Call methods across extension boundaries as if they were local
- **Promise-Based**: Full async/await support with proper error handling
- **Sandboxed Execution**: Safe code execution in isolated environments
- **Type Safety**: Full TypeScript support with proper type inference
- **Automatic Serialization**: Handles complex objects, functions, and DOM elements
- **Transpilation Services**: Built-in TypeScript transpilation with caching
- **Error Handling**: Comprehensive error handling and debugging support

## Installation

```bash
npm install chromemessenger
```

## Quick Start

### 1. Background Script Setup

```typescript
import { createContentScriptApiWrapper, createServiceWorkerApiServer } from 'chromemessenger';

// Create API wrapper for communicating with content scripts
const contentScriptApi = createContentScriptApiWrapper<IContentScriptApi>();

// Create server to handle incoming calls from content scripts
const backgroundServer = createServiceWorkerApiServer({
  async getData(query: string): Promise<any[]> {
    // This method can be called from content scripts
    return await fetch(`/api/data?q=${query}`).then(r => r.json());
  },
  
  async processData(data: any): Promise<string> {
    // Process data and return result
    return `Processed: ${JSON.stringify(data)}`;
  }
});
```

### 2. Content Script Setup

```typescript
import { createServiceWorkerApiWrapper, createContentScriptApiServer } from 'chromemessenger';

// Create API wrapper for communicating with background script
const backgroundApi = createServiceWorkerApiWrapper<IBackgroundApi>();

// Create server to handle incoming calls from background script
const contentScriptServer = createContentScriptApiServer({
  async getPageData(): Promise<any> {
    // This method can be called from background script
    return {
      title: document.title,
      url: window.location.href,
      elements: document.querySelectorAll('div').length
    };
  },
  
  async clickElement(selector: string): Promise<boolean> {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      element.click();
      return true;
    }
    return false;
  }
});

// Call background script methods naturally
const data = await backgroundApi.getData('search term');
const result = await backgroundApi.processData(data);
```

### 3. Sandboxed Execution

```typescript
import { 
  createSandboxDynamicCodeServer
} from 'chromemessenger';
import { 
  DynamicTsTranspilerFactory, 
  TranspilationService,
  SandboxEnvironment 
} from 'dynamic-ts-transpiler';

// Set up transpilation service
const transpilerFactory = new DynamicTsTranspilerFactory();
const transpilationService = new TranspilationService(transpilerFactory);

// Create sandbox environment
const sandboxEnv = new SandboxEnvironment({
  sandboxUrl: chrome.runtime.getURL('sandbox.html'),
  allowedOrigins: [chrome.runtime.getURL('')]
});

// Create sandbox server for dynamic code execution
const sandboxServer = createSandboxDynamicCodeServer(
  transpilationService,
  sandboxEnv
);

// Execute TypeScript code in sandbox
const code = `
  const result = await fetch('/api/data');
  const data = await result.json();
  return data.map(item => item.name);
`;

const result = await sandboxServer.executeCode(code, {
  sourceUrl: 'dynamic-execution',
  globalProxyNames: ['fetch', 'console'],
  wrapInAsyncIIFE: true
});
```

## Core Components

### API Wrappers

Create type-safe wrappers for cross-extension communication:

```typescript
// For calling content script methods from background
const contentScriptApi = createContentScriptApiWrapper<IContentScriptApi>();

// For calling background methods from content script  
const backgroundApi = createServiceWorkerApiWrapper<IBackgroundApi>();

// For calling methods in sandboxed environments
const sandboxApi = createServiceWorkerApiWrapperForSandbox<ISandboxApi>();
```

### API Servers

Create servers to handle incoming method calls:

```typescript
// Background script server
const backgroundServer = createServiceWorkerApiServer(implementationObject);

// Content script server
const contentScriptServer = createContentScriptApiServer(implementationObject);

// Sandbox proxy server
const sandboxServer = createSandboxProxyServer(implementationObject);
```

### Transpilation Service

Handle TypeScript transpilation with caching using the dynamic-ts-transformer service:

```typescript
import { TranspilationService, TranspilationOptions, DynamicTsTranspilerFactory } from 'dynamic-ts-transpiler';

const transpilerFactory = new DynamicTsTranspilerFactory();
const transpilationService = new TranspilationService(transpilerFactory);

const transpiledCode = await transpilationService.transpileCode(
  'const x: number = 42; console.log(x);',
  {
    sourceUrl: 'my-script',
    globalProxyNames: ['console'],
    debug: false,
    sourceMap: true,
    wrapInAsyncIIFE: true
  }
);
```

### Sandbox Environment

Manage sandboxed execution environments:

```typescript
import { SandboxEnvironment, SandboxEnvironmentConfig } from 'dynamic-ts-transpiler';

const config: SandboxEnvironmentConfig = {
  sandboxUrl: chrome.runtime.getURL('sandbox.html'),
  allowedOrigins: [chrome.runtime.getURL('')],
  timeout: 30000
};

const sandboxEnv = new SandboxEnvironment(config);
const iframe = await sandboxEnv.createSandboxIframe();
```

## Advanced Features

### Object Serialization

ChromeMessenger automatically handles complex object serialization:

```typescript
// DOM elements, functions, and complex objects are automatically serialized
const result = await contentScriptApi.processElement(document.body, {
  callback: (data) => console.log(data),
  metadata: { timestamp: Date.now(), nested: { value: 42 } }
});
```

### Error Handling

Comprehensive error handling with detailed debugging information:

```typescript
try {
  const result = await backgroundApi.riskyOperation();
} catch (error) {
  if (error instanceof ServerError) {
    console.log('Error code:', error.code);
    console.log('Error details:', error.details);
  }
}
```

### Type Utilities

Utility types for better TypeScript integration:

```typescript
import { PromisifyNonPromiseMethods } from 'chromemessenger';

interface MyApi {
  syncMethod(): string;
  asyncMethod(): Promise<number>;
}

// Converts sync methods to async while preserving already async methods
type PromisifiedApi = PromisifyNonPromiseMethods<MyApi>;
// Result: { syncMethod(): Promise<string>; asyncMethod(): Promise<number>; }
```

## Configuration

### Transpilation Options

Transpilation options are provided by dynamic-ts-transformer:

```typescript
import { TranspilationOptions } from 'dynamic-ts-transpiler';

interface TranspilationOptions {
  sourceUrl?: string;              // Source URL for debugging
  globalProxyNames?: string[];     // Global objects to proxy
  globalNonProxyNames?: string[];  // Global objects to exclude from proxying
  debug?: boolean;                 // Enable debug mode
  sourceMap?: boolean;             // Generate source maps
  wrapInAsyncIIFE?: boolean;      // Wrap code in async IIFE
}
```

### Sandbox Environment Config

Sandbox environment configuration is provided by dynamic-ts-transformer:

```typescript
import { SandboxEnvironmentConfig } from 'dynamic-ts-transpiler';

interface SandboxEnvironmentConfig {
  sandboxUrl: string;              // URL to sandbox HTML file
  allowedOrigins: string[];        // Allowed origins for postMessage
  timeout?: number;                // Execution timeout in milliseconds
}
```

## Best Practices

1. **Define Clear Interfaces**: Create TypeScript interfaces for your APIs
2. **Handle Errors Gracefully**: Always wrap API calls in try-catch blocks
3. **Use Transpilation Service**: Leverage caching for better performance
4. **Sandbox Untrusted Code**: Always execute dynamic code in sandboxed environments
5. **Minimize Data Transfer**: Keep serialized objects as small as possible

## Examples

### Complete Extension Setup

```typescript
// background.ts
import { createContentScriptApiWrapper, createServiceWorkerApiServer } from 'chromemessenger';

interface IContentScriptApi {
  getPageInfo(): Promise<{ title: string; url: string }>;
  clickElement(selector: string): Promise<boolean>;
}

interface IBackgroundApi {
  fetchData(url: string): Promise<any>;
  saveData(data: any): Promise<void>;
}

const contentScriptApi = createContentScriptApiWrapper<IContentScriptApi>();

const backgroundServer = createServiceWorkerApiServer<IBackgroundApi>({
  async fetchData(url: string) {
    const response = await fetch(url);
    return response.json();
  },
  
  async saveData(data: any) {
    await chrome.storage.local.set({ data });
  }
});

// content-script.ts
import { createServiceWorkerApiWrapper, createContentScriptApiServer } from 'chromemessenger';

const backgroundApi = createServiceWorkerApiWrapper<IBackgroundApi>();

const contentScriptServer = createContentScriptApiServer<IContentScriptApi>({
  async getPageInfo() {
    return {
      title: document.title,
      url: window.location.href
    };
  },
  
  async clickElement(selector: string) {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      element.click();
      return true;
    }
    return false;
  }
});

// Usage
const pageInfo = await backgroundApi.fetchData('/api/page-info');
await backgroundApi.saveData(pageInfo);
```

## Dependencies

- `dynamic-ts-transpiler`: TypeScript transpilation engine (peer dependency for transpilation services)

## License

ISC

## Deprecation Notice

⚠️ **Some components are being deprecated** as we move towards a cleaner architecture. See [DEPRECATION_GUIDE.md](./DEPRECATION_GUIDE.md) for migration paths and timelines.

**Key Changes:**
- `TranspilationService` moved to `dynamic-ts-transformer`
- `SandboxEnvironment` moved to `dynamic-ts-transformer`  
- `createContentScriptApiServer` → `RefactoredContentScriptServer`
- Several internal utilities will be removed from public API

## Contributing

This library is part of a larger Chrome extension development framework. For issues and contributions, please refer to the main project repository.
