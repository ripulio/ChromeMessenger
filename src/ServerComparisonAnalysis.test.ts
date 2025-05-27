import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Server Comparison Analysis: Original vs Refactored', () => {
  
  it('should demonstrate the exact difference in function serialization', () => {
    console.log('🔍 ANALYSIS: Function Serialization Differences');
    
    // Simulate window.location object
    const windowLocation = {
      href: "https://www.google.com/",
      toString: function() { return this.href; },
      valueOf: function() { return this.href; }
    };
    
    console.log('📊 Original window.location:');
    console.log('- toString type:', typeof windowLocation.toString);
    console.log('- toString callable:', typeof windowLocation.toString === 'function');
    console.log('- toString result:', windowLocation.toString());
    
    // ORIGINAL SERVER BEHAVIOR (makeObjectCloneable function)
    console.log('\n🔧 ORIGINAL SERVER - makeObjectCloneable:');
    const originalServerResult = makeObjectCloneableOriginal(windowLocation);
    console.log('- Result:', originalServerResult);
    console.log('- toString in result:', originalServerResult.toString);
    console.log('- toString type in result:', typeof originalServerResult.toString);
    
    // REFACTORED SERVER BEHAVIOR (Serializer)
    console.log('\n🔧 REFACTORED SERVER - Serializer:');
    const refactoredServerResult = serializeObjectRefactored(windowLocation);
    console.log('- Result:', refactoredServerResult);
    console.log('- toString in result:', refactoredServerResult.toString);
    console.log('- toString type in result:', typeof refactoredServerResult.toString);
    
    // TEST THE PROBLEMATIC LINE
    console.log('\n💥 TESTING PROBLEMATIC LINE: data?.toString?.()');
    
    console.log('\n✅ Original server data:');
    try {
      const result = originalServerResult?.toString?.() ?? '[object Object]';
      console.log('- Success:', result);
    } catch (error) {
      console.log('- Error:', (error as Error).message);
    }
    
    console.log('\n❌ Refactored server data:');
    try {
      const result = refactoredServerResult?.toString?.() ?? '[object Object]';
      console.log('- Success:', result);
    } catch (error) {
      console.log('- Error:', (error as Error).message);
      console.log('- This is the bug!');
    }
  });

  it('should show why optional chaining fails', () => {
    console.log('\n🔍 WHY OPTIONAL CHAINING FAILS:');
    
    const problematicObject = {
      toString: { __function: '[Function]' }
    };
    
    console.log('Object:', problematicObject);
    console.log('toString exists:', 'toString' in problematicObject);
    console.log('toString is truthy:', !!problematicObject.toString);
    console.log('toString is function:', typeof problematicObject.toString === 'function');
    
    // Optional chaining checks if property exists and is not null/undefined
    // But it doesn't check if it's callable!
    console.log('\nOptional chaining behavior:');
    console.log('problematicObject?.toString:', problematicObject?.toString);
    console.log('problematicObject?.toString?:', problematicObject?.toString ? 'exists' : 'does not exist');
    
    // The issue: optional chaining sees toString exists, so it tries to call it
    // But toString is an object, not a function!
         try {
       const result = (problematicObject as any)?.toString?.();
       console.log('Call succeeded:', result);
     } catch (error) {
       console.log('Call failed:', (error as Error).message);
       console.log('Because toString is not a function, it\'s an object!');
     }
  });
});

// Simulate original server's makeObjectCloneable function
function makeObjectCloneableOriginal(data: any): any {
  if (data === undefined || data === null || typeof data === "function") {
    return undefined;
  }

  if (Array.isArray(data)) {
    return { length: data.length };
  }

  if (typeof data === "object") {
    const obj: any = {};

    for (let key in data) {
      obj[key] =
        typeof data[key] === "object" || typeof data[key] === "function"
          ? undefined  // Functions become undefined!
          : data[key];
    }

    return obj;
  }

  return data;
}

// Simulate refactored server's serialization
function serializeObjectRefactored(obj: any): any {
  const result: any = {};
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'function') {
      result[key] = { __function: '[Function]' }; // Functions become objects!
    } else {
      result[key] = value;
    }
  }
  
  return result;
} 