import { createObjectWrapperFactory, createProxyObjectForSandboxContext } from "./CreateProxyObjectForSandboxContext";
import { Function } from "./TypeUtilities";

const pendingPromises = new Map<string, (proxy: any, raw: MessageEvent<any>, error?: string) => void>();

export function waitForResponse<T>(correlationId: string): Promise<{proxy: T[keyof T], raw: any, error?: string}> {
  const promise = new Promise<{proxy: T[keyof T], raw: any, error?: string}>((resolve, reject) => {
    pendingPromises.set(correlationId, (proxy, raw, error) => error ? reject(error) : resolve({proxy, raw}));
    // todo handle timeout
  });
  return promise;
}

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

    if (event.data.deserializeData){
      event.data.data = JSON.parse(event.data.data);
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
        const objectData =  event.data.deserializeData && typeof event.data.data === "string" ? JSON.parse(event.data.data) : event.data.data;
        const objectId = event.data.objectId;
        const iteratorId = event.data.iteratorId;

        if (objectData === undefined || objectData === null){
          pendingPromises.get(correlationId)?.(undefined, event.data);
          pendingPromises.delete(correlationId);
          return;
        }
        if (objectData.error){
          pendingPromises.get(correlationId)?.(undefined, event.data, objectData.error);
        }
        const returnValue =  createProxyObjectForSandboxContext(callbackRegistry, objectId, objectData, iteratorId);
        
        pendingPromises.get(correlationId)?.(returnValue, event.data, objectData.error);
        pendingPromises.delete(correlationId);
      }
      return;
    }

    if (event.data.correlationId) {
      console.log("correlationId", event.data.correlationId);
      pendingPromises.get(event.data.correlationId)?.(null, event.data);
      pendingPromises.delete(event.data.correlationId);
      return;
    }

    // unknown function call, allow handling by consumer
    const proxies = createObjectWrapperFactory<
      Window & typeof globalThis
    >(callbackRegistry, referenceState);

    handler(event, proxies);
  });
}
