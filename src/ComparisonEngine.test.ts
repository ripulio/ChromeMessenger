import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ComparisonEngine } from './ComparisonEngine'

describe('ComparisonEngine', () => {
  const mockLogger = vi.fn();
  let engine: ComparisonEngine;

  beforeEach(() => {
    mockLogger.mockClear();
    engine = new ComparisonEngine(mockLogger);
  });

  describe('TypeScript SyntaxKind mappings', () => {
    it('should correctly map equality operators', () => {
      expect(engine.compare('32', 5, 3)).toBe(true);   // GreaterThan: >
      expect(engine.compare('32', 3, 5)).toBe(false);
      
      expect(engine.compare('37', 5, 5)).toBe(true);   // EqualsEqualsEqualsToken: ===
      expect(engine.compare('37', 5, '5')).toBe(false);
    });

    it('should correctly map inequality operators', () => {
      expect(engine.compare('36', 5, 3)).toBe(true);   // ExclamationEqualsToken: !=
      expect(engine.compare('36', 5, 5)).toBe(false);
      
      expect(engine.compare('35', 5, '5')).toBe(true); // ExclamationEqualsEqualsToken: !==
      expect(engine.compare('35', 5, 5)).toBe(false);
    });

    it('should correctly map comparison operators', () => {
      expect(engine.compare('30', 3, 5)).toBe(true);   // LessThanToken: <
      expect(engine.compare('30', 5, 3)).toBe(false);
      
      expect(engine.compare('33', 3, 5)).toBe(true);   // LessThanEqualsToken: <=
      expect(engine.compare('33', 5, 5)).toBe(true);
      expect(engine.compare('33', 5, 3)).toBe(false);
      
      expect(engine.compare('32', 5, 3)).toBe(true);   // GreaterThanToken: >
      expect(engine.compare('32', 3, 5)).toBe(false);
      
      expect(engine.compare('34', 5, 3)).toBe(true);   // GreaterThanEqualsToken: >=
      expect(engine.compare('34', 5, 5)).toBe(true);
      expect(engine.compare('34', 3, 5)).toBe(false);
    });

    it('should correctly map logical operators', () => {
      expect(engine.compare('57', true, false)).toBe(true);  // BarBarToken: ||
      expect(engine.compare('57', false, false)).toBe(false);
      
      expect(engine.compare('56', true, false)).toBe(false); // AmpersandAmpersandToken: &&
      expect(engine.compare('56', true, true)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined values', () => {
      expect(engine.compare('37', null, null)).toBe(true);
      expect(engine.compare('37', undefined, undefined)).toBe(true);
      expect(engine.compare('37', null, undefined)).toBe(false);
    });

    it('should handle mixed types', () => {
      expect(engine.compare('==', '5', 5)).toBe(true);  // == allows type coercion
      expect(engine.compare('37', '5', 5)).toBe(false); // === requires same type
    });

    it('should return false for unknown operators', () => {
      const result = engine.compare('999', 5, 3);
      expect(result).toBe(false);
      expect(mockLogger).toHaveBeenCalledWith('Unknown comparison operator: 999');
    });
  });

  describe('string-based operator mapping', () => {
    it('should handle string operator names', () => {
      expect(engine.compare('==', 5, 5)).toBe(true);
      expect(engine.compare('===', 5, 5)).toBe(true);
      expect(engine.compare('!=', 5, 3)).toBe(true);
      expect(engine.compare('!==', 5, '5')).toBe(true);
      expect(engine.compare('<', 3, 5)).toBe(true);
      expect(engine.compare('<=', 3, 5)).toBe(true);
      expect(engine.compare('>', 5, 3)).toBe(true);
      expect(engine.compare('>=', 5, 3)).toBe(true);
      expect(engine.compare('||', true, false)).toBe(true);
      expect(engine.compare('&&', true, true)).toBe(true);
    });
  });

  describe('performance and reliability', () => {
    it('should handle large numbers', () => {
      const large1 = Number.MAX_SAFE_INTEGER;
      const large2 = Number.MAX_SAFE_INTEGER - 1;
      
      expect(engine.compare('32', large1, large2)).toBe(true); // >
      expect(engine.compare('30', large2, large1)).toBe(true); // <
    });

    it('should handle boolean comparisons correctly', () => {
      expect(engine.compare('37', true, true)).toBe(true);
      expect(engine.compare('37', false, false)).toBe(true);
      expect(engine.compare('37', true, false)).toBe(false);
    });
  });
}); 