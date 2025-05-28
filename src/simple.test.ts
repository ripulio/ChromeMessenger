// Simple test to verify Vitest setup
import { describe, it, expect } from 'vitest'

describe('Vitest Setup', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async tests', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should have access to mocked chrome APIs', () => {
    expect(chrome).toBeDefined();
    expect(chrome.runtime.getURL).toBeDefined();
  });
}); 