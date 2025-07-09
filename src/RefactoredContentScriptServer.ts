import { MessageRouter, SandboxMessage, SandboxCallbackResponseMessage } from './MessageTypes.js';
import { ObjectStore } from './ObjectStore.js';
import { Serializer } from './Serialization.js';
import { ComparisonEngine } from './ComparisonEngine.js';
import { Logger, LogLevel } from './core/Logger.js';
import { 
  ErrorHandlerRegistry, 
  DefaultErrorHandler, 
  ServerError,
  ErrorCodes 
} from './core/ErrorHandling.js';
import { ResponseFactory } from './core/ResponseFactory.js';
import { resolveResponse, waitForResponse } from './AsyncResponseDirectory.js';
import { generateUniqueId } from './TypeUtilities.js';

// Import handlers
import { PropertyAccessHandler, PropertyAccessContext } from './handlers/PropertyAccessHandler.js';
import { InvocationHandler, InvocationContext, DefaultEventTransformer } from './handlers/InvocationHandler.js';
import { ComparisonHandler, ComparisonContext } from './handlers/ComparisonHandler.js';
import { AssignmentHandler, AssignmentContext } from './handlers/AssignmentHandler.js';
import { StoredFunctionCallHandler, StoredFunctionCallContext } from './handlers/StoredFunctionCallHandler.js';

export interface ContentScriptServerConfig {
  logLevel?: LogLevel;
  enableStoredLogs?: boolean;
  maxObjectStoreSize?: number;
  serializationMaxDepth?: number;
}

export class RefactoredContentScriptServer<T extends object> {
  private readonly logger: Logger;
  private readonly objectStore: ObjectStore;
  private readonly serializer: Serializer;
  private readonly comparisonEngine: ComparisonEngine;
  private readonly errorHandler: ErrorHandlerRegistry;
  private readonly responseFactory: ResponseFactory;
  private readonly messageRouter: MessageRouter;
  private readonly eventTransformer: DefaultEventTransformer;
  
  private sandboxPort?: MessagePort;
  private api?: T;

  constructor(
    private apiFactory: (port: MessagePort) => T,
    private globalContext: typeof globalThis,
    private getTabId: () => Promise<number>,
    config: ContentScriptServerConfig = {}
  ) {
    // Initialize core services
    this.logger = new Logger({
      level: config.logLevel ?? LogLevel.INFO,
      component: 'ContentScriptServer',
      enableConsole: true,
      enableStorage: config.enableStoredLogs ?? false
    });

    this.objectStore = new ObjectStore();
    
    this.serializer = new Serializer({
      maxDepth: config.serializationMaxDepth ?? 3,
      includeNonEnumerable: false,
      includeFunctions: false
    });

    this.comparisonEngine = new ComparisonEngine(
      (message, ...args) => this.logger.debug(message, args)
    );

    this.errorHandler = new ErrorHandlerRegistry();
    this.errorHandler.setDefaultHandler(new DefaultErrorHandler(this.logger));

    this.responseFactory = new ResponseFactory({
      objectStore: this.objectStore,
      serializer: this.serializer,
      logger: this.logger.child('ResponseFactory')
    });

    this.eventTransformer = new DefaultEventTransformer(
      this.logger.child('EventTransformer')
    );

    // Initialize message router and handlers
    this.messageRouter = new MessageRouter();
    this.setupMessageHandlers();

    this.logger.info('RefactoredContentScriptServer initialized');
  }

  async start(): Promise<void> {
    this.logger.info('Starting content script server');
    
    try {
      // Get sandbox port and create API
      this.sandboxPort = await this.getSandboxPort();
      this.api = this.apiFactory(this.sandboxPort);
      
      // Setup message handling
      this.setupSandboxMessageHandling();
      this.setupRuntimeMessageHandling();
      this.setupWindowMessageHandling();
      
      // Broadcast readiness
      const tabId = await this.getTabId();
      this.broadcastReadiness(tabId);
      
      this.logger.info('Content script server started successfully');
    } catch (error) {
      this.logger.error('Failed to start content script server', error);
      throw error;
    }
  }

  private setupMessageHandlers(): void {
    const sharedContext = {
      objectStore: this.objectStore,
      globalContext: this.globalContext,
      logger: this.logger.child('Handler')
    };

    // Property access handler
    const propertyAccessContext: PropertyAccessContext = sharedContext;
    this.messageRouter.register(
      'ProxyPropertyAccess',
      new PropertyAccessHandler(propertyAccessContext)
    );

    // Function call handler
    const invocationContext: InvocationContext = {
      ...sharedContext,
      eventTransformer: (payload) => this.eventTransformer.transformPayload(payload)
    };
    this.messageRouter.register(
      'ProxyFunctionCall',
      new InvocationHandler(invocationContext)
    );
    this.messageRouter.register(
      'ProxyMethodCall',
      new InvocationHandler(invocationContext)
    );

    // Stored function call handler
    const storedFunctionCallContext: StoredFunctionCallContext = {
      ...sharedContext,
      eventTransformer: (payload) => this.eventTransformer.transformPayload(payload)
    };
    this.messageRouter.register(
      'ProxyStoredFunctionCall',
      new StoredFunctionCallHandler(storedFunctionCallContext)
    );

    // Comparison handler
    const comparisonContext: ComparisonContext = {
      ...sharedContext,
      comparisonEngine: this.comparisonEngine
    };
    this.messageRouter.register(
      'ProxyComparison',
      new ComparisonHandler(comparisonContext)
    );

    // Assignment handler
    const assignmentContext: AssignmentContext = sharedContext;
    this.messageRouter.register(
      'ProxyAssignment',
      new AssignmentHandler(assignmentContext)
    );
  }

  private setupSandboxMessageHandling(): void {
    if (!this.sandboxPort) {
      throw new Error('Sandbox port not initialized');
    }

    this.sandboxPort.addEventListener('message', async (event) => {
      const request = event.data;
      
      this.logger.debug('Received sandbox message', {
        messageType: request.messageType,
        correlationId: request.correlationId
      });

      try {
        if (request.source === 'sandbox') {
          await this.handleSandboxMessage(request);
        } else {
          // Handle legacy non-sandbox messages
          await this.handleLegacyMessage(request);
        }
      } catch (error) {
        this.logger.error('Error handling sandbox message', error, {
          messageType: request.messageType,
          correlationId: request.correlationId
        });
        
        this.sendErrorResponse(request.correlationId, error);
      }
    });

    this.sandboxPort.start();
    this.logger.debug('Sandbox message handling started');
  }

  private async handleSandboxMessage(request: SandboxMessage): Promise<void> {
    try {
      // Handle special case for sandbox callback responses
      if (request.messageType === 'sandboxCallbackResponse') {
        const callbackRequest = request as SandboxCallbackResponseMessage;
        resolveResponse(
          callbackRequest.correlationId,
          undefined,
          callbackRequest.data,
          callbackRequest.error
        );
        return; // No response needed for callback responses
      }

      // Inject callback propagation for messages that have payloads and sandboxTabId
      if ('payload' in request && 'sandboxTabId' in request) {
        const processedRequest = {
          ...request,
          payload: this.injectCallbackPropagationIntoPayload(
            this.hydrateStoredObjectReferences(request.payload),
            this.sandboxPort!
          )
        };
        const result = await this.messageRouter.route(processedRequest);
        const response = this.responseFactory.createResponse(result, request.correlationId);
        this.sandboxPort!.postMessage(response);
      } else {
        const result = await this.messageRouter.route(request);
        const response = this.responseFactory.createResponse(result, request.correlationId);
        this.sandboxPort!.postMessage(response);
      }
    } catch (error) {
      this.errorHandler.handle(error instanceof Error ? error : new Error(String(error)));
      this.sendErrorResponse(request.correlationId, error);
    }
  }

  private async handleLegacyMessage(request: any): Promise<void> {
    if (!this.api) {
      throw new Error('API not initialized');
    }

    // Handle legacy function path calls
    if (request.functionPath) {
      // Inject callback propagation into payload like the original server
      const processedPayload = this.injectCallbackPropagationIntoPayload(
        request.payload,
        this.sandboxPort!
      );

      const result = await this.executeFunctionFromPath(
        request.functionPath,
        processedPayload,
        this.api
      );
      
      const response = this.responseFactory.createResponse(result, request.correlationId);
      this.sandboxPort!.postMessage(response);
    }
  }

  private async executeFunctionFromPath(
    path: string[],
    payload: any,
    target: any
  ): Promise<any> {
    this.logger.debug('Executing function from path', { path, payloadLength: payload?.length });

    let current = target;
    for (let i = 0; i < path.length - 1; i++) {
      if (current === undefined || current === null) {
        throw new ServerError(
          `Path segment '${path[i]}' accessed on null/undefined`,
          ErrorCodes.OBJECT_NOT_FOUND,
          { path, failedAt: i }
        );
      }
      current = current[path[i]];
    }

    const functionName = path[path.length - 1];
    const targetFunction = current[functionName];

    if (typeof targetFunction !== 'function') {
      if (payload.length === 0) {
        // Property access, not function call
        return targetFunction;
      }
      throw new ServerError(
        `'${path.join('.')}' is not a function`,
        ErrorCodes.FUNCTION_NOT_FOUND,
        { path, actualType: typeof targetFunction }
      );
    }

    // Transform events in payload
    const processedPayload = this.eventTransformer.transformPayload(payload);
    
    // Execute function
    const result = targetFunction.apply(current, processedPayload);
    return await Promise.resolve(result);
  }

  private setupRuntimeMessageHandling(): void {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.logger.debug('Received runtime message', { request });

      if (!this.api) {
        this.logger.error('API not initialized for runtime message');
        sendResponse({ error: 'API not initialized' });
        return true;
      }

      this.executeFunctionFromPath(request.functionPath, request.payload, this.api)
        .then(result => {
          const response = this.responseFactory.createSimpleResponse(result, 'runtime');
          sendResponse(response.data);
        })
        .catch(error => {
          this.logger.error('Runtime message execution failed', error);
          sendResponse({ error: error instanceof Error ? error.message : String(error) });
        });

      return true; // Indicate async response
    });

    this.logger.debug('Runtime message handling configured');
  }

  private setupWindowMessageHandling(): void {
    window.addEventListener('message', (event) => {
      if (event.data.type === 'injected-code') {
        this.logger.debug('Received injected-code message', { data: event.data });

        if (!this.api) {
          this.logger.error('API not initialized for injected code message');
          return;
        }

        this.executeFunctionFromPath(event.data.functionPath, event.data.payload, this.api)
          .catch(error => {
            this.logger.error('Injected code execution failed', error);
          });
      }
    });

    this.logger.debug('Window message handling configured');
  }

  private sendErrorResponse(correlationId: string, error: any): void {
    if (!this.sandboxPort) return;

    const errorResponse = this.responseFactory.createErrorResponse(error, correlationId);
    this.sandboxPort.postMessage(errorResponse);
  }

  private async getSandboxPort(): Promise<MessagePort> {
    this.logger.debug('Creating sandbox iframe and establishing port connection');

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sandbox.html');
    
    Object.assign(iframe.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: '0',
      height: '0',
      border: 'none',
      zIndex: '2147483647',
      background: 'transparent'
    });

    // Wait for body and append iframe
    const body = await this.waitForBody();
    body.appendChild(iframe);

    // Wait for iframe to load
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
    });

    // Create message channel and send port
    const channel = new MessageChannel();
    iframe.contentWindow?.postMessage(
      { messageType: 'port_init' }, 
      '*', 
      [channel.port2]
    );

    this.logger.debug('Sandbox port connection established');
    return channel.port1;
  }

  private async waitForBody(): Promise<HTMLElement> {
    if (document.body) return document.body;

    return new Promise<HTMLElement>((resolve) => {
      document.addEventListener('DOMContentLoaded', () => {
        resolve(document.body);
      });
    });
  }

  private broadcastReadiness(tabId: number): void {
    this.logger.debug('Broadcasting readiness', { tabId });

    const port = chrome.runtime.connect({
      name: `ContentScriptReadiness-${tabId}`
    });

    // Send periodic pings
    const PING_INTERVAL_MS = 25_000;
    setInterval(() => {
      port.postMessage({ type: 'ping' });
    }, PING_INTERVAL_MS);
  }

  // Public methods for debugging and monitoring
  getObjectStoreStats(): { size: number; objects: string[] } {
    return {
      size: this.objectStore.getSize(),
      objects: this.objectStore.getObjectIds()
    };
  }

  getLogs(level?: LogLevel) {
    return this.logger.getEntries(level);
  }

  clearLogs(): void {
    this.logger.clear();
  }

  performGarbageCollection(activeReferences: Set<string>): void {
    this.objectStore.gc(activeReferences);
    this.logger.info('Garbage collection completed', {
      remainingObjects: this.objectStore.getSize()
    });
  }

  // Callback handling methods (ported from original server)
  private injectCallbackPropagationIntoPayload(
    payload: any,
    port: MessagePort
  ): any {
    for (const key in payload) {
      if (
        typeof payload[key] === "string" &&
        payload[key].startsWith("__callback__|")
      ) {
        const callbackReference = payload[key];
        payload[key] = this.createCallback(callbackReference, port);
      }
    }
    return payload;
  }

  private createCallback(
    callbackReference: string,
    port: MessagePort
  ) {
    const correlationId = generateUniqueId();
    return async (...args: any[]) => {
      port.postMessage({
        callbackReference: callbackReference,
        messageType: "sandboxCallback",
        correlationId: correlationId,
        args: args.map((arg) => {
          if (typeof arg === "object") {
            return {
              type: "objectReference",
              objectId: this.objectStore.store(arg).objectId,
              value: this.stringifyEvent(arg),
            };
          }
          return arg;
        }),
      });
      const result = await waitForResponse<any>(correlationId);
      return result.proxy;
    };
  }

  private stringifyEvent(e: any) {
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

  private hydrateStoredObjectReferences(
    payload: any
  ): any {
    for (const key in payload) {
      const arg = payload[key];
      if (typeof arg === "object") {
        // replace objectReference with actual object
        if (arg !== null && arg.type === "objectReference") {
          payload[key] = this.objectStore.retrieve(arg.objectId);
        } else {
          // recursively inject object references
          payload[key] = this.hydrateStoredObjectReferences(arg);
        }
      }
    }

    return payload;
  }
}

// Factory function for easy creation
export async function createRefactoredContentScriptServer<T extends object>(
  apiFactory: (port: MessagePort) => T,
  globalContext: typeof globalThis,
  getTabId: () => Promise<number>,
  config?: ContentScriptServerConfig
): Promise<RefactoredContentScriptServer<T>> {
  const server = new RefactoredContentScriptServer(apiFactory, globalContext, getTabId, config);
  await server.start();
  return server;
} 