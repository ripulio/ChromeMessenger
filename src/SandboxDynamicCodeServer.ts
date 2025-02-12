import { createObjectWrapperFactory } from "./ObjectWrapperFactory";
import {
  getCallbackRegistry,
  createObjectWrapperWithCallbackRegistry,
  createRemoteFunctionWrapperWithCallbackRegistry,
} from "./TypeUtilities";
import { resolveResponse } from "./AsyncResponseDirectory";
import { createServiceWorkerApiWrapperForSandbox } from "./ServiceWorkerApiWrapper";

interface IContentScriptApiBase {
  transpile: (code: string, runtimeArgumentsKeys: string[]) => Promise<string>;
}

export function createSandboxDynamicCodeServer<
  TContentScriptApi extends IContentScriptApiBase = IContentScriptApiBase
>(
  handler: (
    message: MessageEvent,
    createFunction: (
      code: string,
      extraArgs: { [key: string]: any },
      transpile: boolean
    ) => Promise<Function>,
    contentScriptApi: TContentScriptApi
  ) => void
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
    port.addEventListener("message", async (event) => {
      console.log("Recieved message in sandboxed iframe", event.data);
      if (event.data.deserializeData) {
        event.data.data = JSON.parse(event.data.data);
      }
      // callback from content script, execute against
      // callback registry
      if (event.data?.messageType === "sandboxCallback") {
        console.log(
          "Executing callback",
          event.data.callbackReference,
          event.data.args
        );
        const baseMessage = {
          messageType: "sandboxCallbackResponse",
          correlationId: event.data.correlationId,
          source: "sandbox",
        };
        try {
          const result = await executeCallback(
            event.data.callbackReference,
            event.data.args,
            port
          );
          console.log("Callback result", result);
          // send result back with same correlation id
          port.postMessage({
            ...baseMessage,
            data: result,
          });
          return;
        } catch (error: any) {
          console.error("Error executing callback", error);
          port.postMessage({
            ...baseMessage,
            error: error.message,
          });
        }
      }
      if (event.data?.messageType === "functionReferenceResponse") {
        const correlationId = event.data.correlationId;
        const returnValue = createRemoteFunctionWrapperWithCallbackRegistry(
          event.data.objectId,
          callbackRegistry,
          port
        );
        resolveResponse(correlationId, returnValue, event.data);
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

        if (
          typeof objectData === "boolean" ||
          typeof objectData === "number" ||
          typeof objectData === "string"
        ) {
          resolveResponse(correlationId, objectData, event.data);
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

      const contentScriptApi =
        createServiceWorkerApiWrapperForSandbox<TContentScriptApi>(port);
      // unknown function call, allow handling by consumer
      const proxies = createObjectWrapperFactory<Window & typeof globalThis>(
        callbackRegistry,
        referenceState,
        port
      );

      const asyncIterate = async (iterable: AsyncIterable<any>) => {
        if (iterable === undefined) {
          return undefined;
        }
        const result: any[] = [];
        for await (const item of iterable) {
          result.push(item);
        }
        return result;
      };

      const configureFunction = async (
        code: string,
        runtimeArguments: { [key: string]: any },
        transpile: boolean
      ) => {
        const extraArgKeys = Object.keys(runtimeArguments);
        const globalThisKeys = Object.keys(globalThis);
        const allArgNames = [
          ...globalThisKeys,
          ...extraArgKeys,
          "asyncIterate",
          "__newFunction",
        ];

        const transpileCode = async (runtimeCode: string): Promise<string> => {
          const transpiledCode = await contentScriptApi.transpile(
            runtimeCode,
            allArgNames
          );
          return transpiledCode;
        };
        const runDynamicCode = async (transpiledCode: string) => {
          // get all associated objects for parameter names
          const proxyObjects = globalThisKeys.map((key) => {
            if (["caches", "sessionStorage", "localStorage"].includes(key)) {
              return {};
            }
            return (proxies as any)[key];
          });
          const extraArgValues = Object.values(runtimeArguments);
          const args = [
            ...proxyObjects,
            ...extraArgValues,
            asyncIterate,
            runDynamicCode,
          ];

          return () => new Function(...allArgNames, transpiledCode)(...args);
        };

        if (!transpile) {
          return runDynamicCode(code);
        }

        const transpiledCode = await transpileCode(code);
        return runDynamicCode(transpiledCode);
      };

      handler(event, configureFunction, contentScriptApi);
    });
    port.start();
  };

  window.addEventListener("message", initListener);
}

async function executeCallback(
  callbackReference: string,
  args: any[],
  port: MessagePort
): Promise<any> {
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
    const result = await callback(...deserializedArgs);
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
