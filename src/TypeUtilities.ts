type Primitive = string | number | boolean | null | undefined;
export type Function = (...args: any[]) => unknown;

export type ApiWrapper<T> = {
  [K in keyof T]: T[K] extends Function
    ? (...args: Parameters<T[K]>) => ReturnType<T[K]>
    : T[K] extends Primitive
    ? T[K]
    : ApiWrapper<T[K]>;
};

export function createObjectWrapperWithCallbackRegistry<T>(
  invocationHandler: (functionPath: string[], ...args: any[]) => any,
  path: string[],
  callbackRegistry: Map<string, Function>
): T {
  const handler = {
    get(target: any, prop: string) {
      const newPath = [...path, prop];
      return createObjectWrapperWithCallbackRegistry(
        invocationHandler,
        newPath,
        callbackRegistry
      );
    },
    apply(target: any, thisArg: any, args: any[]) {
      // Wrap function arguments
      if (callbackRegistry === undefined) {
        return invocationHandler(path, ...args);
      }
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
      );
      return invocationHandler(path, ...wrappedArgs);
    },
  };

  return new Proxy(function () {}, handler) as T;
}

export function createObjectWrapperWithImmediateProperties<T>(
  invocationHandler: (functionPath: string[], ...args: any[]) => any,
  initialObject: Partial<T>,
  callbackRegistry: Map<string, Function> = new Map()
): T {
  const handler = {
    get(target: any, prop: string) {
      // Check if the property exists in the initialObject
      if (prop in initialObject) {
        return initialObject[prop as keyof Partial<T>];
      }

      // If not, create a new proxy for this property
      return createObjectWrapperWithCallbackRegistry(
        invocationHandler,
        [prop],
        callbackRegistry
      );
    },
    apply(target: any, thisArg: any, args: any[]) {
      // Wrap function arguments
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
      );
      return invocationHandler([], ...wrappedArgs);
    },
  };

  return new Proxy(function () {}, handler) as T;
}

export function createObjectWrapper<T>(
  invocationHandler: (functionPath: string[], ...args: any[]) => any,
  path: string[]
): T {
  const handler = {
    get(target: any, prop: string) {
      const newPath = [...path, prop];
      return createObjectWrapper(invocationHandler, newPath);
    },
    apply(target: any, thisArg: any, args: any[]) {
      // Wrap function arguments
      return invocationHandler(path, ...args);
    },
  };

  return new Proxy(function () {}, handler) as T;
}

function wrapCallback(
  callback: Function,
  callbackRegistry: Map<string, Function>
): string {
  // Generate a unique ID for this callback
  const callbackId = generateUniqueId();
  // Register the callback with the message handler
  callbackRegistry.set(callbackId, callback);
  // Return an object that represents the callback
  return "__callback__|" + callbackId;
}

function generateUniqueId(): string {
  return Math.random().toString(36).slice(2, 11);
}
