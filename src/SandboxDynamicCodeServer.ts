import { createObjectWrapperFactory } from "./ObjectWrapperFactory";
import {
  getCallbackRegistry,
  createObjectWrapperWithCallbackRegistry,
} from "./TypeUtilities";
import { resolveResponse } from "./AsyncResponseDirectory";

export function createSandboxDynamicCodeServer(
  handler: (message: MessageEvent, proxies: Window & typeof globalThis, port: MessagePort) => void
) {
  const initListener = (event: MessageEvent) => {
    console.log("Recieved message in sandboxed iframe", event.data);
    if (event.data.messageType !== "port_init") {
      return;
    }

    console.log("Recieved port_init message in sandboxed iframe", event.data);

    window.removeEventListener("message", initListener);

    const callbackRegistry = getCallbackRegistry();
    const referenceState = window as Window & typeof globalThis;

    const port = event.ports[0];
    port.addEventListener("message", (event) => {
      console.log("Recieved message in sandboxed iframe", event.data);
      if (event.data.deserializeData) {
        event.data.data = JSON.parse(event.data.data);
      }
      // callback from content script, execute against
      // callback registry
      if (event.data?.messageType === "sandboxCallback") {
        const result = executeCallback(
          event.data.callbackReference,
          event.data.args,
          port
        );
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
          resolveResponse(
            correlationId,
            undefined,
            event.data,
            objectData.error
          );
          return;
        }

        const returnValue = createObjectWrapperWithCallbackRegistry(
          [],
          callbackRegistry,
          port,
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
        referenceState,
        port
      );

      handler(event, proxies, port);
    });
    port.start();
  };

  window.addEventListener("message", initListener);
}

function executeCallback(callbackReference: string, args: any[], port: MessagePort): any {
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
          port,
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
