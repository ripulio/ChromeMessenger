import { describe, it, expect, vi } from 'vitest';
import { createObjectWrapperWithCallbackRegistry, getCallbackRegistry } from './TypeUtilities';

describe('appendChild Error Fixes - Verification', () => {
  it('should demonstrate that serialization properties now return undefined (FIXED)', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const documentProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "document" },
      callbackRegistry,
      mockPort,
      undefined,
      {}
    );

    const createElement_3 = documentProxy.createElement; // ThenableCallableProxy
    
    // The original bug was that these would throw errors
    // Now they correctly return undefined, allowing serialization to work
    expect(createElement_3.toJSON).toBeUndefined();
    expect(createElement_3.valueOf).toBeUndefined();
    expect(createElement_3.toString).toBeUndefined();
    
    // JSON.stringify should now work without throwing errors
    expect(() => {
      JSON.stringify(createElement_3);
    }).not.toThrow();
  });

  it('should demonstrate that the original toString error is now fixed', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Simulate document proxy
    const documentProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "document" },
      callbackRegistry,
      mockPort,
      undefined,
      {}
    );

    const createElement_3 = documentProxy.createElement; // ThenableCallableProxy
    
    // The original error was: "get for property toString on ThenableCallable"
    // This is now fixed - toString returns undefined
    expect(createElement_3.toString).toBeUndefined();
    
    // However, calling toString() as a function will still fail because it's undefined
    expect(() => {
      createElement_3.toString();
    }).toThrow('createElement_3.toString is not a function');
  });

  it('should demonstrate that argument transformation now works correctly', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const documentProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "document" },
      callbackRegistry,
      mockPort,
      undefined,
      {}
    );

    // Get a ThenableCallableProxy (like createElement)
    const createElementProxy = documentProxy.createElement;
    
    // These serialization properties now return undefined (FIXED)
    expect(createElementProxy.toJSON).toBeUndefined();
    expect(createElementProxy.toString).toBeUndefined();
    expect(createElementProxy.valueOf).toBeUndefined();
    
    // JSON.stringify now works (FIXED)
    expect(() => JSON.stringify(createElementProxy)).not.toThrow();
    
    // Other properties still throw errors (security maintained)
    expect(() => createElementProxy.constructor).toThrow(/get for property constructor on ThenableCallable/);
    expect(() => createElementProxy.length).toThrow(/get for property length on ThenableCallable/);
  });

  it('should demonstrate that JSON.stringify in logging now works', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const documentProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "document" },
      callbackRegistry,
      mockPort,
      undefined,
      {}
    );

    const createElement_3 = documentProxy.createElement;
    
    // Create a message object like functionInvocationHandler does
    const message = {
      messageType: "ProxyMethodCall",
      payload: [createElement_3], // ThenableCallableProxy as argument
    };
    
    // JSON.stringify should now work for logging (FIXED)
    expect(() => {
      JSON.stringify(message);
    }).not.toThrow();
  });

  it('should demonstrate that isProxy access still works correctly', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const documentProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "document" },
      callbackRegistry,
      mockPort,
      undefined,
      {}
    );

    const createElement = documentProxy.createElement;
    
    // isProxy should still work for transpiler conditional logic
    expect(createElement.isProxy).toEqual({ kind: "name", value: "document" });
    
    // then property should still work for awaiting
    expect(typeof createElement.then).toBe('function');
  });

  it('should demonstrate that security is maintained for unexpected properties', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const documentProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "document" },
      callbackRegistry,
      mockPort,
      undefined,
      {}
    );

    const createElement = documentProxy.createElement;
    
    // Other properties should still throw errors (security maintained)
    expect(() => createElement.someRandomProperty).toThrow('get for property someRandomProperty on ThenableCallable');
    expect(() => createElement.length).toThrow('get for property length on ThenableCallable');
    expect(() => createElement.name).toThrow('get for property name on ThenableCallable');
  });
}); 