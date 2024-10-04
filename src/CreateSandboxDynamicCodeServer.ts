export function createSandboxDynamicCodeServer(
  callbackRegistry: Map<string, Function>,
  handler: (message: MessageEvent) => void
) {
  console.log("creating server");

  window.addEventListener("message", (event) => {
    if (event.data.messageType === "sandboxCallback") {
      const callbackReference = event.data.callbackReference;
      const callbackId = callbackReference.split("|")[1];
      const callback = callbackRegistry.get(callbackId);
      if (callback) {
        // Deserialize each argument
        const deserializedArgs = event.data.args.map((arg: string) =>
          JSON.parse(arg)
        );
        callback(...deserializedArgs);
      }
    } else {
      handler(event);
    }
  });
}
