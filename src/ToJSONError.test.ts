import { describe, it, expect, vi } from 'vitest';
import { createObjectWrapperWithCallbackRegistry, getCallbackRegistry } from './TypeUtilities';

describe('toJSON Error Fixes - Verification', () => {
  it('should handle toJSON property access gracefully without throwing errors', () => {
    const mockPort = vi.fn() as any;
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      new Map(),
      mockPort
    );
    
    const forEachProxy = arrayProxy.forEach;
    
    // This should now return undefined instead of throwing an error
    expect(() => {
      const toJSON = forEachProxy.toJSON;
      expect(toJSON).toBeUndefined();
    }).not.toThrow();
  });

  it('should handle JSON.stringify gracefully without throwing errors', () => {
    const mockPort = vi.fn() as any;
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      new Map(),
      mockPort
    );
    
    const forEachProxy = arrayProxy.forEach;
    
    // JSON.stringify should now work without throwing errors
    expect(() => {
      const result = JSON.stringify(forEachProxy);
      // JSON.stringify can return undefined for functions, which is expected behavior
      expect(result === undefined || typeof result === 'string').toBe(true);
    }).not.toThrow();
  });

  it('should handle console.log inspection gracefully without throwing errors', () => {
    const mockPort = vi.fn() as any;
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      new Map(),
      mockPort
    );
    
    const forEachProxy = arrayProxy.forEach;
    
    // toString access should now return undefined instead of throwing an error
    expect(() => {
      const inspect = forEachProxy.toString;
      expect(inspect).toBeUndefined();
    }).not.toThrow();
  });

  it('should demonstrate that the fix resolves serialization issues', () => {
    const mockPort = vi.fn() as any;
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      new Map(),
      mockPort
    );
    
    const forEachProxy = arrayProxy.forEach;
    
    // All serialization-related property accesses should now work
    expect(forEachProxy.toJSON).toBeUndefined();
    expect(forEachProxy.valueOf).toBeUndefined();
    expect(forEachProxy.toString).toBeUndefined();
    
    // JSON.stringify should work
    const jsonResult = JSON.stringify(forEachProxy);
    expect(jsonResult === undefined || typeof jsonResult === 'string').toBe(true);
    
    // The fix has resolved the original error!
    console.log('✅ toJSON error has been fixed!');
  });

  it('should demonstrate that toJSON access is now fixed', () => {
    console.log('✅ FIXED: ThenableCallableProxy now handles toJSON gracefully');
    
    const mockPort = { postMessage: vi.fn() } as any;
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      new Map(),
      mockPort
    );
    
    const proxy = arrayProxy.forEach; // This creates a ThenableCallableProxy
    
    // These should now return undefined instead of throwing errors
    expect(proxy.toJSON).toBeUndefined();
    expect(proxy.toString).toBeUndefined();
    expect(proxy.valueOf).toBeUndefined();
    
    // JSON.stringify should now work without errors
    expect(() => JSON.stringify(proxy)).not.toThrow();
    expect(() => JSON.stringify({ proxy })).not.toThrow();
    
    console.log('✅ Serialization now works correctly');
  });

  it('should demonstrate that isProxy still works correctly', () => {
    console.log('✅ VERIFIED: isProxy access still works as expected');
    
    const mockPort = { postMessage: vi.fn() } as any;
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      new Map(),
      mockPort
    );
    
    const proxy = arrayProxy.forEach; // This creates a ThenableCallableProxy
    
    // isProxy should still work
    expect(proxy.isProxy).toEqual({ kind: "objectId", value: "array123" });
    
    console.log('✅ Transpiler conditional logic will work correctly');
  });

  it('should demonstrate that other properties still throw errors appropriately', () => {
    console.log('🔒 SECURITY: Other properties still throw errors as expected');
    
    const mockPort = { postMessage: vi.fn() } as any;
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      new Map(),
      mockPort
    );
    
    const proxy = arrayProxy.forEach; // This creates a ThenableCallableProxy
    
    // Other properties should still throw errors
    expect(() => proxy.someRandomProperty).toThrow('get for property someRandomProperty on ThenableCallable');
    expect(() => proxy.length).toThrow('get for property length on ThenableCallable');
    expect(() => proxy.name).toThrow('get for property name on ThenableCallable');
    
    console.log('✅ Security is maintained for unexpected property access');
  });
}); 