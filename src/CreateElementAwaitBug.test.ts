import { describe, it, expect, vi } from 'vitest';
import { createRemoteFunctionWrapperWithCallbackRegistry, createObjectWrapperWithCallbackRegistry, getCallbackRegistry } from './TypeUtilities';
import { resolveResponse } from './AsyncResponseDirectory';

describe('CreateElement Await Bug', () => {
  it('should reproduce the exact bug: await document["createElement"] throws then property error', async () => {
    console.log('🐛 REPRODUCING: Exact transpiled pattern that causes the bug');
    
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Step 1: Create document proxy (as in user's scenario)
    const documentProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "document" },
      callbackRegistry,
      mockPort
    );
    
    // Step 2: Mock the content script response for document["createElement"]
    (mockPort.postMessage as any).mockImplementation((message: any) => {
      console.log('📤 Message sent:', JSON.stringify(message, null, 2));
      
      if (message.messageType === 'ProxyPropertyAccess' && message.property === 'createElement') {
        setTimeout(() => {
          // The content script returns a function reference
          // This should create a createRemoteFunctionWrapperWithCallbackRegistry
          const functionWrapper = createRemoteFunctionWrapperWithCallbackRegistry(
            'obj_19', // createElement gets stored as obj_19
            callbackRegistry,
            mockPort
          );
          resolveResponse(message.correlationId, functionWrapper, {
            messageType: 'functionReferenceResponse',
            correlationId: message.correlationId,
            objectId: 'obj_19',
            data: 'function createElement() { [native code] }'
          });
        }, 10);
      }
    });
    
    // Step 3: Execute the problematic transpiled line
    // const createElement_1 = document?.isProxy ? await document["createElement"] : ...
    
    try {
      console.log('🔍 Executing: await document["createElement"]');
      const createElement_1 = await documentProxy["createElement"];
      
      console.log('✅ Successfully got createElement_1:', typeof createElement_1);
      console.log('createElement_1.isProxy =', (createElement_1 as any).isProxy);
      
      // This should not throw an error if the fix is working
      expect(typeof createElement_1).toBe('function');
      
    } catch (error) {
      console.log('❌ Error caught:', (error as Error).message);
      
      // This is the bug we're trying to fix
      if ((error as Error).message.includes('get for property then on ThenableCallable')) {
        console.log('🐛 CONFIRMED: This is the exact bug reported by the user');
        expect((error as Error).message).toContain('get for property then on ThenableCallable');
      } else {
        throw error; // Re-throw if it's a different error
      }
    }
  });

  it('should demonstrate the correct flow after the fix', async () => {
    console.log('🔧 DEMONSTRATING: How it should work after the fix');
    
    const mockPort = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      start: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;

    const callbackRegistry = getCallbackRegistry();
    
    // Create document proxy
    const documentProxy = createObjectWrapperWithCallbackRegistry(
      { kind: "name", value: "document" },
      callbackRegistry,
      mockPort
    );
    
    // Mock successful response
    (mockPort.postMessage as any).mockImplementation((message: any) => {
      if (message.messageType === 'ProxyPropertyAccess' && message.property === 'createElement') {
        setTimeout(() => {
          const functionWrapper = createRemoteFunctionWrapperWithCallbackRegistry(
            'obj_19',
            callbackRegistry,
            mockPort
          );
          resolveResponse(message.correlationId, functionWrapper, {
            messageType: 'functionReferenceResponse',
            correlationId: message.correlationId,
            objectId: 'obj_19',
            data: 'function createElement() { [native code] }'
          });
        }, 10);
      }
    });
    
    // This should work without throwing the then property error
    const createElement_1 = await documentProxy["createElement"];
    
    expect(typeof createElement_1).toBe('function');
    expect((createElement_1 as any).isProxy).toEqual({ objectId: 'obj_19' });
    
    console.log('✅ await document["createElement"] works correctly');
    console.log('✅ createElement_1.isProxy returns the correct objectId');
  });

  it('should show the difference between property access and function calls', async () => {
    console.log('🔍 ANALYSIS: Property access vs function calls');
    
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
      mockPort
    );
    
    // Test 1: Property access (creates ThenableCallableProxy)
    const createElementProperty = documentProxy.createElement;
    console.log('📝 documentProxy.createElement returns:', typeof createElementProperty);
    console.log('📝 createElementProperty.isProxy =', (createElementProperty as any).isProxy);
    
    // Test 2: Awaiting property access (should resolve to function wrapper)
    (mockPort.postMessage as any).mockImplementation((message: any) => {
      if (message.messageType === 'ProxyPropertyAccess') {
        setTimeout(() => {
          const functionWrapper = createRemoteFunctionWrapperWithCallbackRegistry(
            'obj_19',
            callbackRegistry,
            mockPort
          );
          resolveResponse(message.correlationId, functionWrapper, {
            messageType: 'functionReferenceResponse',
            correlationId: message.correlationId,
            objectId: 'obj_19',
            data: 'function createElement() { [native code] }'
          });
        }, 10);
      }
    });
    
    try {
      const awaitedProperty = await createElementProperty;
      console.log('📝 await createElementProperty returns:', typeof awaitedProperty);
      console.log('📝 awaitedProperty.isProxy =', (awaitedProperty as any).isProxy);
    } catch (error) {
      console.log('❌ Error awaiting property:', (error as Error).message);
    }
  });
}); 