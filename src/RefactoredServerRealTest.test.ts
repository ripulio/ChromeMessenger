import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResponseFactory } from './core/ResponseFactory';
import { Serializer } from './Serialization';
import { ObjectStore } from './ObjectStore';
import { Logger, LogLevel } from './core/Logger';

describe('Refactored Server Real Data Test', () => {
  let responseFactory: ResponseFactory;
  let serializer: Serializer;
  let objectStore: ObjectStore;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({
      level: LogLevel.DEBUG,
      component: 'Test',
      enableConsole: true,
      enableStorage: false
    });

    objectStore = new ObjectStore();
    
    serializer = new Serializer({
      maxDepth: 3,
      includeNonEnumerable: false,
      includeFunctions: false
    });

    responseFactory = new ResponseFactory({
      objectStore,
      serializer,
      logger: logger.child('ResponseFactory')
    });
  });

  it('should test what the refactored server actually produces for window.location', () => {
    console.log('🔍 TESTING: Refactored server response for window.location');
    
    // Simulate window.location object
    const windowLocation = {
      href: "https://www.google.com/",
      origin: "https://www.google.com",
      protocol: "https:",
      host: "www.google.com",
      hostname: "www.google.com",
      port: "",
      pathname: "/",
      search: "",
      hash: "",
      toString: function() { return this.href; },
      valueOf: function() { return this.href; },
      assign: function(url: string) { /* mock */ },
      reload: function() { /* mock */ },
      replace: function(url: string) { /* mock */ }
    };

    console.log('📊 Original window.location:');
    console.log('- toString type:', typeof windowLocation.toString);
    console.log('- toString callable:', typeof windowLocation.toString === 'function');

    // Create response using the actual ResponseFactory
    const response = responseFactory.createResponse(windowLocation, 'test-correlation-id');
    
    console.log('🔧 ResponseFactory output:');
    console.log('- Response:', JSON.stringify(response, null, 2));
    console.log('- deserializeData:', 'deserializeData' in response ? (response as any).deserializeData : 'N/A');
    console.log('- data type:', typeof response.data);

    // Simulate what happens in the sandbox
    let objectData;
    if ('deserializeData' in response && response.deserializeData && typeof response.data === "string") {
      objectData = JSON.parse(response.data);
      console.log('📤 Parsed data in sandbox:', objectData);
    } else {
      objectData = response.data;
      console.log('📤 Direct data in sandbox:', objectData);
    }

    console.log('🔍 Final objectData analysis:');
    console.log('- toString in objectData:', objectData?.toString);
    console.log('- toString type:', typeof objectData?.toString);
    console.log('- has toString property:', 'toString' in (objectData || {}));

    // Test the problematic line that would be called in createObjectWrapperWithCallbackRegistry
    try {
      const result = objectData?.toString?.() ?? '[object Object]';
      console.log('✅ Optional chaining succeeded:', result);
    } catch (error) {
      console.log('❌ Optional chaining failed:', (error as Error).message);
      console.log('🚨 This is the bug!');
    }
  });
}); 