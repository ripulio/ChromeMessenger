const log = (...args: any[]) =>
  console.log("[ExtensionPageMessenger]", ...args);
const warn = (...args: any[]) =>
  console.warn("[ExtensionPageMessenger]", ...args);

export interface IExtensionPageApi {
  runAgent(config?: any): Promise<void>;
  executeCode(code: string, transpile?: boolean): Promise<any>;
  getPageDom(selector?: string): Promise<string>;
  minimizeDOM(selector?: string, options?: any): Promise<string>;
  prepareDom(): Promise<void>;
  // Add other methods as needed
}

/**
 * Messenger for extension pages that can't have content scripts injected.
 * Extension pages use this to register themselves as ready and provide an API.
 */
export class ExtensionPageMessenger {
  private static instance: ExtensionPageMessenger | null = null;
  private extensionPageApis = new Map<number, IExtensionPageApi>();
  private readyExtensionTabs = new Set<number>();

  private constructor() {
    // Listen for extension page registration
    chrome.runtime.onConnect.addListener((port) => {
      if (!port.name.startsWith("ExtensionPageReadiness")) {
        return;
      }

      const tabId = parseInt(port.name.split("-")[1]);
      log("Extension page registering as ready", { tabId });
      
      this.markExtensionTabReady(tabId);
      
      port.onMessage.addListener((msg) => {
        log("Received message from extension page", { tabId, msg });
        // Handle any specific messages from extension pages
      });
      
      port.onDisconnect.addListener(() => {
        log("Extension page disconnected", { tabId });
        this.unreadyExtensionTab(tabId);
      });
    });

    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.removeExtensionTabRecord(tabId);
    });
  }

  public static getInstance(): ExtensionPageMessenger {
    if (!this.instance) {
      this.instance = new ExtensionPageMessenger();
    }
    return this.instance;
  }

  /**
   * Register an API for an extension page tab
   * This is called from the background script when it receives a registration message
   */
  public async registerExtensionPageApi(tabId: number): Promise<void> {
    log("Registering extension page API", { tabId });
    
    // Create a proxy API that sends messages to the extension page
    const api: IExtensionPageApi = {
      async runAgent(config?: any): Promise<void> {
        log("Sending runAgent to extension page", { tabId, config });
        // Send message to the extension page tab
        await chrome.tabs.sendMessage(tabId, {
          type: "EXTENSION_PAGE_API_CALL",
          method: "runAgent",
          args: [config]
        });
      },

      async executeCode(code: string, transpile?: boolean): Promise<any> {
        log("Sending executeCode to extension page", { tabId, code: code.substring(0, 100) + "..." });
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "EXTENSION_PAGE_API_CALL",
          method: "executeCode",
          args: [code, transpile]
        });
        return response;
      },

      async getPageDom(selector?: string): Promise<string> {
        log("Sending getPageDom to extension page", { tabId, selector });
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "EXTENSION_PAGE_API_CALL",
          method: "getPageDom",
          args: [selector]
        });
        return response;
      },

      async minimizeDOM(selector?: string, options?: any): Promise<string> {
        log("Sending minimizeDOM to extension page", { tabId, selector, options });
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "EXTENSION_PAGE_API_CALL",
          method: "minimizeDOM",
          args: [selector, options]
        });
        return response;
      },

      async prepareDom(): Promise<void> {
        log("Sending prepareDom to extension page", { tabId });
        await chrome.tabs.sendMessage(tabId, {
          type: "EXTENSION_PAGE_API_CALL",
          method: "prepareDom",
          args: []
        });
      }
    };

    this.extensionPageApis.set(tabId, api);
    this.markExtensionTabReady(tabId);
  }

  /**
   * Check if a tab is an extension page that's ready
   */
  public isExtensionTabReady(tabId: number): boolean {
    return this.readyExtensionTabs.has(tabId);
  }

  /**
   * Get the API for an extension page tab
   */
  public getExtensionPageApi(tabId: number): IExtensionPageApi | undefined {
    return this.extensionPageApis.get(tabId);
  }

  /**
   * Send a message to an extension page
   */
  public async sendMessageToExtensionPage(tabId: number, message: any): Promise<any> {
    const api = this.extensionPageApis.get(tabId);
    if (!api) {
      throw new Error(`No API registered for extension page tab ${tabId}`);
    }

    // Route the message to the appropriate API method
    const { functionPath, payload } = message;
    
    if (!functionPath || !Array.isArray(functionPath)) {
      throw new Error("Invalid message format: functionPath is required");
    }

    const methodName = functionPath[functionPath.length - 1];
    const method = (api as any)[methodName];
    
    if (typeof method !== 'function') {
      throw new Error(`Method ${methodName} not found on extension page API`);
    }

    return await method.apply(api, payload || []);
  }

  private markExtensionTabReady(tabId: number): void {
    log("Marking extension tab as ready", { tabId });
    this.readyExtensionTabs.add(tabId);
  }

  private unreadyExtensionTab(tabId: number): void {
    log("Marking extension tab as unready", { tabId });
    this.readyExtensionTabs.delete(tabId);
  }

  private removeExtensionTabRecord(tabId: number): void {
    log("Removing extension tab record", { tabId });
    this.readyExtensionTabs.delete(tabId);
    this.extensionPageApis.delete(tabId);
  }
}
