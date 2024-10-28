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
  invocationHandler: (
    functionPath: string[],
    node: keyof T,
    ...args: any[]
  ) => Promise<T[keyof T]>,
  propertyAccessHandler: (
    functionPath: string[],
    node: keyof T
  ) => Promise<T[keyof T]>,
  path: string[],
  callbackRegistry: Map<string, Function>,
  referenceState: T,
  initialObject?: Partial<T> | undefined
): T {
  const handler = {
    get(target: any, prop: string) {
      if (initialObject && prop in initialObject) {
        return initialObject[prop as keyof Partial<T>];
      }

      const newPath = [...path, prop];

      if (prop === "then") {
        console.error("then called directly on object in get trap", newPath);
        return Promise.resolve();
      }

      return (...args: any[]) => {
        const wrappedArgs = args.map((arg: any) =>
          typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
        );
        return invocationHandler(path, prop as keyof T, ...wrappedArgs);
      };
    },
  };

  return new Proxy({} as T, handler) as unknown as T;
}



export function createFunctionWrapperWithCallbackRegistry<T>(
  invocationHandler: (
    functionPath: string[],
    node: keyof T,
    ...args: any[]
  ) => Promise<any>,
  functionPath: string[],
  node: keyof T,
  callbackRegistry: Map<string, Function>
): Function {
  const handler = {
    apply(target: any, thisArg: any, args: any[]) {
      const wrappedArgs = args.map((arg: any) =>
        typeof arg === "function" ? wrapCallback(arg, callbackRegistry) : arg
      );
      return invocationHandler(functionPath, node, ...wrappedArgs);
    },
  };
  return new Proxy(function () {}, handler) as Function;
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

type PromisifyFunction<T> = T extends (...args: infer A) => infer R
  ? R extends Promise<any>
    ? T
    : (...args: A) => Promise<R>
  : never;

type PromisifyProperty<T> = T extends Function 
  ? PromisifyFunction<T>
  : T extends object
    ? PromiseWrapNamespace<T>
    : Promise<T>;

type PromiseWrapNamespace<T> = {
  [K in keyof T as `ripul_${string & K}`]: PromisifyProperty<T[K]>
};

type ChromePromise<T> = PromiseWrapNamespace<T>;

type DeepChromePromise<T> = {
  [K in keyof T]: ChromePromise<T[K]>;
};

export interface ChromeAsync extends DeepChromePromise<typeof chrome>{};
export interface WindowAsync extends DeepChromePromise<typeof window>{};


export {};