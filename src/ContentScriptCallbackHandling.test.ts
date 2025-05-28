import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Content Script Callback Handling', () => {
  describe('Function Identification', () => {
    it('should identify callback-based functions that need special handling', () => {
      const testCases = [
        {
          name: 'Array.forEach',
          target: [1, 2, 3],
          functionName: 'forEach',
          needsSpecialHandling: true,
          reason: 'Returns undefined, but has async callback'
        },
        {
          name: 'Array.map',
          target: [1, 2, 3],
          functionName: 'map',
          needsSpecialHandling: false,
          reason: 'Returns array immediately, not async'
        },
        {
          name: 'setTimeout',
          target: globalThis,
          functionName: 'setTimeout',
          needsSpecialHandling: true,
          reason: 'Returns timer ID, but has async callback'
        },
        {
          name: 'addEventListener',
          target: document.createElement('div'),
          functionName: 'addEventListener',
          needsSpecialHandling: true,
          reason: 'Returns void, but has async callback'
        },
        {
          name: 'Promise.then',
          target: Promise.resolve(),
          functionName: 'then',
          needsSpecialHandling: false,
          reason: 'Already returns Promise'
        }
      ];

      for (const testCase of testCases) {
        const func = testCase.target[testCase.functionName as keyof typeof testCase.target];
        const shouldHandle = needsSpecialCallbackHandling(testCase.target, testCase.functionName, func);
        
        console.log(`${testCase.name}: ${shouldHandle ? 'NEEDS' : 'NO'} special handling - ${testCase.reason}`);
        expect(shouldHandle).toBe(testCase.needsSpecialHandling);
      }
    });
  });

  describe('forEach Special Handling', () => {
    it('should transform forEach to return a Promise that waits for async callbacks', async () => {
      const array = ['Red', 'Green', 'Blue'];
      const results: string[] = [];
      
      // Simulate async callback
      const asyncCallback = async (color: string) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        results.push(color.toUpperCase());
      };

      // Current behavior (problematic)
      const currentResult = array.forEach(asyncCallback);
      expect(currentResult).toBeUndefined();
      expect(results).toHaveLength(0); // Callbacks haven't completed yet

      // Wait a bit and check
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(results).toHaveLength(3); // Now they've completed

      // Reset for special handling test
      results.length = 0;

      // Special handling (what we want)
      const specialResult = await transformForEachCall(array, asyncCallback);
      expect(specialResult).toBeUndefined(); // Still returns undefined like forEach
      expect(results).toHaveLength(3); // But callbacks have completed
      expect(results).toEqual(['RED', 'GREEN', 'BLUE']);
    });

    it('should handle nested async operations in forEach callbacks', async () => {
      const array = [1, 2, 3];
      const results: number[] = [];
      
      const complexAsyncCallback = async (num: number) => {
        // Simulate multiple async operations
        await new Promise(resolve => setTimeout(resolve, 5));
        const doubled = num * 2;
        await new Promise(resolve => setTimeout(resolve, 5));
        results.push(doubled);
      };

      await transformForEachCall(array, complexAsyncCallback);
      expect(results).toEqual([2, 4, 6]);
    });
  });

  describe('setTimeout Special Handling', () => {
    it('should transform setTimeout to return a Promise that waits for async callback', async () => {
      let callbackExecuted = false;
      
      const asyncCallback = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        callbackExecuted = true;
      };

      // Special handling for setTimeout
      const result = await transformSetTimeoutCall(asyncCallback, 20);
      
      // In Node.js, setTimeout returns a Timeout object, in browser it's a number
      expect(typeof result === 'number' || typeof result === 'object').toBe(true);
      expect(callbackExecuted).toBe(true); // But callback has completed
    });
  });

  describe('Integration with Content Script', () => {
    it('should demonstrate how this integrates with executeFunctionCall', async () => {
      // Mock the content script environment
      const mockCreateAndSendResponse = vi.fn();
      
      // Test array and callback
      const testArray = ['a', 'b', 'c'];
      const results: string[] = [];
      
      const asyncCallback = async (item: string) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        results.push(item.toUpperCase());
      };

      // Simulate the enhanced executeFunctionCall
      await enhancedExecuteFunctionCall(
        testArray.forEach.bind(testArray),
        [asyncCallback],
        mockCreateAndSendResponse,
        testArray,
        'forEach'
      );

      // Verify the response was sent after callbacks completed
      expect(mockCreateAndSendResponse).toHaveBeenCalledWith(undefined);
      expect(results).toEqual(['A', 'B', 'C']);
    });
  });
});

// Helper functions that would be added to ContentScriptServer.ts

function needsSpecialCallbackHandling(target: any, functionName: string, func: Function): boolean {
  // List of known callback-based functions that don't return Promises
  const callbackFunctions = new Set([
    'forEach',
    'setTimeout', 
    'setInterval',
    'addEventListener',
    'removeEventListener',
    'requestAnimationFrame',
    'requestIdleCallback'
  ]);

  // Check if it's a known callback function
  if (callbackFunctions.has(functionName)) {
    return true;
  }

  // Check if it's an Array method that takes a callback but doesn't return Promise
  if (Array.isArray(target) && typeof func === 'function') {
    const arrayCallbackMethods = ['forEach'];
    return arrayCallbackMethods.includes(functionName);
  }

  return false;
}

async function transformForEachCall(array: any[], callback: (value: any, index: number, array: any[]) => any): Promise<undefined> {
  // Transform forEach to Promise.all + map for proper async handling
  await Promise.all(array.map(callback));
  return undefined; // forEach returns undefined
}

async function transformSetTimeoutCall(callback: Function, delay: number): Promise<any> {
  return new Promise<any>((resolve) => {
    const timerId = setTimeout(async () => {
      await callback();
      resolve(timerId);
    }, delay);
  });
}

async function enhancedExecuteFunctionCall(
  targetFunction: Function,
  payload: any[],
  createAndSendResponse: (response: any) => void,
  target?: any,
  functionName?: string
): Promise<void> {
  try {
    let result: any;

    // Check if this function needs special callback handling
    if (target && functionName && needsSpecialCallbackHandling(target, functionName, targetFunction)) {
      console.log(`[ContentScriptServer] Applying special handling for ${functionName}`);
      
      if (functionName === 'forEach' && Array.isArray(target)) {
        // Transform forEach to wait for async callbacks
        result = await transformForEachCall(target, payload[0]);
      } else if (functionName === 'setTimeout') {
        // Transform setTimeout to wait for async callback
        result = await transformSetTimeoutCall(payload[0], payload[1]);
      } else {
        // Add more transformations as needed
        result = targetFunction(...payload);
      }
    } else {
      // Normal function execution
      result = targetFunction(...payload);
    }

    // Handle the result (same as current logic)
    const resolvedResult = await Promise.resolve(result);
    createAndSendResponse(resolvedResult);
    
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ContentScriptServer] Error in function execution:`, errorMsg);
    createAndSendResponse({ error: errorMsg });
  }
} 