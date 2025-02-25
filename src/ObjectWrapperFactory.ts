import {
  createFunctionWrapperWithCallbackRegistry,
  createObjectWrapperWithCallbackRegistry,
} from "./TypeUtilities";
import { Function } from "./TypeUtilities";

export function createObjectWrapperFactory<T>(
  callbackRegistry: Map<string, Function>,
  referenceState: T,
  port: MessagePort
): T {
  const handler = {
    get(target: any, prop: string, receiver: any) {
      let propType: string;
      try {
        propType = typeof referenceState[prop as keyof T];
        switch (propType) {
          case "function":
            return createFunctionWrapperWithCallbackRegistry(
              { functionName: prop },
              callbackRegistry,
              port
            );
          case "object":
            return createObjectWrapperWithCallbackRegistry(
              { kind: "name", value: prop },
              callbackRegistry,
              port,
              undefined,
              undefined
            );
          default:
            return createObjectWrapperWithCallbackRegistry(
              { kind: "name", value: prop },
              callbackRegistry,
              port,
              undefined,
              undefined
            );
        }
      } catch (e) {
        console.error("error", e);
        return undefined;
      }
    },
    apply(target: any, thisArg: any, argumentsList: any[]) {
      console.error("apply", target, thisArg, argumentsList);
      return target.apply(thisArg, argumentsList);
    },
  };

  return new Proxy(function () {}, handler) as T;
}
