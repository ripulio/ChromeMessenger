import { MessageHandler, ProxyFunctionCallMessage, ProxyMethodCallMessage } from '../MessageTypes.js';
import { ObjectStore } from '../ObjectStore.js';
import { Logger } from '../core/Logger.js';
import { ServerError, createObjectNotFoundError, createFunctionNotFoundError, ErrorCodes } from '../core/ErrorHandling.js';

export interface InvocationContext {
  objectStore: ObjectStore;
  globalContext: any;
  logger: Logger;
  eventTransformer?: (payload: any[]) => any[];
  callbackInjector?: (payload: any[], sandboxTabId: number, port: MessagePort) => any[];
}

export class FunctionCallHandler implements MessageHandler<ProxyFunctionCallMessage> {
  constructor(private context: InvocationContext) {}

  async handle(message: ProxyFunctionCallMessage): Promise<any> {
    this.context.logger.debug('Handling function call', {
      functionName: message.functionName,
      payloadLength: message.payload?.length ?? 0
    });

    try {
      const targetFunction = this.context.globalContext[message.functionName];
      if (targetFunction === undefined) {
        throw createFunctionNotFoundError([message.functionName]);
      }

      if (typeof targetFunction !== 'function') {
        throw new ServerError(
          `Target is not a function: ${typeof targetFunction}`,
          ErrorCodes.FUNCTION_NOT_FOUND,
          { 
            functionName: message.functionName,
            actualType: typeof targetFunction
          }
        );
      }

      const processedPayload = this.processPayload(message.payload);
      const result = await this.executeFunction(targetFunction, processedPayload);
      
      this.context.logger.debug('Function call completed', {
        functionName: message.functionName,
        resultType: typeof result
      });

      return result;
    } catch (error) {
      this.context.logger.error('Function call failed', error, {
        functionName: message.functionName
      });
      throw error;
    }
  }

  private processPayload(payload: any[]): any[] {
    let processedPayload = payload;

    // Transform events if transformer is available
    if (this.context.eventTransformer) {
      processedPayload = this.context.eventTransformer(processedPayload);
    }

    return processedPayload;
  }

  private async executeFunction(targetFunction: Function, payload: any[]): Promise<any> {
    try {
      this.context.logger.debug('Executing function with payload', {
        functionName: targetFunction.name,
        payloadLength: payload.length
      });

      const result = targetFunction(...payload);
      
      // Handle both sync and async results
      return await Promise.resolve(result);
    } catch (error) {
      throw new ServerError(
        `Function execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.FUNCTION_EXECUTION_FAILED,
        { 
          functionName: targetFunction.name,
          payloadLength: payload.length
        },
        error instanceof Error ? error : undefined
      );
    }
  }
}

export class MethodCallHandler implements MessageHandler<ProxyMethodCallMessage> {
  constructor(private context: InvocationContext) {}

  async handle(message: ProxyMethodCallMessage): Promise<any> {
    this.context.logger.debug('Handling method call', {
      objectId: message.objectId,
      methodName: message.methodName,
      payloadLength: message.payload?.length ?? 0
    });

    try {
      const targetObject = this.context.objectStore.retrieve(message.objectId);
      if (targetObject === undefined) {
        throw createObjectNotFoundError(message.objectId);
      }

      const targetMethod = targetObject[message.methodName];
      if (targetMethod === undefined) {
        throw new ServerError(
          `Method not found: ${message.methodName}`,
          ErrorCodes.FUNCTION_NOT_FOUND,
          { 
            objectId: message.objectId,
            methodName: message.methodName
          }
        );
      }

      if (typeof targetMethod !== 'function') {
        throw new ServerError(
          `Target is not a function: ${typeof targetMethod}`,
          ErrorCodes.FUNCTION_NOT_FOUND,
          { 
            objectId: message.objectId,
            methodName: message.methodName,
            actualType: typeof targetMethod
          }
        );
      }

      const processedPayload = this.processPayload(message.payload);
      const result = await this.executeMethod(targetObject, targetMethod, processedPayload);
      
      this.context.logger.debug('Method call completed', {
        objectId: message.objectId,
        methodName: message.methodName,
        resultType: typeof result
      });

      return result;
    } catch (error) {
      this.context.logger.error('Method call failed', error, {
        objectId: message.objectId,
        methodName: message.methodName
      });
      throw error;
    }
  }

  private processPayload(payload: any[]): any[] {
    let processedPayload = payload;

    // Transform events if transformer is available
    if (this.context.eventTransformer) {
      processedPayload = this.context.eventTransformer(processedPayload);
    }

    return processedPayload;
  }

  private async executeMethod(targetObject: any, targetMethod: Function, payload: any[]): Promise<any> {
    try {
      this.context.logger.debug('Executing method with payload', {
        methodName: targetMethod.name,
        payloadLength: payload.length
      });

      // Bind the method to the target object to preserve 'this' context
      const result = targetMethod.apply(targetObject, payload);
      
      // Handle both sync and async results
      return await Promise.resolve(result);
    } catch (error) {
      throw new ServerError(
        `Method execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.FUNCTION_EXECUTION_FAILED,
        { 
          methodName: targetMethod.name,
          payloadLength: payload.length
        },
        error instanceof Error ? error : undefined
      );
    }
  }
}

// Legacy handler for backward compatibility
export class InvocationHandler implements MessageHandler<ProxyFunctionCallMessage | ProxyMethodCallMessage> {
  private functionCallHandler: FunctionCallHandler;
  private methodCallHandler: MethodCallHandler;

  constructor(context: InvocationContext) {
    this.functionCallHandler = new FunctionCallHandler(context);
    this.methodCallHandler = new MethodCallHandler(context);
  }

  async handle(message: ProxyFunctionCallMessage | ProxyMethodCallMessage): Promise<any> {
    if (message.messageType === 'ProxyFunctionCall') {
      return this.functionCallHandler.handle(message);
    } else {
      return this.methodCallHandler.handle(message);
    }
  }
}

// Event transformation utilities
export interface EventTransformer {
  transformPayload(payload: any[]): any[];
  isEvent(arg: any): boolean;
  createEvent(eventData: any): Event | null;
}

export class DefaultEventTransformer implements EventTransformer {
  constructor(private logger: Logger) {}

  transformPayload(payload: any[]): any[] {
    return payload.map(arg => this.createEvent(arg) ?? arg);
  }

  isEvent(arg: any): boolean {
    return arg && 
           typeof arg === 'object' && 
           arg.eventType && 
           typeof arg.eventType === 'string';
  }

  createEvent(eventData: any): Event | null {
    if (!this.isEvent(eventData)) {
      return null;
    }

    try {
      const EventConstructor = this.getEventConstructor(eventData.eventType);
      if (!EventConstructor) {
        this.logger.warn('Unknown event type', { eventType: eventData.eventType });
        return null;
      }

      return new EventConstructor(eventData.type, { ...eventData });
    } catch (error) {
      this.logger.error('Failed to create event', error, { eventData });
      return null;
    }
  }

  private getEventConstructor(eventType: string): EventConstructor | null {
    try {
      const constructor = (globalThis as any)[eventType];
      return this.isEventConstructor(constructor) ? constructor : null;
    } catch {
      return null;
    }
  }

  private isEventConstructor(value: any): value is EventConstructor {
    return typeof value === 'function' && 
           value.prototype && 
           value.prototype instanceof Event;
  }
}

type EventConstructor = {
  new (type: string, eventInitDict?: any): Event;
  prototype: Event;
}; 