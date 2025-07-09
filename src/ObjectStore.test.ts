import { describe, it, expect, beforeEach } from 'vitest'
import { ObjectStore } from './ObjectStore'

describe('ObjectStore', () => {
  let objectStore: ObjectStore;

  beforeEach(() => {
    objectStore = new ObjectStore();
  });

  describe('store', () => {
    it('should store primitive values', () => {
      const result = objectStore.store(null);
      expect(result.objectId).toBe('null');
      expect(result.type).toBe('primitive');
    });

    it('should store objects with unique IDs', () => {
      const obj1 = { name: 'test1' };
      const obj2 = { name: 'test2' };

      const ref1 = objectStore.store(obj1);
      const ref2 = objectStore.store(obj2);

      expect(ref1.objectId).not.toBe(ref2.objectId);
      expect(ref1.type).toBe('object');
      expect(ref2.type).toBe('object');
    });

    it('should store functions', () => {
      const func = () => 'test';
      const result = objectStore.store(func);

      expect(result.type).toBe('function');
      expect(objectStore.retrieve(result.objectId)).toBe(func);
    });

    it('should handle iterables', () => {
      const iterable = [1, 2, 3];
      const result = objectStore.store(iterable);

      expect(result.metadata?.iteratorId).toBeDefined();
    });
  });

  describe('retrieve', () => {
    it('should retrieve stored objects', () => {
      const obj = { test: 'value' };
      const ref = objectStore.store(obj);
      
      const retrieved = objectStore.retrieve(ref.objectId);
      expect(retrieved).toBe(obj);
    });

    it('should return undefined for non-existent IDs', () => {
      const result = objectStore.retrieve('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for existing objects', () => {
      const obj = { test: 'value' };
      const ref = objectStore.store(obj);
      
      expect(objectStore.has(ref.objectId)).toBe(true);
    });

    it('should return false for non-existent objects', () => {
      expect(objectStore.has('non-existent')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing objects', () => {
      const obj = { test: 'value' };
      const ref = objectStore.store(obj);
      
      expect(objectStore.delete(ref.objectId)).toBe(true);
      expect(objectStore.has(ref.objectId)).toBe(false);
    });

    it('should return false for non-existent objects', () => {
      expect(objectStore.delete('non-existent')).toBe(false);
    });

    it('should not delete the null reference', () => {
      expect(objectStore.has('null')).toBe(true);
      objectStore.delete('null');
      expect(objectStore.has('null')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all objects except null', () => {
      objectStore.store({ test: 1 });
      objectStore.store({ test: 2 });
      
      expect(objectStore.getSize()).toBeGreaterThan(1);
      
      objectStore.clear();
      
      expect(objectStore.getSize()).toBe(1);
      expect(objectStore.has('null')).toBe(true);
    });
  });

  describe('garbage collection', () => {
    it('should remove unreferenced objects', () => {
      const ref1 = objectStore.store({ test: 1 });
      const ref2 = objectStore.store({ test: 2 });
      const ref3 = objectStore.store({ test: 3 });

      // Keep only ref1 and ref3
      const activeRefs = new Set([ref1.objectId, ref3.objectId]);
      objectStore.gc(activeRefs);

      expect(objectStore.has(ref1.objectId)).toBe(true);
      expect(objectStore.has(ref2.objectId)).toBe(false);
      expect(objectStore.has(ref3.objectId)).toBe(true);
      expect(objectStore.has('null')).toBe(true); // null should always remain
    });

    it('should not remove null reference during GC', () => {
      objectStore.store({ test: 1 });
      objectStore.gc(new Set()); // Remove all except null

      expect(objectStore.has('null')).toBe(true);
      expect(objectStore.getSize()).toBe(1);
    });
  });

  describe('debugging methods', () => {
    it('should return correct size', () => {
      expect(objectStore.getSize()).toBe(1); // null reference

      objectStore.store({ test: 1 });
      expect(objectStore.getSize()).toBe(2);

      objectStore.store({ test: 2 });
      expect(objectStore.getSize()).toBe(3);
    });

    it('should return all object IDs', () => {
      const ref1 = objectStore.store({ test: 1 });
      const ref2 = objectStore.store({ test: 2 });

      const ids = objectStore.getObjectIds();
      expect(ids).toContain('null');
      expect(ids).toContain(ref1.objectId);
      expect(ids).toContain(ref2.objectId);
      expect(ids.length).toBe(3);
    });
  });
}); 