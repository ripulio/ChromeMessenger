import { describe, it, expect, vi } from 'vitest';
import { createObjectWrapperWithCallbackRegistry, createRemoteFunctionWrapperWithCallbackRegistry, getCallbackRegistry } from './TypeUtilities';

describe('Message Type Detection', () => {
  it('should correctly determine ProxyStoredFunctionCall for stored function objects', () => {
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
      "obj_19", // This is a stored function object ID
      callbackRegistry,
      mockPort
    );

    // Call the stored function - this should trigger ProxyStoredFunctionCall
    storedFunction("table");
    
    // Verify that postMessage was called with ProxyStoredFunctionCall
    expect(mockPort.postMessage).toHaveBeenCalled();
    const sentMessage = (mockPort.postMessage as any).mock.calls[0][0];
    
    console.log('Sent message for stored function call:', JSON.stringify(sentMessage, null, 2));
    
    expect(sentMessage.messageType).toBe('ProxyStoredFunctionCall');
    expect(sentMessage.objectId).toBe('obj_19');
    expect(sentMessage.payload).toEqual(['table']);
    expect(sentMessage.functionName).toBeUndefined();
    expect(sentMessage.methodName).toBeUndefined();
  });

  it('should correctly determine ProxyMethodCall for method calls on stored objects', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Create a proxy object with objectId (stored object)
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" }, // This indicates a stored object
      callbackRegistry,
      mockPort
    );

    // Access forEach property - this creates a ThenableCallableProxy
    const forEachMethod = arrayProxy.forEach;
    
    // Call the method - this should trigger ProxyMethodCall
    forEachMethod(() => {});
    
    // Verify that postMessage was called with ProxyMethodCall
    expect(mockPort.postMessage).toHaveBeenCalled();
    const sentMessage = (mockPort.postMessage as any).mock.calls[0][0];
    
    console.log('Sent message for array.forEach():', JSON.stringify(sentMessage, null, 2));
    
    expect(sentMessage.messageType).toBe('ProxyMethodCall');
    expect(sentMessage.objectId).toBe('array123');
    expect(sentMessage.methodName).toBe('forEach');
  });

  it('should correctly determine ProxyFunctionCall for global function calls', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Create a proxy object with name (global object/function)
    const globalProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "setTimeout" }, // This indicates a global function
      callbackRegistry,
      mockPort
    );

    // Access the function - this creates a ThenableCallableProxy
    const setTimeoutFunction = globalProxy.setTimeout;
    
    // Call the function - this should trigger ProxyFunctionCall
    setTimeoutFunction(() => {}, 1000);
    
    // Verify that postMessage was called with ProxyFunctionCall
    expect(mockPort.postMessage).toHaveBeenCalled();
    const sentMessage = (mockPort.postMessage as any).mock.calls[0][0];
    
    console.log('Sent message for setTimeout():', JSON.stringify(sentMessage, null, 2));
    
    expect(sentMessage.messageType).toBe('ProxyFunctionCall');
    expect(sentMessage.functionName).toBe('setTimeout');
    expect(sentMessage.objectId).toBeUndefined();
  });

  it('should demonstrate the difference between method calls and function calls', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Scenario 1: Method call on stored array object
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      callbackRegistry,
      mockPort
    );
    
    arrayProxy.forEach(() => {}); // Method call
    
    // Scenario 2: Global function call
    const globalProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "globalFunction" },
      callbackRegistry,
      mockPort
    );
    
    globalProxy.someGlobalFunction(); // Function call
    
    // Verify both messages were sent
    expect(mockPort.postMessage).toHaveBeenCalledTimes(2);
    
    const methodCallMessage = (mockPort.postMessage as any).mock.calls[0][0];
    const functionCallMessage = (mockPort.postMessage as any).mock.calls[1][0];
    
    console.log('Method call message:', JSON.stringify(methodCallMessage, null, 2));
    console.log('Function call message:', JSON.stringify(functionCallMessage, null, 2));
    
    // Verify method call
    expect(methodCallMessage.messageType).toBe('ProxyMethodCall');
    expect(methodCallMessage.objectId).toBe('array123');
    expect(methodCallMessage.methodName).toBe('forEach');
    
    // Verify function call
    expect(functionCallMessage.messageType).toBe('ProxyFunctionCall');
    expect(functionCallMessage.functionName).toBe('someGlobalFunction');
    expect(functionCallMessage.objectId).toBeUndefined();
  });

  it('should show how the proxy node type determines the message type', () => {
    console.log('🔍 PROXY NODE TYPE DETERMINES MESSAGE TYPE:');
    console.log('');
    
    console.log('📦 STORED OBJECT (objectId):');
    console.log('   Node: { kind: "objectId", value: "array123" }');
    console.log('   Access: arrayProxy.forEach');
    console.log('   Call: arrayProxy.forEach(callback)');
    console.log('   Result: ProxyMethodCall { objectId: "array123", methodName: "forEach" }');
    console.log('');
    
    console.log('🌐 GLOBAL FUNCTION (name):');
    console.log('   Node: { kind: "name", value: "setTimeout" }');
    console.log('   Access: globalProxy.setTimeout');
    console.log('   Call: globalProxy.setTimeout(callback, delay)');
    console.log('   Result: ProxyFunctionCall { functionName: "setTimeout" }');
    console.log('');
    
    console.log('🔧 STORED FUNCTION (objectId only):');
    console.log('   Created: createRemoteFunctionWrapperWithCallbackRegistry("obj_19")');
    console.log('   Call: storedFunction("table")');
    console.log('   Result: ProxyStoredFunctionCall { objectId: "obj_19" }');
    console.log('');
    
    console.log('✅ The distinction is clear and automatic!');
    
    expect(true).toBe(true); // This test is for documentation
  });

  it('should demonstrate the complete message type determination flow', () => {
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Scenario 1: Stored function object (like document.createElement stored as obj_19)
    const storedFunction = createRemoteFunctionWrapperWithCallbackRegistry(
      "obj_19",
      callbackRegistry,
      mockPort
    );
    storedFunction("table");
    
    // Scenario 2: Method call on stored array object
    const arrayProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "objectId", value: "array123" },
      callbackRegistry,
      mockPort
    );
    arrayProxy.forEach(() => {});
    
    // Scenario 3: Global function call
    const globalProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "setTimeout" },
      callbackRegistry,
      mockPort
    );
    globalProxy.setTimeout(() => {}, 1000);
    
    // Verify all three messages were sent
    expect(mockPort.postMessage).toHaveBeenCalledTimes(3);
    
    const storedFunctionMessage = (mockPort.postMessage as any).mock.calls[0][0];
    const methodCallMessage = (mockPort.postMessage as any).mock.calls[1][0];
    const functionCallMessage = (mockPort.postMessage as any).mock.calls[2][0];
    
    console.log('Stored function message:', JSON.stringify(storedFunctionMessage, null, 2));
    console.log('Method call message:', JSON.stringify(methodCallMessage, null, 2));
    console.log('Function call message:', JSON.stringify(functionCallMessage, null, 2));
    
    // Verify stored function call
    expect(storedFunctionMessage.messageType).toBe('ProxyStoredFunctionCall');
    expect(storedFunctionMessage.objectId).toBe('obj_19');
    expect(storedFunctionMessage.payload).toEqual(['table']);
    
    // Verify method call
    expect(methodCallMessage.messageType).toBe('ProxyMethodCall');
    expect(methodCallMessage.objectId).toBe('array123');
    expect(methodCallMessage.methodName).toBe('forEach');
    
    // Verify function call
    expect(functionCallMessage.messageType).toBe('ProxyFunctionCall');
    expect(functionCallMessage.functionName).toBe('setTimeout');
    expect(functionCallMessage.objectId).toBeUndefined();
  });
}); 