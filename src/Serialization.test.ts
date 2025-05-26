import { describe, it, expect, beforeEach } from 'vitest'
import { Serializer, shouldSerialize } from './Serialization'

describe('Serialization', () => {
  let serializer: Serializer;

  beforeEach(() => {
    serializer = new Serializer({
      maxDepth: 3,
      includeNonEnumerable: false,
      includeFunctions: false
    });
  });

  describe('shouldSerialize', () => {
    it('should return false for primitives', () => {
      expect(shouldSerialize(null)).toBe(false);
      expect(shouldSerialize(undefined)).toBe(false);
      expect(shouldSerialize(42)).toBe(false);
      expect(shouldSerialize('string')).toBe(false);
      expect(shouldSerialize(true)).toBe(false);
    });

    it('should return true for objects with prototypes', () => {
      expect(shouldSerialize(new Date())).toBe(true);
      expect(shouldSerialize(new Error('test'))).toBe(true);
      expect(shouldSerialize([])).toBe(true);
    });

    it('should return true for plain objects', () => {
      expect(shouldSerialize({})).toBe(true);
      expect(shouldSerialize({ key: 'value' })).toBe(true);
    });
  });

  describe('Serializer', () => {
    it('should serialize simple objects', () => {
      const obj = { name: 'test', value: 42 };
      const result = serializer.serialize(obj);
      
      expect(result).toEqual(obj);
    });

    it('should handle nested objects within depth limit', () => {
      const obj = {
        level1: {
          level2: {
            value: 'deep'  // Only 2 levels deep, should be within limit
          }
        }
      };
      
      const result = serializer.serialize(obj);
      expect(result.level1.level2.value).toBe('deep');
    });

    it('should truncate objects beyond max depth', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'too deep'
              }
            }
          }
        }
      };
      
      const result = serializer.serialize(obj);
      expect(result.level1.level2.level3).toEqual({ __truncated: true, type: 'object' });
    });

    it('should handle circular references', () => {
      const obj: any = { name: 'parent' };
      obj.self = obj;
      
      const result = serializer.serialize(obj);
      expect(result.name).toBe('parent');
      expect(result.self).toEqual({ __circular: true, type: 'object' });
    });

    it('should handle arrays', () => {
      const arr = [1, 2, { nested: true }];
      const result = serializer.serialize(arr);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toBe(1);
      expect(result[2].nested).toBe(true);
    });

    it('should exclude functions by default', () => {
      const obj = {
        data: 'value',
        method: () => 'test'
      };
      
      const result = serializer.serialize(obj);
      expect(result.data).toBe('value');
      expect(result.method).toEqual({ __function: '[Function]' });
    });

    it('should include functions when configured', () => {
      const serializerWithFunctions = new Serializer({
        maxDepth: 3,
        includeNonEnumerable: false,
        includeFunctions: true
      });
      
      const obj = {
        data: 'value',
        method: () => 'test'
      };
      
      const result = serializerWithFunctions.serialize(obj);
      expect(result.data).toBe('value');
      expect(result.method).toEqual({ __function: '() => "test"' });
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01');
      const obj = { timestamp: date };
      
      const result = serializer.serialize(obj);
      expect(result.timestamp).toEqual({ __date: date.toISOString() });
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error');
      const obj = { error };
      
      const result = serializer.serialize(obj);
      expect(result.error.__error).toBe(true);
      expect(result.error.message).toBe('Test error');
      expect(result.error.name).toBe('Error');
    });

    it('should handle null and undefined values', () => {
      const obj = {
        nullValue: null,
        undefinedValue: undefined,
        normalValue: 'test'
      };
      
      const result = serializer.serialize(obj);
      expect(result.nullValue).toBe(null);
      expect(result.undefinedValue).toBe(undefined);
      expect(result.normalValue).toBe('test');
    });

    it('should handle complex nested structures', () => {
      const obj = {
        users: [
          { id: 1, name: 'Alice', age: 30 },
          { id: 2, name: 'Bob', age: 25 }
        ],
        metadata: {
          created: new Date('2023-01-01'),
          version: '1.0.0'
        }
      };
      
      const result = serializer.serialize(obj);
      expect(result.users).toHaveLength(2);
      expect(result.users[0].age).toBe(30);
      expect(result.metadata.version).toBe('1.0.0');
      expect(result.metadata.created).toEqual({ __date: '2023-01-01T00:00:00.000Z' });
    });
  });
}); 