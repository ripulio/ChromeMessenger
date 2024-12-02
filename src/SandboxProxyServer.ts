// to run on page that has sandboxed iframe
export function createSandboxProxyServer(iframeId: string) {
  // on message
  console.log("Creating sandbox proxy server");
  // proxies messages from service worker to sandbox
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received from service worker:", message);

    const sandboxWindow = getSandboxWindow(iframeId);
    if (!sandboxWindow) {
      console.error(
        `No sandbox iframe found - dropping message ${message}`
      );
      return;
    }

    if (message.action === "initializeConfig") {
      registerSendboxOutgoingMessageProxy(
        message.sandboxTabId,
        message.contentScriptTabId,
        sandboxWindow
      );

      sandboxWindow.postMessage({ ...message }, "*");
      sendResponse({ success: true });
      return false;
    }

    // forward all messages to sandbox
    sandboxWindow.postMessage(message, "*");
  });
}

function registerSendboxOutgoingMessageProxy(
  sandboxTabId: number,
  contentScriptTabId: number,
  sandboxWindow: Window
) {
  // listen to messages hitting this window, should always be from sandbox
  window.addEventListener("message", (event) => {
    console.log(
      "Message recieved from sandbox, forwarding to service worker:",
      event
    );
    // forward to service worker
    chrome.runtime.sendMessage(
      {
        ...event.data,
        sandboxTabId: sandboxTabId,
        contentScriptTabId: contentScriptTabId,
      },
      (response) => {
        console.log("Response from service worker, forwarding to sandbox:", response);
        // forward to sandbox
        sandboxWindow.postMessage(response, "*");
      }
    );
  });
}

function getSandboxWindow(iframeId: string) {
  const sandboxIframe = document.getElementById(iframeId) as HTMLIFrameElement;
  return sandboxIframe.contentWindow;
}
