import { createObjectWrapperFactory } from "./ObjectWrapperFactory";
import {
  createCallbackRegistry,
  createFunctionWrapperWithCallbackRegistry,
  createObjectWrapperWithCallbackRegistry,
  Function,
} from "./TypeUtilities";

const pendingPromises = new Map<
  string,
  (proxy: any, raw: MessageEvent<any>, error?: string) => void
>();

export function waitForResponse<T>(
  correlationId: string
): Promise<{ proxy: T[keyof T]; raw: any; error?: string }> {
  const promise = new Promise<{ proxy: T[keyof T]; raw: any; error?: string }>(
    (resolve, reject) => {
      pendingPromises.set(correlationId, (proxy, raw, error) =>
        error ? reject(error) : resolve({ proxy, raw })
      );
      // todo handle timeout
    }
  );
  return promise;
}

export function createSandboxDynamicCodeServer(
  handler: (message: MessageEvent, proxies: Window & typeof globalThis) => void
) {
  const callbackRegistry = createCallbackRegistry();
  const referenceState = window as Window & typeof globalThis;

  window.addEventListener("message", (event) => {
    console.log("Recieved message in sandboxed iframe", event.data);
    // initialization message, set config
    if (event.data?.messageType === "initializeConfig") {
      console.error(
        "initializeConfig iframe - if you see this message have a look there's some code to delete",
        event.data
      );
      return;
    }

    if (event.data.deserializeData) {
      event.data.data = JSON.parse(event.data.data);
    }
    // callback from content script, execute against
    // callback registry
    if (event.data?.messageType === "sandboxCallback") {
      return executeCallback(
        event.data.callbackReference,
        callbackRegistry,
        event.data.args
      );
    }

    if (event.data?.messageType === "objectReferenceResponse") {
      const correlationId = event.data.correlationId;

      const objectData =
        event.data.deserializeData && typeof event.data.data === "string"
          ? JSON.parse(event.data.data)
          : event.data.data;

      if (objectData === undefined || objectData === null) {
        resolvePromise(correlationId, undefined, event.data);
        return;
      }
      if (objectData.error) {
        resolvePromise(correlationId, undefined, event.data, objectData.error);
        return;
      }

      const returnValue = createObjectWrapperWithCallbackRegistry(
        [],
        callbackRegistry,
        event.data.iteratorId,
        event.data.objectId,
        objectData
      );
      resolvePromise(correlationId, returnValue, event.data);
      return;
    }

    if (event.data?.messageType === "functionReferenceResponse") {
      const correlationId = event.data.correlationId;
      const returnValue = createFunctionWrapperWithCallbackRegistry(
        event.data.functionName,
        callbackRegistry,
        event.data.functionId
      );
      resolvePromise(correlationId, returnValue, event.data);
      return;
    }

    if (event.data.correlationId) {
      if (event.data.error) {
        resolvePromise(
          event.data.correlationId,
          null,
          event.data,
          event.data.error
        );
      }
      resolvePromise(event.data.correlationId, null, event.data);
      return;
    }

    // unknown function call, allow handling by consumer
    const proxies = createObjectWrapperFactory<Window & typeof globalThis>(
      callbackRegistry,
      referenceState
    );

    handler(event, proxies);
  });
}

function executeCallback(
  callbackReference: string,
  callbackRegistry: Map<string, Function>,
  args: any[]
): void {
  const callbackId = callbackReference.split("|")[1];
  const callback = callbackRegistry.get(callbackId);
  if (callback) {
    // Deserialize each argument
    const deserializedArgs = args.map((arg: any) => {
      if (arg.type === "objectReference") {
        return createObjectWrapperWithCallbackRegistry(
          [],
          callbackRegistry,
          undefined,
          arg.objectId,
          JSON.parse(arg.value)
        );
      }
      if (arg.type === "functionReference") {
        return createFunctionWrapperWithCallbackRegistry(
          undefined,
          callbackRegistry,
          arg.functionId
        );
      }
      return arg;
    });
    callback(...deserializedArgs);
    return;
  }
  throw new Error(`Callback ${callbackReference} not found`);
}

function resolvePromise(
  correlationId: string,
  proxy: any,
  raw: any,
  error?: string
): void {
  pendingPromises.get(correlationId)?.(proxy, raw, error);
  pendingPromises.delete(correlationId);
}
