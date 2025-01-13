export type SandboxCallbackMessage = {
  callbackReference: string;
  sandboxTabId: number;
  messageType: "sandboxCallback";
  correlationId: string;
  args: any[];
};
