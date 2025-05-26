import { MessageHandler } from '../MessageTypes.js';
import { ProxyAssignmentMessage } from '../MessageTypes.js';
import { ObjectStore } from '../ObjectStore.js';
import { Logger } from '../core/Logger.js';
import { ServerError, createObjectNotFoundError, ErrorCodes } from '../core/ErrorHandling.js';

export interface AssignmentContext {
  objectStore: ObjectStore;
  globalContext: any;
  logger: Logger;
}

export class AssignmentHandler implements MessageHandler<ProxyAssignmentMessage> {
  constructor(private context: AssignmentContext) {}

  async handle(message: ProxyAssignmentMessage): Promise<any> {
    this.context.logger.debug('Handling property assignment', {
      objectId: message.objectId,
      functionPath: message.functionPath,
      property: message.property,
      valueType: typeof message.value
    });

    try {
      const target = this.resolveTarget(message);
      const result = this.executeAssignment(target, message.property, message.value);
      
      this.context.logger.debug('Assignment completed', {
        property: message.property,
        result
      });

      return result;
    } catch (error) {
      this.context.logger.error('Assignment failed', error, {
        objectId: message.objectId,
        functionPath: message.functionPath,
        property: message.property
      });
      throw error;
    }
  }

  private resolveTarget(message: ProxyAssignmentMessage): any {
    if (message.objectId) {
      const target = this.context.objectStore.retrieve(message.objectId);
      if (target === undefined) {
        throw createObjectNotFoundError(message.objectId);
      }
      return target;
    }

    if (message.functionPath && message.functionPath.length > 0) {
      return this.resolveFromPath(message.functionPath);
    }

    throw new ServerError(
      'Assignment message must specify either objectId or functionPath',
      ErrorCodes.INVALID_ARGUMENTS,
      { message }
    );
  }

  private resolveFromPath(path: string[]): any {
    let current = this.context.globalContext;
    
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      if (current === undefined || current === null) {
        throw new ServerError(
          `Path segment '${segment}' accessed on null/undefined`,
          ErrorCodes.OBJECT_NOT_FOUND,
          { path, failedAt: i }
        );
      }
      current = current[segment];
    }

    return current;
  }

  private executeAssignment(target: any, property: string, value: any): any {
    try {
      // Validate that the target can accept property assignments
      if (target === null || target === undefined) {
        throw new ServerError(
          'Cannot assign property to null or undefined',
          ErrorCodes.INVALID_ARGUMENTS,
          { property, targetType: typeof target }
        );
      }

      // Check if the property is writable (for objects with property descriptors)
      if (typeof target === 'object') {
        const descriptor = Object.getOwnPropertyDescriptor(target, property);
        if (descriptor && descriptor.writable === false) {
          throw new ServerError(
            `Property '${property}' is not writable`,
            ErrorCodes.INVALID_ARGUMENTS,
            { property, descriptor }
          );
        }
      }

      // Perform the assignment
      const result = target[property] = value;
      
      this.context.logger.debug('Property assigned successfully', {
        property,
        valueType: typeof value,
        targetType: typeof target
      });

      return result;
    } catch (error) {
      if (error instanceof ServerError) {
        throw error;
      }

      throw new ServerError(
        `Failed to assign property '${property}': ${error instanceof Error ? error.message : String(error)}`,
        ErrorCodes.FUNCTION_EXECUTION_FAILED,
        { 
          property, 
          valueType: typeof value,
          targetType: typeof target 
        },
        error instanceof Error ? error : undefined
      );
    }
  }

  // Utility method to validate assignment safety
  private validateAssignment(target: any, property: string, value: any): void {
    // Check for frozen objects
    if (typeof target === 'object' && Object.isFrozen(target)) {
      throw new ServerError(
        'Cannot assign property to frozen object',
        ErrorCodes.INVALID_ARGUMENTS,
        { property, targetType: typeof target }
      );
    }

    // Check for sealed objects with new properties
    if (typeof target === 'object' && 
        Object.isSealed(target) && 
        !target.hasOwnProperty(property)) {
      throw new ServerError(
        'Cannot add new property to sealed object',
        ErrorCodes.INVALID_ARGUMENTS,
        { property, targetType: typeof target }
      );
    }

    // Validate property name
    if (typeof property !== 'string' && typeof property !== 'symbol') {
      throw new ServerError(
        'Property name must be a string or symbol',
        ErrorCodes.INVALID_ARGUMENTS,
        { property, propertyType: typeof property }
      );
    }
  }
} 