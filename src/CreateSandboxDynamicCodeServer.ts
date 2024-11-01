import { createProxyObjectFactoryForSandboxContext, createProxyObjectForSandboxContext } from "./CreateProxyObjectForSandboxContext";
import { Function } from "./TypeUtilities";

const pendingPromises = new Map<string, (arg: any) => void>();

export function waitForResponse<T>(correlationId: string): Promise<T[keyof T]> {
  const promise = new Promise<T[keyof T]>((resolve, reject) => {
    pendingPromises.set(correlationId, resolve);
    // todo handle timeout
  });
  return promise;
}

/*
export function waitForResponse(correlationId: string): Promise<any> {
  const promise = new Promise((resolve, reject) => {
    pendingPromises.set(correlationId, resolve);
    // todo handle timeout
  });
  return promise;
}
*/

export function createSandboxDynamicCodeServer(
  handler: (
    message: MessageEvent,
    proxies: Window & typeof globalThis
  ) => void
) {
  console.log("creating server");
  const callbackRegistry = new Map<string, Function>();
  // TOOD: consolidate event listeners on sandbox iframe
  const referenceState = window as Window & typeof globalThis;
  window.addEventListener("message", (event) => {
    console.log("Recieved message in sandbox", event.data);
    // initialization message, set config
    if (event.data?.messageType === "initializeConfig") {
      console.log("initializeConfig iframe", event.data);
      return;
    }

    // callback from content script, execute against
    // callback registry
    if (event.data?.messageType === "sandboxCallback") {
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


    if (event.data?.messageType === "objectReferenceResponse") {
      const correlationId = event.data.correlationId;
      if (pendingPromises.has(correlationId)) {
        const objectId = event.data.objectId;
        const proxy = createProxyObjectForSandboxContext(callbackRegistry, referenceState, event.data.data, objectId);
        pendingPromises.get(correlationId)?.(proxy);
        pendingPromises.delete(correlationId);
      }
      return;
    }

    // unknown function call, allow handling by consumer
    const proxies = createProxyObjectFactoryForSandboxContext<
      Window & typeof globalThis
    >(callbackRegistry, referenceState);

    handler(event, proxies);
  });
}
