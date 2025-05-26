import { ObjectStore, ObjectReference } from '../ObjectStore.js';
import { Serializer, shouldSerialize } from '../Serialization.js';
import { Logger } from './Logger.js';

export interface ObjectReferenceResponse {
  messageType: 'objectReferenceResponse';
  correlationId: string;
  data?: any;
  deserializeData?: boolean;
  objectId?: string;
  iteratorId?: string;
}

export interface FunctionReferenceResponse {
  messageType: 'functionReferenceResponse';
  correlationId: string;
  objectId: string;
  data: string;
}

export type ServerResponse = ObjectReferenceResponse | FunctionReferenceResponse;

export interface ResponseFactoryOptions {
  objectStore: ObjectStore;
  serializer: Serializer;
  logger: Logger;
}

export class ResponseFactory {
  constructor(private options: ResponseFactoryOptions) {}

  createResponse(result: any, correlationId: string): ServerResponse {
    this.options.logger.debug('Creating response', {
      correlationId,
      resultType: typeof result
    });

    try {
      if (typeof result === 'function') {
        return this.createFunctionResponse(result, correlationId);
      }

      return this.createObjectResponse(result, correlationId);
    } catch (error) {
      this.options.logger.error('Failed to create response', error, {
        correlationId,
        resultType: typeof result
      });
      
      // Return error response
      return {
        messageType: 'objectReferenceResponse',
        correlationId,
        data: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  private createFunctionResponse(func: Function, correlationId: string): FunctionReferenceResponse {
    const reference = this.options.objectStore.store(func);
    
    return {
      messageType: 'functionReferenceResponse',
      correlationId,
      objectId: reference.objectId,
      data: func.toString()
    };
  }

  private createObjectResponse(result: any, correlationId: string): ObjectReferenceResponse {
    const baseResponse: ObjectReferenceResponse = {
      messageType: 'objectReferenceResponse',
      correlationId
    };

    // Handle null/undefined
    if (result === null || result === undefined) {
      return {
        ...baseResponse,
        data: result
      };
    }

    // Determine if we should serialize the result
    const needsSerialization = shouldSerialize(result);
    
    let response: ObjectReferenceResponse = {
      ...baseResponse,
      deserializeData: needsSerialization
    };

    // Serialize if needed
    if (needsSerialization) {
      try {
        const serialized = this.options.serializer.serialize(result);
        response.data = JSON.stringify(serialized);
      } catch (error) {
        this.options.logger.warn('Serialization failed, storing as reference only', {
          error: error instanceof Error ? error.message : String(error),
          resultType: typeof result
        });
        response.data = undefined;
        response.deserializeData = false;
      }
    } else {
      response.data = result;
    }

    // Add iterator support
    if (this.isIterable(result)) {
      response = this.addIteratorSupport(result, response);
    }

    // Store object reference if needed
    if (this.shouldStoreReference(result)) {
      const reference = this.options.objectStore.store(result);
      response.objectId = reference.objectId;
      
      // Add iterator ID if available
      if (reference.metadata?.iteratorId) {
        response.iteratorId = reference.metadata.iteratorId;
      }
    }

    return response;
  }

  private addIteratorSupport(result: any, response: ObjectReferenceResponse): ObjectReferenceResponse {
    try {
      const iterator = result[Symbol.iterator]();
      const iteratorReference = this.options.objectStore.store(iterator);
      
      return {
        ...response,
        iteratorId: iteratorReference.objectId
      };
    } catch (error) {
      this.options.logger.warn('Failed to create iterator reference', {
        error: error instanceof Error ? error.message : String(error)
      });
      return response;
    }
  }

  private isIterable(obj: any): boolean {
    return obj !== null && 
           obj !== undefined && 
           typeof obj[Symbol.iterator] === 'function';
  }

  private shouldStoreReference(obj: any): boolean {
    // Store references for all non-primitive values
    return obj !== null && 
           obj !== undefined && 
           (typeof obj === 'object' || typeof obj === 'function');
  }

  // Create error response
  createErrorResponse(error: Error | string, correlationId: string): ObjectReferenceResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    this.options.logger.debug('Creating error response', {
      correlationId,
      error: errorMessage
    });

    return {
      messageType: 'objectReferenceResponse',
      correlationId,
      data: {
        error: errorMessage
      }
    };
  }

  // Create success response with minimal data
  createSimpleResponse(data: any, correlationId: string): ObjectReferenceResponse {
    return {
      messageType: 'objectReferenceResponse',
      correlationId,
      data
    };
  }
} 