(async () => {
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
