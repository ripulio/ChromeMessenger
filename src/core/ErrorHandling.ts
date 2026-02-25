// Centralized error handling system
export enum ErrorCodes {
  OBJECT_NOT_FOUND = "OBJECT_NOT_FOUND",
  FUNCTION_NOT_FOUND = "FUNCTION_NOT_FOUND",
  FUNCTION_EXECUTION_FAILED = "FUNCTION_EXECUTION_FAILED",
  INVALID_ARGUMENTS = "INVALID_ARGUMENTS",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

export class ServerError extends Error {
  public readonly code: ErrorCodes;
  public readonly context?: any;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: ErrorCodes = ErrorCodes.UNKNOWN_ERROR,
    context?: any,
    cause?: Error,
  ) {
    super(message);
    this.name = "ServerError";
    this.code = code;
    this.context = context;
    this.timestamp = new Date();

    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

interface ErrorHandler {
  handle(error: Error | ServerError): void;
}

export class DefaultErrorHandler implements ErrorHandler {
  constructor(
    private logger?: {
      error: (message: string, error?: Error, data?: any) => void;
    },
  ) {}

  handle(error: Error | ServerError): void {
    if (error instanceof ServerError) {
      this.logger?.error(
        `Server error [${error.code}]: ${error.message}`,
        error,
        error.context,
      );
    } else {
      this.logger?.error(`Unexpected error: ${error.message}`, error);
    }
  }
}

export class ErrorHandlerRegistry {
  private handlers = new Map<ErrorCodes, ErrorHandler[]>();
  private defaultHandler?: ErrorHandler;

  setDefaultHandler(handler: ErrorHandler): void {
    this.defaultHandler = handler;
  }

  register(code: ErrorCodes, handler: ErrorHandler): void {
    if (!this.handlers.has(code)) {
      this.handlers.set(code, []);
    }
    this.handlers.get(code)!.push(handler);
  }

  handle(error: Error | ServerError): void {
    if (error instanceof ServerError) {
      const handlers = this.handlers.get(error.code);
      if (handlers && handlers.length > 0) {
        handlers.forEach((handler) => handler.handle(error));
        return;
      }
    }

    // Fall back to default handler
    if (this.defaultHandler) {
      this.defaultHandler.handle(error);
    }
  }
}

// Utility functions for creating specific errors
export function createObjectNotFoundError(objectId: string): ServerError {
  return new ServerError(
    `Object with ID '${objectId}' not found`,
    ErrorCodes.OBJECT_NOT_FOUND,
    { objectId },
  );
}

export function createFunctionNotFoundError(
  functionPath: string[],
): ServerError {
  return new ServerError(
    `Function '${functionPath.join(".")}' not found`,
    ErrorCodes.FUNCTION_NOT_FOUND,
    { functionPath },
  );
}

// Result wrapper for operations that can fail
export type Result<T, E = ServerError> =
  | { success: true; data: T }
  | { success: false; error: E };

export function success<T>(data: T): Result<T> {
  return { success: true, data };
}

export function failure<E = ServerError>(error: E): Result<never, E> {
  return { success: false, error };
}

// Async result wrapper
export async function tryAsync<T>(
  operation: () => Promise<T>,
  errorCode?: ErrorCodes,
): Promise<Result<T>> {
  try {
    const data = await operation();
    return success(data);
  } catch (error) {
    const serverError =
      error instanceof ServerError
        ? error
        : new ServerError(
            error instanceof Error ? error.message : String(error),
            errorCode ?? ErrorCodes.UNKNOWN_ERROR,
            undefined,
            error instanceof Error ? error : undefined,
          );
    return failure(serverError);
  }
}

// Sync result wrapper
export function trySync<T>(
  operation: () => T,
  errorCode?: ErrorCodes,
): Result<T> {
  try {
    const data = operation();
    return success(data);
  } catch (error) {
    const serverError =
      error instanceof ServerError
        ? error
        : new ServerError(
            error instanceof Error ? error.message : String(error),
            errorCode ?? ErrorCodes.UNKNOWN_ERROR,
            undefined,
            error instanceof Error ? error : undefined,
          );
    return failure(serverError);
  }
}
