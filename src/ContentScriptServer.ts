import { MessageRouter } from "./MessageTypes.js";
import { ObjectStore } from "./ObjectStore.js";
import { Serializer } from "./Serialization.js";
import { ComparisonEngine } from "./ComparisonEngine.js";
import { Logger, LogLevel } from "./core/Logger.js";
import {
  ErrorHandlerRegistry,
  DefaultErrorHandler,
  ServerError,
  ErrorCodes,
} from "./core/ErrorHandling.js";

// Import handlers
import {
  PropertyAccessHandler,
  PropertyAccessContext,
} from "./handlers/PropertyAccessHandler.js";
import {
  InvocationHandler,
  InvocationContext,
  DefaultEventTransformer,
} from "./handlers/InvocationHandler.js";
import {
  ComparisonHandler,
  ComparisonContext,
} from "./handlers/ComparisonHandler.js";
import {
  AssignmentHandler,
  AssignmentContext,
} from "./handlers/AssignmentHandler.js";
import {
  StoredFunctionCallHandler,
  StoredFunctionCallContext,
} from "./handlers/StoredFunctionCallHandler.js";
import { ResponseFactory } from "./core/ResponseFactory.js";

export interface ContentScriptServerConfig {
  logLevel?: LogLevel;
  enableStoredLogs?: boolean;
  maxObjectStoreSize?: number;
  serializationMaxDepth?: number;
}

export class ContentScriptServer<T extends object> {
  private readonly logger: Logger;
  private readonly objectStore: ObjectStore;
  private readonly serializer: Serializer;
  private readonly comparisonEngine: ComparisonEngine;
  private readonly errorHandler: ErrorHandlerRegistry;
  private readonly responseFactory: ResponseFactory;
  private readonly messageRouter: MessageRouter;
  private readonly eventTransformer: DefaultEventTransformer;

  private api?: T;

  constructor(
    private apiFactory: () => T,
    private globalContext: typeof globalThis,
    private getTabId: () => Promise<number>,
    config: ContentScriptServerConfig = {},
  ) {
    // Initialize core services
    this.logger = new Logger({
      level: config.logLevel ?? LogLevel.INFO,
      component: "ContentScriptServer",
      enableConsole: true,
      enableStorage: config.enableStoredLogs ?? false,
    });

    this.objectStore = new ObjectStore();

    this.serializer = new Serializer({
      maxDepth: config.serializationMaxDepth ?? 3,
      includeNonEnumerable: false,
      includeFunctions: false,
    });

    this.comparisonEngine = new ComparisonEngine((message, ...args) =>
      this.logger.debug(message, args),
    );

    this.errorHandler = new ErrorHandlerRegistry();
    this.errorHandler.setDefaultHandler(new DefaultErrorHandler(this.logger));

    this.responseFactory = new ResponseFactory({
      objectStore: this.objectStore,
      serializer: this.serializer,
      logger: this.logger.child("ResponseFactory"),
    });

    this.eventTransformer = new DefaultEventTransformer(
      this.logger.child("EventTransformer"),
    );

    // Initialize message router and handlers
    this.messageRouter = new MessageRouter();
    this.setupMessageHandlers();

    this.logger.info("RefactoredContentScriptServer initialized");
  }

  async start(): Promise<void> {
    this.logger.info("Starting content script server");

    try {
      // Get sandbox port and create API
      this.api = this.apiFactory();

      // Setup message handling
      this.setupRuntimeMessageHandling();
      this.setupWindowMessageHandling();

      // Broadcast readiness
      const tabId = await this.getTabId();
      this.broadcastReadiness(tabId);

      this.logger.info("Content script server started successfully");
    } catch (error) {
      this.logger.error("Failed to start content script server", error);
      throw error;
    }
  }

  private setupMessageHandlers(): void {
    const sharedContext = {
      objectStore: this.objectStore,
      globalContext: this.globalContext,
      logger: this.logger.child("Handler"),
    };

    // Property access handler
    const propertyAccessContext: PropertyAccessContext = sharedContext;
    this.messageRouter.register(
      "ProxyPropertyAccess",
      new PropertyAccessHandler(propertyAccessContext),
    );

    // Function call handler
    const invocationContext: InvocationContext = {
      ...sharedContext,
      eventTransformer: (payload) =>
        this.eventTransformer.transformPayload(payload),
    };
    this.messageRouter.register(
      "ProxyFunctionCall",
      new InvocationHandler(invocationContext),
    );
    this.messageRouter.register(
      "ProxyMethodCall",
      new InvocationHandler(invocationContext),
    );

    // Stored function call handler
    const storedFunctionCallContext: StoredFunctionCallContext = {
      ...sharedContext,
      eventTransformer: (payload) =>
        this.eventTransformer.transformPayload(payload),
    };
    this.messageRouter.register(
      "ProxyStoredFunctionCall",
      new StoredFunctionCallHandler(storedFunctionCallContext),
    );

    // Comparison handler
    const comparisonContext: ComparisonContext = {
      ...sharedContext,
      comparisonEngine: this.comparisonEngine,
    };
    this.messageRouter.register(
      "ProxyComparison",
      new ComparisonHandler(comparisonContext),
    );

    // Assignment handler
    const assignmentContext: AssignmentContext = sharedContext;
    this.messageRouter.register(
      "ProxyAssignment",
      new AssignmentHandler(assignmentContext),
    );
  }

  private async executeFunctionFromPath(
    path: string[],
    payload: any,
    target: any,
  ): Promise<any> {
    this.logger.debug("Executing function from path", {
      path,
      payloadLength: payload?.length,
    });

    let current = target;
    for (let i = 0; i < path.length - 1; i++) {
      if (current === undefined || current === null) {
        throw new ServerError(
          `Path segment '${path[i]}' accessed on null/undefined`,
          ErrorCodes.OBJECT_NOT_FOUND,
          { path, failedAt: i },
        );
      }
      current = current[path[i]];
    }

    const functionName = path[path.length - 1];
    const targetFunction = current[functionName];

    if (typeof targetFunction !== "function") {
      if (payload.length === 0) {
        // Property access, not function call
        return targetFunction;
      }
      throw new ServerError(
        `'${path.join(".")}' is not a function`,
        ErrorCodes.FUNCTION_NOT_FOUND,
        { path, actualType: typeof targetFunction },
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
      this.logger.debug("Received runtime message", { request });

      if (!this.api) {
        this.logger.error("API not initialized for runtime message");
        sendResponse({ error: "API not initialized" });
        return true;
      }

      this.executeFunctionFromPath(
        request.functionPath,
        request.payload,
        this.api,
      )
        .then((result) => {
          const response = this.responseFactory.createSimpleResponse(
            result,
            "runtime",
          );
          sendResponse(response.data);
        })
        .catch((error) => {
          this.logger.error("Runtime message execution failed", error);
          sendResponse({
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return true; // Indicate async response
    });

    this.logger.debug("Runtime message handling configured");
  }

  private setupWindowMessageHandling(): void {
    window.addEventListener("message", (event) => {
      if (event.data.type === "injected-code") {
        this.logger.debug("Received injected-code message", {
          data: event.data,
        });

        if (!this.api) {
          this.logger.error("API not initialized for injected code message");
          return;
        }

        this.executeFunctionFromPath(
          event.data.functionPath,
          event.data.payload,
          this.api,
        ).catch((error) => {
          this.logger.error("Injected code execution failed", error);
        });
      }
    });

    this.logger.debug("Window message handling configured");
  }

  private broadcastReadiness(tabId: number): void {
    this.logger.debug("Broadcasting readiness", { tabId });

    const port = chrome.runtime.connect({
      name: `ContentScriptReadiness-${tabId}`,
    });

    // Send periodic pings
    const PING_INTERVAL_MS = 25_000;
    setInterval(() => {
      port.postMessage({ type: "ping" });
    }, PING_INTERVAL_MS);
  }
}

// Factory function for easy creation
export async function createRefactoredContentScriptServer<T extends object>(
  apiFactory: () => T,
  globalContext: typeof globalThis,
  getTabId: () => Promise<number>,
  config?: ContentScriptServerConfig,
): Promise<ContentScriptServer<T>> {
  const server = new ContentScriptServer(
    apiFactory,
    globalContext,
    getTabId,
    config,
  );
  await server.start();
  return server;
}
