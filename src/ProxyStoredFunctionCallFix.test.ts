import { describe, it, expect, vi } from 'vitest';
import { createRemoteFunctionWrapperWithCallbackRegistry, getCallbackRegistry } from './TypeUtilities';

describe('ProxyStoredFunctionCall Fix Verification', () => {
  it('should correctly send ProxyStoredFunctionCall message for stored function objects', () => {
    console.log('🔧 TESTING: ProxyStoredFunctionCall message type fix');
    
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Create a stored function wrapper (like document.createElement stored as obj_19)
    const storedFunction = createRemoteFunctionWrapperWithCallbackRegistry(
      "obj_19",
      callbackRegistry,
      mockPort
    );
    
    // Call the stored function (simulating: const table = createElement('table'))
    storedFunction("table");
    
    // Verify the correct message was sent
    expect(mockPort.postMessage).toHaveBeenCalledTimes(1);
    
    const message = (mockPort.postMessage as any).mock.calls[0][0];
    
    console.log('📤 Message sent:', JSON.stringify(message, null, 2));
    
    // Verify it's the correct message type
    expect(message.messageType).toBe('ProxyStoredFunctionCall');
    expect(message.objectId).toBe('obj_19');
    expect(message.payload).toEqual(['table']);
    expect(message.functionName).toBeUndefined(); // Should NOT have functionName
    
    console.log('✅ FIXED: Now correctly sends ProxyStoredFunctionCall instead of ProxyFunctionCall');
  });

  it('should demonstrate the original bug scenario is now fixed', () => {
    console.log('🐛 DEMONSTRATING: Original bug scenario is now fixed');
    
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // This simulates the exact scenario from the user's question:
    // document.createElement was stored as obj_19, and now we're calling it
    const createElement = createRemoteFunctionWrapperWithCallbackRegistry(
      "obj_19", // This is the objectId where document.createElement was stored
      callbackRegistry,
      mockPort
    );
    
    // This simulates: const table = document.createElement('table');
    createElement('table');
    
    const message = (mockPort.postMessage as any).mock.calls[0][0];
    
    console.log('🔍 Original problematic message would have been:');
    console.log('   {"messageType":"ProxyFunctionCall","functionName":"obj_19",...}');
    console.log('');
    console.log('🎉 Fixed message is now:');
    console.log(`   ${JSON.stringify(message)}`);
    
    // Verify the fix
    expect(message.messageType).toBe('ProxyStoredFunctionCall');
    expect(message.objectId).toBe('obj_19');
    expect(message.functionName).toBeUndefined();
    
    console.log('');
    console.log('✅ The content script will now correctly:');
    console.log('   1. Receive ProxyStoredFunctionCall message');
    console.log('   2. Look up obj_19 in objectStore');
    console.log('   3. Call the stored function with arguments');
    console.log('   4. Return the result (DOM element)');
  });

  it('should verify that isProxy property works correctly for stored functions', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    const storedFunction = createRemoteFunctionWrapperWithCallbackRegistry(
      "obj_19",
      callbackRegistry,
      mockPort
    ) as any; // Type as any to access proxy properties
    
    // Verify isProxy works (needed for transpiled code)
    expect(storedFunction.isProxy).toEqual({ objectId: "obj_19" });
    
    // Verify serialization properties work
    expect(storedFunction.toJSON).toBeUndefined();
    expect(storedFunction.toString).toBeUndefined();
    expect(storedFunction.valueOf).toBeUndefined();
    
    // Verify other properties still throw errors (security)
    expect(() => storedFunction.length).toThrow('get for property length on ThenableCallable');
    expect(() => storedFunction.name).toThrow('get for property name on ThenableCallable');
    
    console.log('✅ Stored function proxy handles all property access correctly');
  });
}); 