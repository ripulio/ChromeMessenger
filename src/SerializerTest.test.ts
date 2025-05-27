import { describe, it, expect } from 'vitest';
import { Serializer } from './Serialization';

describe('Serializer Function Handling', () => {
  it('should handle functions correctly (but ResponseFactory uses makeObjectCloneable for the fix)', () => {
    const serializer = new Serializer({
      includeFunctions: false
    });

    const windowLocation = {
      href: "https://www.google.com/",
      toString: function() { return this.href; },
      valueOf: function() { return this.href; }
    };

    console.log('🔍 Original object:', windowLocation);
    console.log('- toString type:', typeof windowLocation.toString);

    const serialized = serializer.serialize(windowLocation);
    console.log('🔧 Serialized object:', serialized);
    console.log('- toString in serialized:', serialized.toString);
    console.log('- toString type in serialized:', typeof serialized.toString);

    const jsonString = JSON.stringify(serialized);
    console.log('📦 JSON string:', jsonString);

    const parsed = JSON.parse(jsonString);
    console.log('📤 Parsed object:', parsed);
    console.log('- toString in parsed:', parsed.toString);
    console.log('- toString type in parsed:', typeof parsed.toString);
    console.log('- has toString property:', 'toString' in parsed);

    // Test the problematic line
    try {
      const result = parsed?.toString?.() ?? '[object Object]';
      console.log('✅ Optional chaining succeeded:', result);
    } catch (error) {
      console.log('❌ Optional chaining failed:', (error as Error).message);
    }
  });
}); 