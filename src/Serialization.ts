// Dedicated serialization system
export interface SerializationOptions {
  maxDepth?: number;
  includeNonEnumerable?: boolean;
  includeFunctions?: boolean;
  customSerializers?: Map<string, (obj: any) => any>;
}

export class Serializer {
  private readonly options: Required<SerializationOptions>;
  private readonly seen = new WeakSet();

  constructor(options: SerializationOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth ?? 3,
      includeNonEnumerable: options.includeNonEnumerable ?? false,
      includeFunctions: options.includeFunctions ?? false,
      customSerializers: options.customSerializers ?? new Map()
    };
  }

  serialize(obj: any, depth = 0): any {
    // Handle primitives
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }

    // Prevent circular references
    if (this.seen.has(obj)) {
      return { __circular: true, type: typeof obj };
    }

    // Check depth limit
    if (depth >= this.options.maxDepth) {
      return { __truncated: true, type: typeof obj };
    }

    this.seen.add(obj);

    try {
      // Custom serializers
      const customSerializer = this.options.customSerializers.get(obj.constructor.name);
      if (customSerializer) {
        return customSerializer(obj);
      }

      // Handle specific types
      if (obj instanceof Date) return { __date: obj.toISOString() };
      if (obj instanceof RegExp) return { __regex: obj.toString() };
      if (obj instanceof Error) return this.serializeError(obj);
      if (obj instanceof Node) return this.serializeNode(obj);
      if (obj instanceof Event) return this.serializeEvent(obj);

      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(item => this.serialize(item, depth + 1));
      }

      // Handle objects
      if (typeof obj === 'object') {
        return this.serializeObject(obj, depth);
      }

      // Functions
      if (typeof obj === 'function') {
        return this.options.includeFunctions 
          ? { __function: obj.toString() }
          : { __function: '[Function]' };
      }

      return obj;
    } finally {
      this.seen.delete(obj);
    }
  }

  private serializeObject(obj: any, depth: number): any {
    const result: any = {};
    const propertyNames = this.options.includeNonEnumerable
      ? Object.getOwnPropertyNames(obj)
      : Object.keys(obj);

    for (const key of propertyNames) {
      try {
        const value = obj[key];
        result[key] = this.serialize(value, depth + 1);
      } catch (error) {
        result[key] = { __error: 'Failed to serialize property' };
      }
    }

    return result;
  }

  private serializeError(error: Error): any {
    return {
      __error: true,
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  private serializeNode(node: Node): any {
    return {
      __node: true,
      nodeType: node.nodeType,
      nodeName: node.nodeName,
      textContent: node.nodeType === Node.TEXT_NODE ? node.textContent : undefined
    };
  }

  private serializeEvent(event: Event): any {
    const result: any = {
      __event: true,
      type: event.type,
      eventType: event.constructor.name
    };

    // Copy enumerable properties
    for (const key in event) {
      if (typeof (event as any)[key] !== 'function') {
        result[key] = this.serialize((event as any)[key], 1);
      }
    }

    return result;
  }
}

// Utility functions
export function shouldSerialize(obj: any): boolean {
  if (typeof obj === 'number' || typeof obj === 'boolean' || 
      typeof obj === 'string' || obj === null || obj === undefined) {
    return false;
  }
  return hasPrototype(obj) || hasMethods(obj);
}

function hasPrototype(obj: any): boolean {
  return Object.getPrototypeOf(obj) !== null && 
         Object.getPrototypeOf(obj) !== Object.prototype;
}

function hasMethods(obj: any): boolean {
  return Object.getOwnPropertyNames(Object.getPrototypeOf(obj))
    .filter(prop => typeof obj[prop] === 'function').length > 0;
} 