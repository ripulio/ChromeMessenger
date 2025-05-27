import { MessageHandler } from '../MessageTypes.js';
import { ProxyComparisonMessage } from '../MessageTypes.js';
import { ObjectStore } from '../ObjectStore.js';
import { Logger } from '../core/Logger.js';
import { ComparisonEngine } from '../ComparisonEngine.js';
import { ServerError, createObjectNotFoundError, ErrorCodes } from '../core/ErrorHandling.js';

export interface ComparisonContext {
  objectStore: ObjectStore;
  globalContext: any;
  logger: Logger;
  comparisonEngine: ComparisonEngine;
}

export class ComparisonHandler implements MessageHandler<ProxyComparisonMessage> {
  constructor(private context: ComparisonContext) {}

  async handle(message: ProxyComparisonMessage): Promise<any> {
    this.context.logger.debug('Handling comparison operation', {
      objectId: message.objectId,
      functionPath: message.functionPath,
      operatorKind: message.value.operatorKind
    });

    try {
      const leftOperand = this.resolveTarget(message);
      const rightOperand = this.hydrateObjectReference(message.value.value);
      
      const result = this.context.comparisonEngine.compare(
        message.value.operatorKind,
        leftOperand,
        rightOperand
      );
      
      this.context.logger.debug('Comparison completed', {
        operatorKind: message.value.operatorKind,
        result
      });

      return result;
    } catch (error) {
      this.context.logger.error('Comparison failed', error, {
        objectId: message.objectId,
        functionPath: message.functionPath,
        operatorKind: message.value.operatorKind
      });
      throw error;
    }
  }

  private resolveTarget(message: ProxyComparisonMessage): any {
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
      'Comparison message must specify either objectId or functionPath',
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

  private hydrateObjectReference(value: any): any {
    // If the value is an object reference, resolve it from the store
    if (value && 
        typeof value === 'object' && 
        value.type === 'objectReference' && 
        value.objectId) {
      const resolved = this.context.objectStore.retrieve(value.objectId);
      if (resolved === undefined) {
        throw createObjectNotFoundError(value.objectId);
      }
      return resolved;
    }

    // For nested objects, recursively hydrate
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const hydrated: any = {};
      for (const [key, val] of Object.entries(value)) {
        hydrated[key] = this.hydrateObjectReference(val);
      }
      return hydrated;
    }

    // For arrays, recursively hydrate elements
    if (Array.isArray(value)) {
      return value.map(item => this.hydrateObjectReference(item));
    }

    // Return primitive values as-is
    return value;
  }
} 