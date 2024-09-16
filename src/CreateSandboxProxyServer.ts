// to run on page that has sandboxed iframe
export function createSandboxProxyServer(iframeId: string) {
  // on message
  console.log("creating server");

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("message received", message);
    const sandboxWindow = (
      document.getElementById(iframeId) as HTMLIFrameElement
    ).contentWindow;
    if (!sandboxWindow) {
      console.error("No sandbox window found.");
      return;
    }

    // if message is from sandbox, send to background
    if (message.source === "sandbox") {
      chrome.runtime.sendMessage(message, (response) => {
        // if there is a response, send back to sandbox
        sandboxWindow.postMessage(response, "*");
      });
      return;
    }
    // if message is from background, send to sandbox
    if (message.source === "background") {
      sandboxWindow.postMessage(message, "*");
    }
  });
}
