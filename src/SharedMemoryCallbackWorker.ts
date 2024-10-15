// Declare the self type for the worker context
self.onmessage = function (e: MessageEvent) {
    const { port, sharedBuffer }: { port: MessagePort; sharedBuffer: SharedArrayBuffer } = e.data;
    const sharedArray = new Int32Array(sharedBuffer);
  
    // Listen for the message from the Service Worker via the MessagePort
    port.onmessage = function (event: MessageEvent) {
      console.log("Web Worker received from Service Worker:", event.data);
      
      // Convert the JSON data to a string
      const jsonString = JSON.stringify(event.data);
      
      // Encode the string as UTF-8 and store it in the shared array
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(jsonString);
      
      // Store the length of the data at index 1
      sharedArray[1] = encodedData.length;
      
      // Store the encoded data starting from index 2
      for (let i = 0; i < encodedData.length; i++) {
        sharedArray[i + 2] = encodedData[i];
      }

      // Notify the page script that the data is ready
      Atomics.store(sharedArray, 0, 1);  // Set a signal value in the shared buffer
      Atomics.notify(sharedArray, 0);    // Unblock the page script waiting on this index
  };
};
