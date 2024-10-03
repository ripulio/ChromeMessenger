import { createBackgroundApiWrapper } from "./index";

export function createSandboxDynamicCodeServer(handler: (message: MessageEvent) => void) {
  console.log("creating server");

  window.addEventListener("message", (event) => {
    handler(event);
  });
}