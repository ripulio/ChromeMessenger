import { createProxyObjectForSandboxContext } from "./BackgroundApiWrapper";
import { Function } from "./TypeUtilities";

let tabId: number | undefined;
const callbackRegistry = new Map<string, Function>();

export function createSandboxDynamicCodeServer(
  handler: (
    message: MessageEvent,
    proxies: Window & typeof globalThis
  ) => void
) {
  console.log("creating server");

  window.addEventListener("message", (event) => {
    // initialization message, set config
    if (event.data.messageType === "initializeConfig") {
      tabId = event.data.tabId;
      console.log("Setting tabId:", tabId);
      return;
    }

    // callback from content script, execute against
    // callback registry
    if (event.data.messageType === "sandboxCallback") {
      const callbackReference = event.data.callbackReference;
      const callbackId = callbackReference.split("|")[1];
      const callback = callbackRegistry.get(callbackId);
      if (callback) {
        // Deserialize each argument
        const deserializedArgs = event.data.args.map((arg: string) =>
          JSON.parse(arg)
        );
        callback(...deserializedArgs);
        return;
      }
      console.error("No callback found for ", callbackReference);
    } 

    // unknown function call, allow handling by consumer
    const proxies = createProxyObjectForSandboxContext<
      Window & typeof globalThis
    >(tabId, callbackRegistry);

    handler(event, proxies);
  });
}
