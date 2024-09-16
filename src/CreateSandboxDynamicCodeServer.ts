import { createBackgroundApiWrapper } from "./index";

export function createSandboxDynamicCodeServer(handler: (message: MessageEvent,kerome: typeof chrome) => void) {
  console.log("creating server");

  const kerome = createBackgroundApiWrapper<typeof chrome>();

  window.addEventListener("message", (event) => {
    handler(event, kerome);
  });
}