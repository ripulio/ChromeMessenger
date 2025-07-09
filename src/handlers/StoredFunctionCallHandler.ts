import { MessageHandler, ProxyStoredFunctionCallMessage } from '../MessageTypes.js';
import { ObjectStore } from '../ObjectStore.js';
import { Logger } from '../core/Logger.js';
import { ServerError, createObjectNotFoundError, ErrorCodes } from '../core/ErrorHandling.js';

export interface StoredFunctionCallContext {
  objectStore: ObjectStore;
  logger: Logger;
  eventTransformer?: (payload: any[]) => any[];
  callbackInjector?: (payload: any[], sandboxTabId: number, port: MessagePort) => any[];
}

export class StoredFunctionCallHandler implements MessageHandler<ProxyStoredFunctionCallMessage> {
  constructor(private context: StoredFunctionCallContext) {}

  async handle(message: ProxyStoredFunctionCallMessage): Promise<any> {
    this.context.logger.debug('Handling stored function call', {
      objectId: message.objectId,
      payloadLength: message.payload?.length ?? 0
    });

    try {
      const storedFunction = this.context.objectStore.retrieve(message.objectId);
      if (storedFunction === undefined) {
        throw createObjectNotFoundError(message.objectId);
      }

      if (typeof storedFunction !== 'function') {
        throw new ServerError(
          `Stored object is not a function: ${typeof storedFunction}`,
          ErrorCodes.FUNCTION_NOT_FOUND,
          { 
            objectId: message.objectId,
            actualType: typeof storedFunction
          }
        );
      }

      const processedPayload = this.processPayload(message.payload);
      const result = await this.executeStoredFunction(storedFunction, processedPayload);
      
      this.context.logger.debug('Stored function call completed', {
        objectId: message.objectId,
        resultType: typeof result
      });

      return result;
    } catch (error) {
      this.context.logger.error('Stored function call failed', error, {
        objectId: message.objectId
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

    // Note: Callback injection needs to be handled at a higher level where the port is available

    return processedPayload;
  }

  private async executeStoredFunction(storedFunction: Function, payload: any[]): Promise<any> {
    try {
      this.context.logger.debug('Executing stored function with payload', {
        functionName: storedFunction.name,
        payloadLength: payload.length
      });

      const result = storedFunction(...payload);
      
      // Handle both sync and async results
      return await Promise.resolve(result);
    } catch (error) {
      throw new ServerError(
        `Stored function execution failed: ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.FUNCTION_EXECUTION_FAILED,
        { 
          functionName: storedFunction.name,
          payloadLength: payload.length
        },
        error instanceof Error ? error : undefined
      );
    }
  }
} 