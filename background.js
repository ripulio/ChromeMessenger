/* our test extension, uses the manifest and the classes included in the repo
    When you depend on this repo, you will need to import the files from the repo

    here is an example that should be in your code
    
    import { 
        background_Server, 
        background_Client, 
        content_Server, 
        content_Client, 
        sidebar_Server, 
        sidebar_Client 
    } from 'chromemessenger';

  */
//import { baseMessagingClient, baseMessagingServer, content_Server, background_Server, classMapping } from "chromemessenger";
//import { background_Client } from "./common.js";
//import { content_Client } from "./common.js";


console.log("background.js loaded");

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

console.log("background.js loaded. about to creaat server");
const myServer = new background_Server(backgroundMethods);
console.log("background.js loaded. server created");
