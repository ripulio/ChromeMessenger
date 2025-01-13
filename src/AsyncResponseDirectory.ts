const pendingPromises = new Map<
  string,
  (proxy: any, raw: MessageEvent<any>, error?: string) => void
>();

export function waitForResponse<T>(
  correlationId: string
): Promise<{ proxy: T[keyof T]; raw: any; error?: string }> {
  const promise = new Promise<{ proxy: T[keyof T]; raw: any; error?: string }>(
    (resolve, reject) => {
      pendingPromises.set(correlationId, (proxy, raw, error) =>
        error ? reject(error) : resolve({ proxy, raw })
      );
      // todo handle timeout
    }
  );
  return promise;
}

export function resolveResponse(
  correlationId: string,
  proxy: any,
  raw: any,
  error?: string
): void {
  pendingPromises.get(correlationId)?.(proxy, raw, error);
  pendingPromises.delete(correlationId);
}
