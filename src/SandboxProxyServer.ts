// to run on page that has sandboxed iframe
export function createSandboxProxyServer(iframeId: string) {
  // on message
  console.log("Creating sandbox proxy server");
  // proxies messages from service worker to sandbox

  const initContentScriptPortListener = (ev: MessageEvent<any>) => {
    window.removeEventListener("message", initContentScriptPortListener);

    const message = ev.data;

    const sandboxWindow = getSandboxWindow(iframeId);
    if (!sandboxWindow) {
      console.error(`No sandbox iframe found - dropping message ${message}`);
      return;
    }

    const contentScriptPort = ev.ports[0];
    contentScriptPort.postMessage({ message: "Iframe channel ready" });

    // register listener for incoming messages
    // forward all messages to sandbox
    contentScriptPort.onmessage = (ev) => {
      sandboxWindow.postMessage(ev.data, "*", [contentScriptPort]);
    };

    sandboxWindow.postMessage({ messageType: "init" });

    // register listener for outgoing messages
    // forward all messages to content script
    registerSendboxOutgoingMessageProxy(sandboxWindow);
    //remove this init event listener
  };

  window.addEventListener("message", initContentScriptPortListener);
}

function registerSendboxOutgoingMessageProxy(
  sandboxWindow: Window
) {
  // listen to messages hitting this window, should always be from sandbox
  window.addEventListener("message", async (event) => {
    console.error("Message recieved from sandbox, but source is not sandbox", event);
    const result = await chrome.runtime.sendMessage(event.data);
    console.error("Response recieved from runtime, forwarding to sandbox iframe.", result);
    sandboxWindow.postMessage({...result}, "*");
  });
}

function getSandboxWindow(iframeId: string) {
  const sandboxIframe = document.getElementById(iframeId) as HTMLIFrameElement;
  return sandboxIframe.contentWindow;
}
