// Separate object store management
export interface ObjectReference {
  objectId: string;
  type: "object" | "function" | "primitive";
  metadata?: {
    iteratorId?: string;
    serializedData?: string;
  };
}

export class ObjectStore {
  private objectMap = new Map<string, any>();
  private nextId = 1;
  private readonly nullTarget = { value: null };

  constructor() {
    this.objectMap.set("null", this.nullTarget);
  }

  store(obj: any): ObjectReference {
    if (obj === undefined || obj === null) {
      return {
        objectId: "null",
        type: "primitive",
      };
    }

    const objectId = `obj_${this.nextId++}`;
    this.objectMap.set(objectId, obj);

    const reference: ObjectReference = {
      objectId,
      type: typeof obj === "function" ? "function" : "object",
    };

    // Add metadata for iterables (but don't recursively store the iterator to avoid infinite recursion)
    if (this.isIterable(obj)) {
      const iterator = obj[Symbol.iterator]().next.bind(obj[Symbol.iterator]());
      // Store the iterator directly without recursion
      const iteratorId = `obj_${this.nextId++}`;
      this.objectMap.set(iteratorId, iterator);
      reference.metadata = {
        iteratorId
      };
    }

    return reference;
  }

  retrieve(objectId: string): any {
    return this.objectMap.get(objectId);
  }

  has(objectId: string): boolean {
    return this.objectMap.has(objectId);
  }

  delete(objectId: string): boolean {
    // Protect the null reference from deletion
    if (objectId === "null") {
      return false;
    }
    return this.objectMap.delete(objectId);
  }

  clear(): void {
    this.objectMap.clear();
    this.objectMap.set("null", this.nullTarget);
    this.nextId = 1;
  }

  private isIterable(obj: any): boolean {
    return (
      obj !== undefined &&
      obj !== null &&
      typeof obj[Symbol.iterator] === "function"
    );
  }

  // Garbage collection for unused objects
  gc(activeReferences: Set<string>): void {
    for (const [objectId] of this.objectMap) {
      if (objectId !== "null" && !activeReferences.has(objectId)) {
        this.objectMap.delete(objectId);
      }
    }
  }

  // Public method for debugging - get store size
  getSize(): number {
    return this.objectMap.size;
  }

  // Public method for debugging - get all object IDs
  getObjectIds(): string[] {
    return Array.from(this.objectMap.keys());
  }
}
