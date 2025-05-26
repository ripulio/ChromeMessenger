import { describe, it, expect, vi } from 'vitest';
import { createObjectWrapperWithCallbackRegistry, getCallbackRegistry } from './TypeUtilities';

describe('Complete Error Reproduction - User Scenario FIXED', () => {
  it('should demonstrate that the transpiler error is now fixed', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Simulate the user's code: ['Red','Green','Blue'].forEach(color => {...})
    // In the transpiled version, this array becomes a proxy
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "colorArray" },
      callbackRegistry,
      mockPort,
      undefined,
      ['Red', 'Green', 'Blue']
    );

    // The transpiler generates code like:
    // const forEach_1 = array?.isProxy ? await array["forEach"] : array["forEach"];
    
    // Step 1: Access forEach property - this creates a ThenableCallableProxy
    const forEach_1 = arrayProxy.forEach;
    
    // Step 2: The transpiler then tries to check if forEach_1 is a proxy:
    // forEach_1?.isProxy ? await forEach_1(callback) : forEach_1(callback)
    
    // This now works correctly - ThenableCallableProxy handles isProxy
    expect(() => {
      const isProxy = forEach_1.isProxy;
    }).not.toThrow();
    
    expect(forEach_1.isProxy).toEqual({ kind: "name", value: "colorArray" });
  });

  it('should show that some errors are still possible but isProxy is fixed', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "colorArray" },
      callbackRegistry,
      mockPort,
      undefined,
      ['Red', 'Green', 'Blue']
    );

    const forEach_1 = arrayProxy.forEach;
    
    // The main transpiler issue is now fixed:
    
    // 1. Transpiler checking isProxy (FIXED - no longer throws)
    expect(() => forEach_1.isProxy).not.toThrow();
    expect(forEach_1.isProxy).toEqual({ kind: "name", value: "colorArray" });
    
    // 2. Other properties still throw errors (this is expected behavior):
    // expect(() => JSON.stringify(forEach_1)).toThrow(/get for property toJSON on ThenableCallable/);
    // expect(() => forEach_1.valueOf).toThrow(/get for property valueOf on ThenableCallable/);
    
    // 2. Serialization properties now return undefined instead of throwing errors (FIXED):
    expect(forEach_1.toJSON).toBeUndefined();
    expect(forEach_1.valueOf).toBeUndefined();
    expect(forEach_1.toString).toBeUndefined();
    expect(() => JSON.stringify(forEach_1)).not.toThrow();
    
    // 3. Other properties still throw errors (this maintains security):
    expect(() => forEach_1.length).toThrow(/get for property length on ThenableCallable/);
    expect(() => forEach_1.name).toThrow(/get for property name on ThenableCallable/);
    expect(() => forEach_1.constructor).toThrow(/get for property constructor on ThenableCallable/);
  });

  it('should demonstrate the root cause is now fixed: ThenableCallableProxy supports isProxy', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "colorArray" },
      callbackRegistry,
      mockPort,
      undefined,
      ['Red', 'Green', 'Blue']
    );

    // The main proxy correctly handles isProxy
    expect(arrayProxy.isProxy).toEqual({ kind: "name", value: "colorArray" });
    
    // When we access a property, it creates a ThenableCallableProxy
    const methodProxy = arrayProxy.forEach;
    
    // ThenableCallableProxy now allows both 'then' and 'isProxy' access
    expect(() => methodProxy.then).not.toThrow();
    expect(() => methodProxy.isProxy).not.toThrow();
    expect(methodProxy.isProxy).toEqual({ kind: "name", value: "colorArray" });
  });

  it('should verify the transpiler conditional logic now works', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "colorArray" },
      callbackRegistry,
      mockPort,
      undefined,
      ['Red', 'Green', 'Blue']
    );

    const forEach_1 = arrayProxy.forEach;
    
    // The transpiler's conditional logic now works:
    // forEach_1?.isProxy ? await forEach_1(callback) : forEach_1(callback)
    
    // This check no longer throws an error
    const conditionalCheck = forEach_1?.isProxy;
    expect(conditionalCheck).toEqual({ kind: "name", value: "colorArray" });
    
    // The transpiler can now proceed with its conditional await logic
    if (conditionalCheck) {
      // This would be the await path in the transpiler
      expect(true).toBe(true); // Placeholder for await logic
    } else {
      // This would be the non-await path
      expect(false).toBe(true); // Should not reach here in this test
    }
  });

  it('should demonstrate that the core transpiler issue is resolved', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "colorArray" },
      callbackRegistry,
      mockPort,
      undefined,
      ['Red', 'Green', 'Blue']
    );

    const forEach_1 = arrayProxy.forEach;
    
    // The original error from TypeUtilities.ts:40 is now fixed
    // The transpiler can access isProxy without throwing an error
    expect(() => {
      const isProxyCheck = forEach_1.isProxy;
    }).not.toThrow();
    
    // The conditional await logic can now execute properly
    const isProxy = forEach_1.isProxy;
    expect(isProxy).toBeDefined();
    expect(isProxy).toEqual({ kind: "name", value: "colorArray" });
  });

  it('should show that serialization is now fixed but other properties still throw errors', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "colorArray" },
      callbackRegistry,
      mockPort,
      undefined,
      ['Red', 'Green', 'Blue']
    );

    const forEach_1 = arrayProxy.forEach;
    
    // The main transpiler issue is now fixed:
    
    // 1. Transpiler checking isProxy (FIXED - no longer throws)
    expect(() => forEach_1.isProxy).not.toThrow();
    expect(forEach_1.isProxy).toEqual({ kind: "name", value: "colorArray" });
    
    // 2. Serialization properties now return undefined instead of throwing errors (FIXED):
    expect(forEach_1.toJSON).toBeUndefined();
    expect(forEach_1.valueOf).toBeUndefined();
    expect(forEach_1.toString).toBeUndefined();
    expect(() => JSON.stringify(forEach_1)).not.toThrow();
    
    // 3. Other properties still throw errors (this maintains security):
    expect(() => forEach_1.length).toThrow(/get for property length on ThenableCallable/);
    expect(() => forEach_1.name).toThrow(/get for property name on ThenableCallable/);
    expect(() => forEach_1.constructor).toThrow(/get for property constructor on ThenableCallable/);
  });
}); 