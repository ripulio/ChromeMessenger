// to run on page that has sandboxed iframe
export function createSandboxProxyServer(iframeId: string) {
  // on message
  console.log("Creating sandbox proxy server");
  let sandboxTabId: number | undefined;
  let contentScriptTabId: number | undefined;

  // proxies messages from sandbox to service worker
  window.addEventListener("message", (event) => {
    console.log("Message recieved from sandbox, forwarding to service worker:", event);
    chrome.runtime.sendMessage(
      { ...event.data, sandboxTabId: sandboxTabId, contentScriptTabId: contentScriptTabId },
      (response) => {
        console.log("Response from service worker:", response);
        const sandboxWindow = getSandboxWindow(iframeId);
        if (!sandboxWindow) {
          console.error("No sandbox window found.");
          return;
        }
        sandboxWindow.postMessage(response, "*");
      }
    );
  });

  // proxies messages from service worker to sandbox
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Message received from service worker:", message);
    const sandboxWindow = getSandboxWindow(iframeId);
    
    if (message.action === "initializeConfig") {
      sandboxTabId = message.sandboxTabId;
      contentScriptTabId = message.contentScriptTabId;
      if (!sandboxWindow) {
        console.error("No sandbox window found - cannot send iframe initialization message.");
        return;
      }
      sandboxWindow.postMessage({...message}, "*");
      sendResponse({ success: true });
      return false;
    }

    // if message is from background, send to sandbox
    if (!sandboxWindow) {
      console.error("No sandbox window found - cannot send message to sandbox.");
      return;
    }
    sandboxWindow.postMessage(message, "*");
  });
}

function getSandboxWindow(iframeId: string) {
  const sandboxIframe = document.getElementById(iframeId) as HTMLIFrameElement;
  return sandboxIframe.contentWindow;
}
