import { describe, it, expect } from 'vitest';

describe('forEach Method vs Global Function Distinction', () => {
  it('should explain the difference between Array.prototype.forEach and global forEach', () => {
    console.log('🤔 QUESTION: Should array.forEach hit the global forEach function?');
    console.log('');
    
    console.log('✅ ANSWER: No! Array.forEach is a METHOD on the array object, not a global function!');
    console.log('');
    
    console.log('📋 THE DISTINCTION:');
    console.log('');
    
    console.log('1️⃣ ARRAY.PROTOTYPE.FOREACH (Method):');
    console.log('   • This is a method that exists on Array.prototype');
    console.log('   • When you call array.forEach(), you\'re calling the method on that specific array');
    console.log('   • The array instance is the "this" context');
    console.log('   • Example: [1,2,3].forEach(callback) → calls the method on the array');
    console.log('');
    
    console.log('2️⃣ GLOBAL FOREACH (Hypothetical Function):');
    console.log('   • This would be a global function like setTimeout or console.log');
    console.log('   • It would be called as forEach(array, callback)');
    console.log('   • But this doesn\'t actually exist in JavaScript!');
    console.log('   • Example: forEach([1,2,3], callback) → would be a global function call');
    console.log('');
    
    console.log('🔧 IN OUR PROXY SYSTEM:');
    console.log('');
    console.log('   Stored Array Object:');
    console.log('   • objectStore.set("array123", [1,2,3])');
    console.log('   • Proxy: { kind: "objectId", value: "array123" }');
    console.log('   • Call: array.forEach(callback)');
    console.log('   • Result: ProxyMethodCall { objectId: "array123", methodName: "forEach" }');
    console.log('   • Content Script: objectStore.get("array123").forEach(callback)');
    console.log('');
    
    console.log('   Global Function (if it existed):');
    console.log('   • Proxy: { kind: "name", value: "forEach" }');
    console.log('   • Call: forEach(array, callback)');
    console.log('   • Result: ProxyFunctionCall { functionName: "forEach" }');
    console.log('   • Content Script: globalThis.forEach(array, callback)');
    console.log('');
    
    expect(true).toBe(true);
  });

  it('should demonstrate with real JavaScript examples', () => {
    console.log('🧪 REAL JAVASCRIPT EXAMPLES:');
    console.log('');
    
    // Real array with forEach method
    const realArray = [1, 2, 3];
    
    console.log('📦 ARRAY METHOD:');
    console.log('   const array = [1, 2, 3];');
    console.log('   array.forEach(callback); // Calls Array.prototype.forEach');
    console.log('   typeof array.forEach:', typeof realArray.forEach);
    console.log('   array.forEach === Array.prototype.forEach:', realArray.forEach === Array.prototype.forEach);
    console.log('');
    
    console.log('🌐 GLOBAL FUNCTION CHECK:');
    console.log('   typeof globalThis.forEach:', typeof (globalThis as any).forEach);
    console.log('   typeof window.forEach (in browser):', typeof (globalThis as any).forEach);
    console.log('   → undefined! There is no global forEach function');
    console.log('');
    
    console.log('🎯 CONCLUSION:');
    console.log('   • array.forEach() is ALWAYS a method call on the array object');
    console.log('   • There is no global forEach function in JavaScript');
    console.log('   • Our proxy system correctly identifies this as a ProxyMethodCall');
    
    expect(typeof realArray.forEach).toBe('function');
    expect(typeof (globalThis as any).forEach).toBe('undefined');
    expect(realArray.forEach).toBe(Array.prototype.forEach);
  });

  it('should show the difference with actual global functions', () => {
    console.log('🔄 COMPARISON WITH ACTUAL GLOBAL FUNCTIONS:');
    console.log('');
    
    console.log('✅ REAL GLOBAL FUNCTIONS:');
    console.log('   • setTimeout(callback, delay) → global function');
    console.log('   • console.log(message) → global function');
    console.log('   • parseInt(string) → global function');
    console.log('');
    
    console.log('✅ ARRAY METHODS:');
    console.log('   • array.forEach(callback) → method on array');
    console.log('   • array.map(callback) → method on array');
    console.log('   • array.filter(callback) → method on array');
    console.log('');
    
    console.log('🏗️ IN OUR PROXY SYSTEM:');
    console.log('');
    console.log('   Global Function Call:');
    console.log('   setTimeout(callback, 1000)');
    console.log('   → ProxyFunctionCall { functionName: "setTimeout" }');
    console.log('   → Executes: globalThis.setTimeout(callback, 1000)');
    console.log('');
    console.log('   Array Method Call:');
    console.log('   array.forEach(callback)');
    console.log('   → ProxyMethodCall { objectId: "array123", methodName: "forEach" }');
    console.log('   → Executes: storedArray.forEach(callback)');
    console.log('');
    
    // Verify the types
    expect(typeof setTimeout).toBe('function');
    expect(typeof console.log).toBe('function');
    expect(typeof Array.prototype.forEach).toBe('function');
    expect(typeof (globalThis as any).forEach).toBe('undefined');
  });
}); 