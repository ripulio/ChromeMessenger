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
  invocationHandler: (functionPath: string[], ...args: any[]) => Promise<any>,
  propertyAccessHandler: (path: string[]) => Promise<any>,
  path: string[],
  callbackRegistry: Map<string, Function>,
  initialObject?: Partial<T> | undefined,
): T {
  const handler = {
    get(target: any, prop: string, reciever: any) {
      //console.log("reciever", typeof reciever[prop as keyof T]);
      console.log("target", typeof target[prop as keyof T]);
      console.log("target raw", target);
      console.log("reciever raw", reciever);
      if (initialObject && prop in initialObject) {
        return initialObject[prop as keyof Partial<T>];
      }

      const newPath = [...path, prop];

      // Return a function that can be called
      return (...args: any[]) => {
        const wrappedArgs = args.map((arg: any) =>
          typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
        );
        return invocationHandler(newPath, ...wrappedArgs);
      };
    },
  };

  return new Proxy({} as T, handler) as unknown as T;
}

export function createFunctionWrapperWithCallbackRegistry(
  invocationHandler: (functionPath: string[], ...args: any[]) => Promise<any>,
  functionPath: string[],
  callbackRegistry: Map<string, Function>,
): Function {
  const handler = {
    apply(target: any, thisArg: any, args: any[]) {
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
      );
      return invocationHandler(functionPath, ...wrappedArgs);
    }
  }
  return new Proxy(function () {}, handler) as Function;
}

export function createObjectWrapperWithCallbackRegistry2<T>(
  invocationHandler: (functionPath: string[], ...args: any[]) => Promise<any>,
  propertyAccessHandler: (path: string[]) => Promise<any>,
  path: string[],
  callbackRegistry: Map<string, Function>,
  initialObject?: Partial<T> | undefined,
): T {
  const handler = {
    get(target: any, prop: string, reciever: any) {
      if (initialObject && prop in initialObject) {
        return initialObject[prop as keyof Partial<T>];
      }

      if (typeof target[prop] === 'function') {
        return function(...args: any[]){
          const wrappedArgs = args.map((arg: any) =>
            typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
          );
          return invocationHandler(path, ...wrappedArgs);
        }
      }

      const newPath = [...path, prop];
      return propertyAccessHandler(newPath);
    },
    apply(target: any, thisArg: any, args: any[]) {
      // Wrap function arguments
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
      );
      return invocationHandler(path, ...wrappedArgs);
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
