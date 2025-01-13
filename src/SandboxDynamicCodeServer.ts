import { createObjectWrapperFactory } from "./ObjectWrapperFactory";
import {
  getCallbackRegistry,
  createObjectWrapperWithCallbackRegistry,
} from "./TypeUtilities";
import { resolveResponse } from "./AsyncResponseDirectory";

export function createSandboxDynamicCodeServer(
  handler: (message: MessageEvent, proxies: Window & typeof globalThis) => void
) {
  const callbackRegistry = getCallbackRegistry();
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
      const result = executeCallback(event.data.callbackReference, event.data.args);
    }

    if (event.data?.messageType === "objectReferenceResponse") {
      const correlationId = event.data.correlationId;

      const objectData =
        event.data.deserializeData && typeof event.data.data === "string"
          ? JSON.parse(event.data.data)
          : event.data.data;

      if (objectData === undefined || objectData === null) {
        resolveResponse(correlationId, undefined, event.data);
        return;
      }
      if (objectData.error) {
        resolveResponse(correlationId, undefined, event.data, objectData.error);
        return;
      }

      const returnValue = createObjectWrapperWithCallbackRegistry(
        [],
        callbackRegistry,
        event.data.iteratorId,
        event.data.objectId,
        objectData
      );
      resolveResponse(correlationId, returnValue, event.data);
      return;
    }

    if (event.data.correlationId) {
      if (event.data.error) {
        resolveResponse(
          event.data.correlationId,
          null,
          event.data,
          event.data.error
        );
      }
      resolveResponse(event.data.correlationId, null, event.data);
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

function executeCallback(callbackReference: string, args: any[]): any {
  const callbackRegistry = getCallbackRegistry();
  const callbackId = callbackReference.split("|")[1];
  const callback = callbackRegistry.get(callbackId);
  if (callback) {
    // Deserialize each argument
    const deserializedArgs = args.map((arg: any) => {
      if (arg.type === "objectReference") {
        return createObjectWrapperWithCallbackRegistry(
          [],
          callbackRegistry,
          arg.iteratorId,
          arg.objectId,
          arg.value
        );
      }
      return arg;
    });
    const result = callback(...deserializedArgs);
    if (!result) {
      return;
    }

    if ((result as any).isProxy) {
      return {
        type: "proxyReference",
        proxyId: (result as any).isProxy,
      };
    }

    return;
  }
  throw new Error(`Callback ${callbackReference} not found`);
}

