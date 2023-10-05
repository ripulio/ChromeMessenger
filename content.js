
// As this is a simple extension, that is not using webpack our classes are imported using the manifest
// If you use NPM to depend on the module, you will need to import the classes from the module
// so uncomment below, and ensure your shared client classes in common are are also imported

//import { baseMessagingClient, baseMessagingServer, content_Server, classMapping } from "chromemessenger";
//import { background_Client } from "./common.js";

try {
    // Your content script's main logic here
    console.log("content.js loaded. about to run async main");

    (async () => {
        console.log("content.js loaded. running async main");
        try {
            // Define the methods that the content server will handle.
            const contentMethods = {
                sayHello: async (sendResponse) => {
                    return "Hello, World! From Content";
                },
                echoMessage: async (message, sendResponse) => {
                    return `Echoing: ${message}`;
                },
                calculateSum: async (a, b, sendResponse) => {
                    return a + b;
                }
            };

            // Instantiate the content server with the methods.
            const myServer = new content_Server(contentMethods);

            // Example to call background
            const backgroundClient = new background_Client();

            // Use await instead of then() and catch() for promises
            const callMeBackSaid = await backgroundClient.callMeBack();
            console.log('from the content script callMeBackSaid:', callMeBackSaid);
        } catch (err) {
            console.error('Error:', err);
        }
    })();

} catch (error) {
    console.error('Caught error in content script:', error);
}

