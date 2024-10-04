type Primitive = string | number | boolean | null | undefined;
type Function = (...args: any[]) => unknown;

export type ApiWrapper<T> = {
  [K in keyof T]: T[K] extends Function
    ? (...args: Parameters<T[K]>) => ReturnType<T[K]>
    : T[K] extends Primitive
    ? T[K]
    : ApiWrapper<T[K]>;
};

export function createObjectWrapper<T>(
  messageHandler: (functionPath: string[], ...args: any[]) => Promise<any>,
  path: string[],
  callbackRegistry?: Map<string, Function> | undefined
): T {
  const handler = {
    get(target: any, prop: string) {
      const newPath = [...path, prop];
      return createObjectWrapper(messageHandler, newPath, callbackRegistry);
    },
    apply(target: any, thisArg: any, args: any[]) {
      // Wrap function arguments
      if (callbackRegistry === undefined) {
        return messageHandler(path, ...args);
      }
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function"
          ? wrapCallback(arg, messageHandler, callbackRegistry)
          : arg
      );
      return messageHandler(path, ...wrappedArgs);
    },
  };

  return new Proxy(function () {}, handler) as T;
}

function wrapCallback(
  callback: Function,
  messageHandler: Function,
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
  return Math.random().toString(36).substr(2, 9);
}
