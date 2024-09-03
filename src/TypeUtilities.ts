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
  path: string[]
): T {
  const handler = {
    get(target: any, prop: string) {
      const newPath = [...path, prop];
      return createObjectWrapper(messageHandler, newPath);
    },
    apply(target: any, thisArg: any, args: any[]) {
      return messageHandler(path, ...args);
    }
  };

  return new Proxy(function(){}, handler) as T;
}