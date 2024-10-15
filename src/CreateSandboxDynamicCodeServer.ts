import { createProxyObjectFactoryForSandboxContext } from "./CreateProxyObjectForSandboxContext";
import { Function } from "./TypeUtilities";

const callbackRegistry = new Map<string, Function>();

export function createSandboxDynamicCodeServer(
  callbackWorkerUrl: string,
  handler: (
    message: MessageEvent,
    proxies: Window & typeof globalThis
  ) => void
) {
  const channel = new MessageChannel();
  console.log("creating server");

  function getBuffer(){
    try{
      const sharedArrayBuffer = new SharedArrayBuffer(1024);
      return sharedArrayBuffer;
    }
    catch(e){
      console.warn("error", e);
      console.warn("SharedArrayBuffer constructor not available, using WebAssembly memory instead");
      
      // doc state requirements for SharedArrayBuffer are crossOriginIsolated and isSecureContext both == true
      // they currently do === true - so this is a fallback assuming some problem with chrome
      //console.log("cross origin isolate", crossOriginIsolated);
      //console.log("is secure context", window.isSecureContext);
      const sharedMemory = new WebAssembly.Memory({initial: 1, shared: true, maximum: 2});
      const buffer = sharedMemory.buffer;
      return buffer;
    }

  }

  const sharedArrayBuffer = getBuffer();
  const sharedArray = new Int32Array(sharedArrayBuffer);

  // create service worker that takes sharedArray and port number
  const serviceWorker = new Worker(callbackWorkerUrl);
  serviceWorker.postMessage({
    messageType: "initializeConfig",
    port: channel.port1,
    sharedArrayBuffer: sharedArrayBuffer,
  });

  // create function that uses atomics to block until sharedArray is updated
  function waitForSharedArrayUpdate(): any {
    // Wait for the signal
    const value = Atomics.load(sharedArray, 0);
    if (value === 0) {
      Atomics.wait(sharedArray, 0, 0);
    }

    // Reset the signal
    Atomics.store(sharedArray, 0, 0);

    // Read the length of the data
    const dataLength = sharedArray[1];

    // Read the encoded data
    const encodedData = new Uint8Array(dataLength);
    for (let i = 0; i < dataLength; i++) {
      encodedData[i] = sharedArray[i + 2];
    }

    // Decode the data back into a string
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(encodedData);

    // Parse the JSON string into an object
    return JSON.parse(jsonString);
  }

  window.addEventListener("message", (event) => {
    console.log("Recieved message in sandbox", event.data);
    // initialization message, set config
    if (event.data.messageType === "initializeConfig") {
      console.log("initializeConfig iframe", event.data);
      return;
    }

    // callback from content script, execute against
    // callback registry
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
        return;
      }
      console.error("No callback found for ", callbackReference);
    } 

    /*
    TODO THIS WILL BE COMING FROM THE SHARED MEMORY NOW
    if (event.data.messageType === "objectReferenceResponse"){
      const object = event.data;
      if (!object){

      }
      const objectId = object.objectId;
      const proxyObject = createProxyObjectForSandboxContext(callbackRegistry, object);
      console.log("proxyObject", proxyObject);
      return;
    }
    */
    // unknown function call, allow handling by consumer
    const proxies = createProxyObjectFactoryForSandboxContext<
      Window & typeof globalThis
    >(callbackRegistry, waitForSharedArrayUpdate);

    handler(event, proxies);
  });
}
