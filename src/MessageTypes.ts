// Centralized message type definitions
export interface BaseMessage {
  messageType: string;
  correlationId: string;
  source: 'sandbox' | 'content-script' | 'background';
}

export interface ProxyFunctionCallMessage extends BaseMessage {
  messageType: 'ProxyFunctionCall';
  functionName: string;
  payload: any[];
  sandboxTabId: number;
}

export interface ProxyStoredFunctionCallMessage extends BaseMessage {
  messageType: 'ProxyStoredFunctionCall';
  objectId: string;
  payload: any[];
  sandboxTabId: number;
}

export interface ProxyMethodCallMessage extends BaseMessage {
  messageType: 'ProxyMethodCall';
  objectId: string;
  methodName: string;
  payload: any[];
  sandboxTabId: number;
}

export interface ProxyPropertyAccessMessage extends BaseMessage {
  messageType: 'ProxyPropertyAccess';
  objectId?: string;
  objectName?: string;
  property: string;
}

export interface ProxyComparisonMessage extends BaseMessage {
  messageType: 'ProxyComparison';
  objectId?: string;
  functionPath: string[];
  value: {
    operatorKind: string;
    value: any;
  };
}

export interface ProxyAssignmentMessage extends BaseMessage {
  messageType: 'ProxyAssignment';
  objectId?: string;
  functionPath: string[];
  property: string;
  value: any;
}

export interface SandboxCallbackMessage extends BaseMessage {
  messageType: 'sandboxCallback';
  callbackReference: string;
  sandboxTabId: number;
  args: any[];
}

export interface SandboxCallbackResponseMessage extends BaseMessage {
  messageType: 'sandboxCallbackResponse';
  data?: any;
  error?: any;
}

export type SandboxMessage = 
  | ProxyPropertyAccessMessage
  | ProxyFunctionCallMessage
  | ProxyStoredFunctionCallMessage
  | ProxyMethodCallMessage
  | ProxyComparisonMessage
  | ProxyAssignmentMessage
  | SandboxCallbackMessage
  | SandboxCallbackResponseMessage;

// Message handlers with proper typing
export interface MessageHandler<T extends BaseMessage> {
  handle(message: T): Promise<any> | any;
}

export class MessageRouter {
  private handlers = new Map<string, MessageHandler<any>>();

  register<T extends BaseMessage>(
    messageType: T['messageType'], 
    handler: MessageHandler<T>
  ) {
    this.handlers.set(messageType, handler);
  }

  async route(message: BaseMessage): Promise<any> {
    const handler = this.handlers.get(message.messageType);
    if (!handler) {
      throw new Error(`No handler for message type: ${message.messageType}`);
    }
    return handler.handle(message);
  }
} 