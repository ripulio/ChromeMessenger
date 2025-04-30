// service-worker.ts

interface QueuedMessage {
  message: any;
  resolve: (res: any) => void;
  reject: (err: any) => void;
}

export class ContentScriptMessenger {
  private readyTabs = new Set<number>();
  private messageQueues = new Map<number, QueuedMessage[]>();

  constructor() {
    // load persisted readyTabs
    chrome.storage.local.get({ readyTabs: [] }).then((data) => {
      this.readyTabs = new Set<number>(data.readyTabs);
    });

    // 1) Listen for contentScriptReady pings
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (msg.type === "ContentScriptReady" && sender.tab?.id != null) {
        console.log('[ContentScriptMessenger] Received ContentScriptReady ping, marking tab as ready', { tabId: sender.tab.id, msg, sender });
        this.markTabReady(sender.tab.id);
        console.log(
          "%cContentScriptReady: Tab %d registered as ready",
          "color: blue",
          sender.tab.id
        );
      }
      return false;
    });

    // 2) Mark tab not ready on navigation start
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "loading") {
        console.log('[ContentScriptMessenger] Navigation started, marking tab not ready', { tabId, changeInfo });
        this.markTabNotReady(tabId);
      }
    });

    // 3) Reject/clean up if tab closes while queued
    chrome.tabs.onRemoved.addListener((tabId) => {
      console.log('[ContentScriptMessenger] Tab closed, marking tab not ready and rejecting queued messages', { tabId });
      this.markTabNotReady(tabId);
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
   * Sends a message to the content script in `tabId`, returning a Promise
   * that resolves with the response once the CS is actually listening.
   */
  public sendMessage(tabId: number, message: any): Promise<any> {
    if (this.readyTabs.has(tabId)) {
      return this._doSend(tabId, message);
    }

    // Otherwise queue it until we see a contentScriptReady ping
    console.warn('[ContentScriptMessenger] Tab not in readyTabs, queuing message', {
      tabId,
      message,
      readyTabs: Array.from(this.readyTabs),
      messageQueues: this.messageQueues.has(tabId) ? this.messageQueues.get(tabId) : undefined,
      reason: this.readyTabs.has(tabId)
        ? 'Tab was marked not ready after being ready'
        : 'Tab has never been marked ready (no ContentScriptReady ping received?)',
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
    console.log('[ContentScriptMessenger] Marking tab as ready', { tabId, readyTabs: Array.from(this.readyTabs) });
    this.readyTabs.add(tabId);
    chrome.storage.local.set({ readyTabs: Array.from(this.readyTabs) });

    const queue = this.messageQueues.get(tabId);
    if (queue) {
      queue.forEach(({ message, resolve, reject }) =>
        this._doSend(tabId, message).then(resolve, reject)
      );
      queue.length = 0;
    }
  }

  private markTabNotReady(tabId: number) {
    console.log('[ContentScriptMessenger] Marking tab as not ready', { tabId, readyTabs: Array.from(this.readyTabs) });
    this.readyTabs.delete(tabId);
    chrome.storage.local.set({ readyTabs: Array.from(this.readyTabs) });

    if (!this.messageQueues.has(tabId)) {
      this.messageQueues.set(tabId, []);
    }
  }
}
