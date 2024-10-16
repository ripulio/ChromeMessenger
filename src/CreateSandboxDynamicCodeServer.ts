import { createProxyObjectFactoryForSandboxContext } from "./CreateProxyObjectForSandboxContext";
import { Function } from "./TypeUtilities";

const callbackRegistry = new Map<string, Function>();

export function createSandboxDynamicCodeServer(
  handler: (
    message: MessageEvent,
    proxies: Window & typeof globalThis
  ) => void
) {
  console.log("creating server");

  window.addEventListener("message", (event) => {
    console.log("Recieved message in sandbox", event.data);
    // initialization message, set config
    if (event.data.messageType === "initializeConfig") {
      console.log("initializeConfig iframe", event.data);
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

    /*
    //event listener for object reference response is 
    //currently listened to in createProxyObjectForSandboxContext.waitForResponse

    if (event.data.messageType === "objectReferenceResponse"){
      const object = event.data;
      if (!object){

      }
      const proxyObject = createProxyObjectForSandboxContext(callbackRegistry, object);
      console.log("proxyObject", proxyObject);
      return;
    }
    */
    // unknown function call, allow handling by consumer
    const proxies = createProxyObjectFactoryForSandboxContext<
      Window & typeof globalThis
    >(callbackRegistry, window as Window & typeof globalThis);

    handler(event, proxies);
  });
}
