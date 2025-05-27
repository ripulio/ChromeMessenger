// service-worker.ts

import { ExtensionPageMessenger } from "./ExtensionPageMessenger";

// Dedicated log function with fixed prefix
function log(...args: any[]) {
  console.log("[ContentScriptMessenger]", ...args);
}
function warn(...args: any[]) {
  console.warn("[ContentScriptMessenger]", ...args);
}
function logError(...args: any[]) {
  // Capture the stack trace but remove the first line (which is this function)
  const stack = new Error().stack?.split("\n").slice(1).join("\n");
  console.error("[ContentScriptMessenger]", ...args, "\n", stack);
}

interface QueuedMessage {
  message: any;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

export class ContentScriptMessenger {
  private readyTabs = new Set<number>();
  private messageQueues = new Map<number, QueuedMessage[]>();
  private extensionPageMessenger: ExtensionPageMessenger;

  constructor() {
    this.extensionPageMessenger = ExtensionPageMessenger.getInstance();
    
    // load persisted readyTabs
    chrome.storage.local.get({ readyTabs: [] }).then((data) => {
      this.readyTabs = new Set(Array.isArray(data.readyTabs) ? data.readyTabs : []);
    });

    // 1) Listen for contentScriptReadiness port connection
    chrome.runtime.onConnect.addListener((port) => {
      if (!port.name.startsWith("ContentScriptReadiness")) {
        return;
      }

      const tabId = parseInt(port.name.split("-")[1]);
      this.markTabReady(tabId);
      port.onMessage.addListener((msg) => {
        console.info("Received message from contentScriptReadiness port", {
          tabId,
          msg,
        });
      });
      port.onDisconnect.addListener(() => {
        this.unreadyTab(tabId);
      });
    });

    // 3) Reject/clean up if tab closes while queued
    chrome.tabs.onRemoved.addListener((tabId) => {
      log("Tab closed, marking tab not ready and rejecting queued messages", {
        tabId,
      });
      this.removeTabRecord(tabId);
      const queue = this.messageQueues.get(tabId);
      if (queue) {
        queue.forEach((q) =>
          q.reject(new Error("Tab closed before message could be delivered"))
        );
        this.messageQueues.delete(tabId);
      }
    });
  }

  /**
   * Check if a tab is ready (either content script or extension page)
   */
  private isTabReady(tabId: number): boolean {
    return this.readyTabs.has(tabId) || this.extensionPageMessenger.isExtensionTabReady(tabId);
  }

  /**
   * Sends a message to the content script in `tabId`, returning a Promise
   * that resolves with the response once the CS is actually listening.
   * Now also handles extension pages.
   */
  public sendMessage(tabId: number, message: any): Promise<any> {
    // Check if it's an extension page first
    if (this.extensionPageMessenger.isExtensionTabReady(tabId)) {
      log("Sending message to extension page", { tabId, message });
      return this.extensionPageMessenger.sendMessageToExtensionPage(tabId, message);
    }

    // Handle regular content script tabs
    if (this.readyTabs.has(tabId)) {
      return this._doSend(tabId, message);
    }

    // Otherwise queue it until we see a contentScriptReady ping
    warn("Tab not in readyTabs, queuing message", {
      tabId,
      message,
      readyTabs: Array.from(this.readyTabs),
      extensionTabs: Array.from(this.extensionPageMessenger['readyExtensionTabs'] || []),
      messageQueues: this.messageQueues.has(tabId)
        ? this.messageQueues.get(tabId)
        : undefined,
      reason: this.readyTabs.has(tabId)
        ? "Tab was marked not ready after being ready"
        : "Tab has never been marked ready (no ContentScriptReady ping received?)",
    });
    return new Promise<any>((resolve, reject) => {
      const queue = this.messageQueues.get(tabId) ?? [];
      queue.push({ message, resolve, reject });
      this.messageQueues.set(tabId, queue);
    });
  }

  /** Internal wrapper around chrome.tabs.sendMessage → Promise */
  private async _doSend(tabId: number, message: any): Promise<any> {
    // chrome.tabs.sendMessage now returns a Promise<CSResponse> in MV3
    return await chrome.tabs.sendMessage(tabId, message);
  }

  // 3) Persist ready state whenever it changes:
  private markTabReady(tabId: number) {
    log("Marking tab as ready", {
      tabId,
      readyTabs: Array.from(this.readyTabs),
    });
    this.readyTabs.add(tabId);
    chrome.storage.local.set({ readyTabs: this.readyTabs });

    const queue = this.messageQueues.get(tabId);
    if (queue) {
      queue.forEach(({ message, resolve, reject }) =>
        this._doSend(tabId, message).then(resolve, reject)
      );
      queue.length = 0;
    }
  }

  private unreadyTab(tabId: number) {
    log("Marking tab as unready", {
      tabId,
      readyTabs: Array.from(this.readyTabs),
    });
    this.readyTabs.delete(tabId);
    chrome.storage.local.set({ readyTabs: Array.from(this.readyTabs) });

    if (!this.messageQueues.has(tabId)) {
      this.messageQueues.set(tabId, []);
    }
  }

  private removeTabRecord(tabId: number) {
    log("Removing tab record", {
      tabId,
      readyTabs: Array.from(this.readyTabs),
    });
    this.readyTabs.delete(tabId);
    chrome.storage.local.set({ readyTabs: Array.from(this.readyTabs) });
    this.messageQueues.delete(tabId);
  }
}
