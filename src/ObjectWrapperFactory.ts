import {
  createFunctionWrapperWithCallbackRegistry,
  createObjectWrapperWithCallbackRegistry,
} from "./TypeUtilities";
import { Function } from "./TypeUtilities";

export function createObjectWrapperFactory<T>(
  callbackRegistry: Map<string, Function>,
  referenceState: T
): T {
  const handler = {
    get(target: any, prop: string, receiver: any) {
      let propType: string;
      try {
        propType = typeof referenceState[prop as keyof T];
        switch (propType) {
          case "function":
            return createFunctionWrapperWithCallbackRegistry(
              [],
              prop as keyof T,
              callbackRegistry
            );
          case "object":
            return createObjectWrapperWithCallbackRegistry(
              [prop],
              callbackRegistry,
              undefined
            );
          default:
            return createObjectWrapperWithCallbackRegistry(
              [prop],
              callbackRegistry,
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