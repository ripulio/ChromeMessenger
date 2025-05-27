// Centralized comparison logic with correct operator mappings
export enum ComparisonOperator {
  LessThan = 30,              // <
  GreaterThan = 32,           // >
  LessThanEquals = 33,        // <=
  GreaterThanEquals = 34,     // >=
  ExclamationEqualsEquals = 35, // !==
  ExclamationEquals = 36,     // !=
  EqualsEqualsEquals = 37,    // ===
  EqualsEquals = 32,          // == (same as GreaterThan, need to handle differently)
  AmpersandAmpersand = 56,    // &&
  BarBar = 57                 // ||
}

export class ComparisonEngine {
  private readonly logger: (message: string, ...args: any[]) => void;

  constructor(logger?: (message: string, ...args: any[]) => void) {
    this.logger = logger ?? (() => {});
  }

  compare(operatorKind: string | number, left: any, right: any): any {
    // Handle string operators first, but only if they're not numeric strings
    if (typeof operatorKind === 'string' && isNaN(Number(operatorKind))) {
      return this.compareByStringOperator(operatorKind, left, right);
    }

    const operator = Number(operatorKind);
    this.logger('Executing comparison', { operator, left, right });

    switch (operator) {
      case 30: // LessThan
        return left < right;
      
      case 33: // LessThanEquals
        return left <= right;
      
      case 32: // GreaterThan (also conflicts with ==, need context)
        return left > right;
      
      case 34: // GreaterThanEquals
        return left >= right;
      
      case 37: // EqualsEqualsEquals
        return left === right;
      
      case 36: // ExclamationEquals
        return left != right;
      
      case 35: // ExclamationEqualsEquals
        return left !== right;
      
      case 56: // AmpersandAmpersand
        return left && right;
      
      case 57: // BarBar
        return left || right;
      
      default:
        this.logger(`Unknown comparison operator: ${operator}`);
        return false; // Don't throw, just return false for unknown operators
    }
  }

  private compareByStringOperator(operator: string, left: any, right: any): any {
    switch (operator) {
      case '<':
        return left < right;
      case '<=':
        return left <= right;
      case '>':
        return left > right;
      case '>=':
        return left >= right;
      case '==':
        return left == right;
      case '===':
        return left === right;
      case '!=':
        return left != right;
      case '!==':
        return left !== right;
      case '&&':
        return left && right;
      case '||':
        return left || right;
      default:
        this.logger(`Unknown string comparison operator: ${operator}`);
        return false;
    }
  }

  // For proxy objects that need custom comparison logic
  async compareWithProxy(
    operatorKind: string | number, 
    left: any, 
    right: any,
    proxyCompareFunction?: (op: number, l: any, r: any) => Promise<any>
  ): Promise<any> {
    if (proxyCompareFunction && this.isProxy(left)) {
      return proxyCompareFunction(Number(operatorKind), left, right);
    }
    
    if (proxyCompareFunction && this.isProxy(right)) {
      // Flip operator for right-side proxy
      const flippedOperator = this.flipOperator(Number(operatorKind));
      return proxyCompareFunction(flippedOperator, right, left);
    }

    return this.compare(operatorKind, left, right);
  }

  private isProxy(obj: any): boolean {
    return obj && typeof obj === 'object' && obj.isProxy;
  }

  private flipOperator(operator: number): number {
    switch (operator) {
      case 30: // LessThan
        return 32; // GreaterThan
      case 33: // LessThanEquals
        return 34; // GreaterThanEquals
      case 32: // GreaterThan
        return 30; // LessThan
      case 34: // GreaterThanEquals
        return 33; // LessThanEquals
      default:
        return operator; // Symmetric operators don't need flipping
    }
  }
} 