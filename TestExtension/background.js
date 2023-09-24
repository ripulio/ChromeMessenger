const backgroundMethods = {
    sayHello: async (sendResponse) => {
        return "Hello, World! From Background";
    },

    callMeBack: async (sendResponse) => {
        const myClient = new content_Client({ source: 'background' });
        const result = await myClient.sayHello();
        console.log('Result in CallMeBack:', result);
        return "I should have just called you back"
    }
};

const myServer = new background_Server(backgroundMethods);
