import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageRouter, SandboxMessage } from './MessageTypes'

// Mock handler for testing
class MockHandler {
  constructor(private response: any) {}
  
  async handle(message: SandboxMessage): Promise<any> {
    return this.response;
  }
}

describe('MessageTypes', () => {
  let router: MessageRouter;

  beforeEach(() => {
    router = new MessageRouter();
  });

  describe('MessageRouter', () => {
    it('should register and route messages correctly', async () => {
      const mockHandler = new MockHandler('test response');
      router.register('ProxyPropertyAccess', mockHandler);

      const message: SandboxMessage = {
        messageType: 'ProxyPropertyAccess',
        correlationId: 'test-123',
        source: 'sandbox',
        objectId: 'obj_1',
        property: 'testProp'
      };

      const result = await router.route(message);
      expect(result).toBe('test response');
    });

    it('should throw error for unregistered message types', async () => {
      const message = {
        messageType: 'UnknownType',
        correlationId: 'test-123',
        source: 'sandbox' as const
      };

      await expect(router.route(message)).rejects.toThrow('No handler for message type: UnknownType');
    });

    it('should handle multiple message types', async () => {
      const propertyHandler = new MockHandler('property result');
      const functionCallHandler = new MockHandler('function call result');

      router.register('ProxyPropertyAccess', propertyHandler);
      router.register('ProxyFunctionCall', functionCallHandler);

      const propertyMessage: SandboxMessage = {
        messageType: 'ProxyPropertyAccess',
        correlationId: 'test-1',
        source: 'sandbox',
        objectId: 'obj_1',
        property: 'testProp'
      };

      const functionCallMessage: SandboxMessage = {
        messageType: 'ProxyFunctionCall',
        correlationId: 'test-2',
        source: 'sandbox',
        functionName: 'testFunc',
        payload: [],
        sandboxTabId: 123
      };

      const propertyResult = await router.route(propertyMessage);
      const functionCallResult = await router.route(functionCallMessage);

      expect(propertyResult).toBe('property result');
      expect(functionCallResult).toBe('function call result');
    });

    it('should pass the correct message to handlers', async () => {
      const handlerSpy = vi.fn().mockResolvedValue('result');
      const mockHandler = { handle: handlerSpy };

      router.register('ProxyPropertyAccess', mockHandler);

      const message: SandboxMessage = {
        messageType: 'ProxyPropertyAccess',
        correlationId: 'test-123',
        source: 'sandbox',
        objectId: 'obj_1',
        property: 'testProp'
      };

      await router.route(message);

      expect(handlerSpy).toHaveBeenCalledWith(message);
      expect(handlerSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle async handler errors', async () => {
      const errorHandler = {
        handle: vi.fn().mockRejectedValue(new Error('Handler error'))
      };

      router.register('ProxyPropertyAccess', errorHandler);

      const message: SandboxMessage = {
        messageType: 'ProxyPropertyAccess',
        correlationId: 'test-123',
        source: 'sandbox',
        objectId: 'obj_1',
        property: 'testProp'
      };

      await expect(router.route(message)).rejects.toThrow('Handler error');
    });
  });

  describe('Message Type Validation', () => {
    it('should validate ProxyPropertyAccess messages', () => {
      const validMessage: SandboxMessage = {
        messageType: 'ProxyPropertyAccess',
        correlationId: 'test-123',
        source: 'sandbox',
        objectId: 'obj_1',
        property: 'testProp'
      };

      // TypeScript should allow this without errors
      expect(validMessage.messageType).toBe('ProxyPropertyAccess');
      if ('objectId' in validMessage) {
        expect(validMessage.objectId).toBe('obj_1');
      }
      if ('property' in validMessage) {
        expect(validMessage.property).toBe('testProp');
      }
    });

    it('should validate ProxyFunctionCall messages', () => {
      const validMessage: SandboxMessage = {
        messageType: 'ProxyFunctionCall',
        correlationId: 'test-123',
        source: 'sandbox',
        functionName: 'testFunc',
        payload: [1, 2, 3],
        sandboxTabId: 123
      };

      expect(validMessage.messageType).toBe('ProxyFunctionCall');
      if ('functionName' in validMessage) {
        expect(validMessage.functionName).toBe('testFunc');
      }
      if ('payload' in validMessage) {
        expect(validMessage.payload).toEqual([1, 2, 3]);
      }
    });

    it('should validate ProxyMethodCall messages', () => {
      const validMessage: SandboxMessage = {
        messageType: 'ProxyMethodCall',
        correlationId: 'test-123',
        source: 'sandbox',
        objectId: 'obj_1',
        methodName: 'testMethod',
        payload: [1, 2, 3],
        sandboxTabId: 123
      };

      expect(validMessage.messageType).toBe('ProxyMethodCall');
      if ('objectId' in validMessage) {
        expect(validMessage.objectId).toBe('obj_1');
      }
      if ('methodName' in validMessage) {
        expect(validMessage.methodName).toBe('testMethod');
      }
      if ('payload' in validMessage) {
        expect(validMessage.payload).toEqual([1, 2, 3]);
      }
    });

    it('should validate ProxyComparison messages', () => {
      const validMessage: SandboxMessage = {
        messageType: 'ProxyComparison',
        correlationId: 'test-123',
        source: 'sandbox',
        objectId: 'obj_1',
        functionPath: ['path', 'to', 'prop'],
        value: {
          operatorKind: '37',
          value: 'test'
        }
      };

      expect(validMessage.messageType).toBe('ProxyComparison');
      if ('value' in validMessage) {
        expect(validMessage.value.operatorKind).toBe('37');
        expect(validMessage.value.value).toBe('test');
      }
    });

    it('should validate ProxyAssignment messages', () => {
      const validMessage: SandboxMessage = {
        messageType: 'ProxyAssignment',
        correlationId: 'test-123',
        source: 'sandbox',
        objectId: 'obj_1',
        functionPath: ['path', 'to', 'prop'],
        property: 'testProp',
        value: 'new value'
      };

      expect(validMessage.messageType).toBe('ProxyAssignment');
      if ('property' in validMessage) {
        expect(validMessage.property).toBe('testProp');
      }
      if ('value' in validMessage) {
        expect(validMessage.value).toBe('new value');
      }
    });

    it('should validate SandboxCallback messages', () => {
      const validMessage: SandboxMessage = {
        messageType: 'sandboxCallback',
        correlationId: 'test-123',
        source: 'sandbox',
        callbackReference: 'callback_123',
        sandboxTabId: 456,
        args: ['arg1', 'arg2']
      };

      expect(validMessage.messageType).toBe('sandboxCallback');
      if ('callbackReference' in validMessage) {
        expect(validMessage.callbackReference).toBe('callback_123');
      }
      if ('args' in validMessage) {
        expect(validMessage.args).toEqual(['arg1', 'arg2']);
      }
    });
  });
}); 