// to run on page that has sandboxed iframe
export function createSandboxProxyServer(iframeId: string) {
  // on message
  console.log("creating server");

  // proxies messages from sandbox to background
  window.addEventListener("message", (event) => {
    console.log("message received from sandbox", event);
    chrome.runtime.sendMessage(event.data, (response) => {
      event.source!.postMessage(response);
    });
  });

  // proxies messages from service worker to sandbox
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("message received from service worker", message);
    const sandboxWindow = (
      document.getElementById(iframeId) as HTMLIFrameElement
    ).contentWindow;

    if (!sandboxWindow) {
      console.error("No sandbox window found.");
      return;
    }

    // if message is from background, send to sandbox
    if (message.source === "background") {
      sandboxWindow.postMessage(message, "*");
    }

    throw new Error(`Message recieved from unknown source: ${message.source}`);
  });
}
