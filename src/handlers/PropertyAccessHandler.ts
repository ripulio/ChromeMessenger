import { MessageHandler } from '../MessageTypes.js';
import { ProxyPropertyAccessMessage } from '../MessageTypes.js';
import { ObjectStore } from '../ObjectStore.js';
import { Logger } from '../core/Logger.js';
import { ServerError, createObjectNotFoundError, ErrorCodes } from '../core/ErrorHandling.js';

export interface PropertyAccessContext {
  objectStore: ObjectStore;
  globalContext: any;
  logger: Logger;
}

export class PropertyAccessHandler implements MessageHandler<ProxyPropertyAccessMessage> {
  constructor(private context: PropertyAccessContext) {}

  async handle(message: ProxyPropertyAccessMessage): Promise<any> {
    this.context.logger.debug('Handling property access', {
      objectId: message.objectId,
      objectName: message.objectName,
      property: message.property
    });

    try {
      const target = this.resolveTarget(message);
      const result = this.executePropertyAccess(target, message.property);
      
      this.context.logger.debug('Property access completed', {
        property: message.property,
        resultType: typeof result
      });

      return result;
    } catch (error) {
      this.context.logger.error('Property access failed', error, {
        objectId: message.objectId,
        objectName: message.objectName,
        property: message.property
      });
      throw error;
    }
  }

  private resolveTarget(message: ProxyPropertyAccessMessage): any {
    if (message.objectId) {
      const target = this.context.objectStore.retrieve(message.objectId);
      if (target === undefined) {
        throw createObjectNotFoundError(message.objectId);
      }
      return target;
    }

    if (message.objectName) {
      const target = this.context.globalContext[message.objectName];
      if (target === undefined) {
        throw new ServerError(
          `Global object '${message.objectName}' not found`,
          ErrorCodes.OBJECT_NOT_FOUND,
          { objectName: message.objectName }
        );
      }
      return target;
    }

    throw new ServerError(
      'Property access message must specify either objectId or objectName',
      ErrorCodes.INVALID_ARGUMENTS,
      { message }
    );
  }

  private executePropertyAccess(target: any, property: string): any {
    try {
      let result = target[property];
      
      // Bind functions to their parent object to preserve 'this' context
      if (typeof result === 'function') {
        result = result.bind(target);
      }
      
      return result;
    } catch (error) {
      throw new ServerError(
        `Failed to access property '${property}': ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.FUNCTION_EXECUTION_FAILED,
        { property, targetType: typeof target },
        error instanceof Error ? error : undefined
      );
    }
  }
} 