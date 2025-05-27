// Test setup for ChromeMessenger with Vitest
import { vi, beforeEach, afterEach } from 'vitest'

// Mock Chrome APIs
const mockChrome = {
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    connect: vi.fn(() => ({
      postMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn()
      },
      disconnect: vi.fn()
    })),
    sendMessage: vi.fn()
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn()
  }
};

// Set up global chrome object
(global as any).chrome = mockChrome;

// Mock MessageChannel and MessagePort
class MockMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  private listeners: ((event: MessageEvent) => void)[] = [];

  postMessage(data: any): void {
    const event = new MessageEvent('message', { data });
    if (this.onmessage) {
      this.onmessage(event);
    }
    this.listeners.forEach(listener => listener(event));
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') {
      this.listeners.push(listener);
    }
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    }
  }

  start(): void {
    // Mock implementation
  }

  close(): void {
    // Mock implementation
  }
}

class MockMessageChannel {
  port1: MockMessagePort;
  port2: MockMessagePort;

  constructor() {
    this.port1 = new MockMessagePort();
    this.port2 = new MockMessagePort();
  }
}

(global as any).MessageChannel = MockMessageChannel;
(global as any).MessagePort = MockMessagePort;

// Mock console methods for cleaner test output
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Global test utilities
export const createMockMessageEvent = (data: any): MessageEvent => {
  return new MessageEvent('message', { data });
};

export const createMockPort = (): MockMessagePort => {
  return new MockMessagePort();
};

export { mockChrome }; 