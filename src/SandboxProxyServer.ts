// to run on page that has sandboxed iframe
export function createSandboxProxyServer(iframeId: string) {
  // on message
  console.log("Creating sandbox proxy server");
  // proxies messages from service worker to sandbox

  const initContentScriptPortListener = (ev: MessageEvent<any>) => {
    if (ev.data.messageType !== "port_init") {
      return;
    }
    window.removeEventListener("message", initContentScriptPortListener);

    const message = ev.data;

    const sandboxWindow = getSandboxWindow(iframeId);
    if (!sandboxWindow) {
      console.error(`No sandbox iframe found - dropping message ${message}`);
      return;
    }

    const contentScriptPort = ev.ports[0];

    // initialize sandbox communication channel
    const sandboxChannel = new MessageChannel();
    const sandboxPort = sandboxChannel.port1;
    sandboxPort.onmessage = (ev) => {
      console.log("Received message from sandbox", ev.data);
      // forward all messages to content script
      contentScriptPort.postMessage({...ev.data});
      // wait for response
    };

    // send init message to sandbox
    sandboxWindow.postMessage({ messageType: "port_init" }, "*", [sandboxChannel.port2]);
    sandboxChannel.port2.start();

    // register listener for incoming messages
    // forward all messages to sandbox
    contentScriptPort.onmessage = (ev) => {
      sandboxPort.postMessage(ev.data);
    };
  };

  window.addEventListener("message", initContentScriptPortListener);
}

function getSandboxWindow(iframeId: string) {
  const sandboxIframe = document.getElementById(iframeId) as HTMLIFrameElement;
  return sandboxIframe.contentWindow;
}
