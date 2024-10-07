// to run on page that has sandboxed iframe
export function createSandboxProxyServer(iframeId: string) {
  // on message
  console.log("Creating sandbox proxy server");
  let tabId: number | undefined;
  // proxies messages from sandbox to service worker
  window.addEventListener("message", (event) => {
    console.log("Message recieved from sandbox, forwarding to service worker:", event);
    chrome.runtime.sendMessage(
      { ...event.data, sandboxTabId: tabId },
      (response) => {
        event.source!.postMessage(response);
      }
    );
  });

  // proxies messages from service worker to sandbox
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received from service worker:", message);

    if (message.action === "initializeConfig") {
      tabId = message.tabId;
      sendResponse({ success: true });
      return;
    }

    const sandboxWindow = (
      document.getElementById(iframeId) as HTMLIFrameElement
    ).contentWindow;

    if (!sandboxWindow) {
      console.error("No sandbox window found.");
      return;
    }

    // if message is from background, send to sandbox
    sandboxWindow.postMessage(message, "*");
  });
}
