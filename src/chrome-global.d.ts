import { ChromeAsync as ripul_ChromeAsync, WindowAsync as ripul_WindowAsync } from "./TypeUtilities";

declare global {
  interface chrome extends ripul_ChromeAsync {}
  interface window extends ripul_WindowAsync {}
}

export {};
