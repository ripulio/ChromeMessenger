// #region BaseClasses
console.log("baseMessengers.js loaded");


const classMapping = {};
class baseMessagingHandler {
    #target;
    #context;
    #functionTable = {};

    constructor(handlerObject) {
        this.#registerFunctionsFromObject(handlerObject);
        this.#initCommon();
    }

    #registerFunctionsFromObject(handlerObject) {
        // This code will be the same as in your original #registerFunctionsFromObject method
    }

    #initCommon() {
        // This can include any common initialization logic.
        // For now, it's empty, but can be filled in as required.
    }

    setTarget(target) {
        this.#target = target;
    }

    setContext(context) {
        this.#context = context;
    }
}




class baseMessagingServer {
    #functionTable = {};
    #target;
    #context;

    static register() {
        if (this.name) {
            classMapping[this.name] = this;
        }
    }


    constructor(handlerObject) {
        const target = this.constructor.name.replace(/_Server$/, '').toLowerCase();
        this.#target = target;
        this.#registerFunctionsFromObject(handlerObject);
        this.#init();
        this.#autoCheckMethodConsistency();
    }

    #registerFunctionsFromObject(handlerObject) {
        for (const [key, func] of Object.entries(handlerObject)) {
            if (typeof func === 'function') {
                // the arguments come in this order : 
                // extra comments to test merge
                // parameters - the custom parameters for the method, this is variable, and are first in the array.
                // the callback function - this is internal management to close the loop)
                // the sender, which is the chrome.runtime.onMessage sender, and will allow access to the tab and tab id
                // the context, which is the custom context that was passed in. This is used to allow an implementation to interrogate the sedning context, if needed
                // we pop the internal framework arguments out one by one from the bottom of the array
                // this leaves the custom parameters in the array, which we pass to the function
                this.#functionTable[key] = async (...args) => {
                    const context = args.pop();
                    const sender = args.pop();
                    const sendResponse = args.pop();
                    const result = await func(...args, sendResponse, sender, context);  // Context is the last parameter
                    sendResponse(result);
                };
            }
        }
    }



    #init() {
        // the messaging framework uses a consistent set of arguments, packing the custom arguments into a payload array
        // the request should always have these four params
        /*
        {
            "target": "background",             // used by the framework to determine which target to send the message to
            "messageType": "executeProject",    // maps to a function name on the server
            "payload": [                        // the custom parameters for the function
                {
                    "projectId": 71,            // everything here is custom, in this example we are executing a project
                    "uxSideBar": {
                        "tags": []
                    }
                }
            ],
            "context": {}                       // this is custom, and is used to allow the server to interrogate the sending context, if needed. In this example it is empty
        }
        */
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            console.log("chrome.runtime.onMessage called:");
            console.log("Request:", request);
            console.log("Sender:", sender);

            if (request.target !== this.#target) return;

            const handler = this.#functionTable[request.messageType];
            if (handler) {
                console.log("Handler found:", handler);
                handler(...request.payload, sendResponse, sender, request.context);
                return true;
            }
        });

        window.addEventListener('message', (event) => {
            console.log("window.addEventListener called");
            console.log("Event data:", event.data);

            if (event.source !== window || event.data.target !== this.#target) return;

            if (event.data.messageType === "routeTo") {
                // at this point the server (often the content_server) is being asked to route a message to another target
                // usually the background_server, so it needs to construct the correct client (again usually the background_client)
                // and call the correct method on that client


                const sendResponse = (response) => {
                    //!! This helps deal with local files, need to explore any potiential security issues
                    let targetOrigin = '*';  // Default to wildcard
                    if (typeof window !== 'undefined' && window !== null) {  // Check if window object is available
                        targetOrigin = (window.origin && window.origin !== 'null') ? window.origin : '*';
                    }

                    window.postMessage({ target: this.#target, messageType: event.data.messageType, response }, targetOrigin);
                };
                // We are proxying now, so the target has to shift to the proxy target
                // !!! not sure how we are getting here, with event.data missing, for now protect against it, and investigate later
                if (event.data.payload) {
                    this.routeTo(event.data.messageType, event.data.proxyTarget, [...event.data.payload, sendResponse, null, event.data.context]);
                }
                else {
                    console.log("event.data is null, so not routing");
                }

            } else {
                const handler = this.#functionTable[event.data.messageType];
                if (handler) {
                    let targetOrigin = '*';  // Default to wildcard
                    if (typeof window !== 'undefined' && window !== null) {  // Check if window object is available
                        targetOrigin = (window.origin && window.origin !== 'null') ? window.origin : '*';
                    }
                    const sendResponse = (response) => {
                        window.postMessage({ target: this.#target, messageType: event.data.messageType, response }, targetOrigin);
                    };
                    // !!! adding null for the sender here, this needs investigation, what is the sender in this case?
                    // This is a stray event case, we need to track it down, don't let this stay in the final code
                    if (event.data.payload) {
                        handler(...event.data.payload, sendResponse, null, event.data.context);
                    }
                    else {
                        console.log("!!!  event.data.payload is null, so not routing -- clear up why this is getting fired, could lead to errors later")
                    }
                }
            }
        });
    }

    #autoCheckMethodConsistency() {
        const clientClassName = this.constructor.name.replace("Server", "Client");
        let clientInstance;

        try {
            // Dynamically instantiate the corresponding client
            clientInstance = new classMapping[clientClassName]();
        } catch (e) {
            throw new Error(`Failed to instantiate ${clientClassName}: ${e.message}`);
            // TODO Add better loging, make sure we log the registration table
            // In the logging add some hints about what can go wrong here. e.g. 
            // Timing issues, tyring to instantiate before the client is registered
            // Typos in the class name
        }

        if (clientInstance) {
            // Try to get methods from the Proxy's target object (depends on Proxy implementation)
            const clientMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(clientInstance))
                .filter(name => name !== 'constructor' && typeof clientInstance[name] === 'function');

            this.#checkMethodConsistency(clientMethods);
        }
    }


    #checkMethodConsistency(clientMethods) {
        const serverMethods = Object.keys(this.#functionTable);

        const missingOnClient = serverMethods.filter(method => !clientMethods.includes(method));
        const missingOnServer = clientMethods.filter(method => !serverMethods.includes(method));

        if (missingOnClient.length > 0 || missingOnServer.length > 0) {
            throw new Error(`Method mismatch: missing on client [${missingOnClient}], missing on server [${missingOnServer}]`);
        }
    }

    async routeTo(methodName, target, allArgs) {
        // De-structure the allArgs array to separate out the custom args and the system args
        const context = allArgs.pop();
        const sender = allArgs.pop();
        const sendResponse = allArgs.pop();

        // Dynamic instantiation based on the 'target' parameter
        const targetClient = new classMapping[`${target}_Client`]();

        const proxyMethodName = allArgs.shift();
        const proxyTarget = allArgs.shift();

        // Forward the method call to the target client
        const result = await targetClient[proxyMethodName](...allArgs);

        // Send the result back
        sendResponse(result);
        return result;
    }

}

class baseMessagingClient {
    #target;
    #context;

    static TRANSPORT_POST_MESSAGE = 'window.postMessage';
    static TRANSPORT_CHROME_RUNTIME = 'chrome.runtime.sendMessage';
    static TRANSPORT_CHROME_TABS = 'chrome.runtime.tabs';

    static routingConfig = {
        'webpage_to_background': {
            source: 'webpage',
            target: 'background',
            via: 'content'
        }
    }


    static routingConfig = {
        'webpage_to_background': {
            source: 'webpage',
            target: 'background',
            via: 'content',
            transport: baseMessagingClient.TRANSPORT_CHROME_RUNTIME 
        },
        'webpage_to_content': {
            source: 'webpage',
            target: 'content',
            via: null,
            transport: baseMessagingClient.TRANSPORT_POST_MESSAGE 
        },
        'content_to_background': {
            source: 'content',
            target: 'background',
            via: null,
            transport: baseMessagingClient.TRANSPORT_CHROME_RUNTIME 
        },
        'background_to_content': {
            source: 'background',
            target: 'content',
            via: null,
            transport: baseMessagingClient.TRANSPORT_CHROME_TABS
        }
    };


    static register() {
        if (this.name) {
            classMapping[this.name] = this;
        }
    }

    constructor(context = {}) {
        this.context = context;
        if (this.context.source === undefined) {
            this.context.source = this.detectContext();
        }

        this.extensionId = null;  // Initialize the extensionId property
        const target = this.constructor.name.replace(/_Client$/, '').toLowerCase();
        this.target = target;
        this.#init;
    
        // Calculate and set the transport and via class
        const { transport, via } = this.calculateRoutingConfig();
        this.transport = transport;
        this.via = via;

        return new Proxy(this, {
            get: function (target, prop, receiver) {
                if (typeof target[prop] === 'function' && prop !== 'send' && prop !== 'sendWrapper') {
                    return function (...args) {
                        return target.sendWrapper(prop, ...args);
                    };
                }
                // @ts-ignore
                return Reflect.get(...arguments);
            }
        });
    }

    detectContext() {
        try {
            if (typeof chrome !== "undefined") {
                if (chrome.extension && typeof chrome.extension.getBackgroundPage === 'function') {
                    const bgPage = chrome.extension.getBackgroundPage();
                    if (bgPage === window) {
                        return 'background';
                    }
                    if (bgPage !== null) {
                        return 'content';
                    }
                } else if (chrome.runtime && chrome.runtime.id) {
                    // If it's a content script, chrome.runtime.id should be available
                    return 'content';
                }
            }
        } catch (e) {
            console.error("Error detecting context:", e);
            return 'unknown';
        }
        return 'webpage';
    }
    
    

    #init() {
        window.addEventListener('message', (event) => {
            console.log("client window window.addEventListener called");
            console.log("Event data:", event.data);
        });
    }

    calculateRoutingConfig() {
        // Set default to baseMessagingClient.TRANSPORT_CHROME_RUNTIME
        let defaultTransport = baseMessagingClient.TRANSPORT_CHROME_RUNTIME;
        let defaultVia = null; // Default to null for direct communication
        
        if (this.context && !this.context.routingInProgress) {
            const routeKey = this.getRoutingKey();
            if (routeKey && this.constructor.routingConfig) {
                const routeConfig = this.constructor.routingConfig[routeKey];
                if (routeConfig) {
                    return {
                        transport: routeConfig.transport || defaultTransport, // Fallback to default if null
                        via: routeConfig.via
                    };
                }
            }
        }
    
        return {
            transport: defaultTransport,
            via: defaultVia
        };
    }

    getActiveTabId() {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true }, (tabs) => {
                if (tabs.length > 0) {
                    resolve(tabs[0].id);
                } else {
                    reject(new Error("No active tab found."));
                }
            });
        });
    }
    
    
    send(methodName, ...args) {
        let transport = this.transport;
    
        if (this.via !== null) {
            return this.routeVia(this.via, methodName, ...args);
        }
    
        // Assume the message type is direct
        const messageType = methodName;
    
        // The message to be sent
        const message = {
            target: this.target,
            messageType: messageType,
            payload: args,
            context: this.context,
            proxyTarget: args[1]  // Packing of args, consider moving to a more typed approach later
        };
    
        // Promise to handle the message sending
        return new Promise((resolve, reject) => {
            const callback = (response) => {
                if (chrome.runtime.lastError) {
                    return reject(chrome.runtime.lastError);
                }
                resolve(response);
            };
    
            if (this.context.routingInProgress){
                // for now force to window messaging
                transport = baseMessagingClient.TRANSPORT_POST_MESSAGE;
            }
    
            // Use the determined transport method
            if (transport === baseMessagingClient.TRANSPORT_POST_MESSAGE) {
                // think this was testing and can go
                //message.uniqueID = uniqueID;  // Attach unique identifier to message
    
                let targetOrigin = (typeof window !== 'undefined' && window.origin && window.origin !== 'null') ? window.origin : '*';
    
                const eventHandler = (event) => {
                    if (event.data && event.data.response) {
                        window.removeEventListener('message', eventHandler);
                        resolve(event.data.response);
                    }
                };
    
                window.addEventListener('message', eventHandler);
                window.postMessage(message, targetOrigin);
    
            } else if (transport === baseMessagingClient.TRANSPORT_CHROME_RUNTIME) {
                if (this.extensionId) {
                    chrome.runtime.sendMessage(this.extensionId, message, callback);
                } else {
                    chrome.runtime.sendMessage(message, callback);
                }
            }

            else if (transport === baseMessagingClient.TRANSPORT_CHROME_TABS) {
                let tabId = this.context.tabId; // Assuming you've set tabId in your context
                if (typeof tabId === 'undefined') {
                    this.getActiveTabId().then(activeTabId => {
                        chrome.tabs.sendMessage(activeTabId, message, callback);
                    }).catch(error => {
                        return reject(error);
                    });
                } else {
                    chrome.tabs.sendMessage(tabId, message, callback);
                }
            }
        });
    }
    


    getRoutingKey() {
        if (!this.context || !this.context.source || !this.target) {
            console.info("Routing key could not be constructed. Direct messaging will be used.");
            return null;
        }
        return `${this.context.source}_to_${this.target}`;
    }

    routeVia(via, methodName, ...args) {
        // Dynamic instantiation based on the 'via' parameter, pass along the current context
        const viaClient = new classMapping[`${via}_Client`]({
            ...this.context,
            routingInProgress: true  // Indicate that routing is already in progress, here we merge it into the context object
        });

        // Use a special method on the 'via' client to route the message

        return viaClient.routeTo(methodName, this.target, ...args);
    }


    sendWrapper(functionName, ...args) {
        return this.send(functionName, ...args);
    }

    async routeTo(methodName, target, allArgs) {
        // De-structure the allArgs array to separate out the custom args and the system args
        const sendResponse = allArgs.pop();
        const sender = allArgs.pop();
        const context = allArgs.pop();
        const args = allArgs;

        // Dynamic instantiation based on the 'target' parameter, pass along the current context
        const targetClient = new classMapping[`${target}_Client`](context);

        // Forward the method call to the target client
        const result = await targetClient[methodName](...args);

        // Send the result back
        sendResponse(result);
    }
}


class background_Server extends baseMessagingServer { }
class content_Server extends baseMessagingServer { }
class sidebar_Server extends baseMessagingServer { }

// Class registration
background_Server.register();
content_Server.register();
sidebar_Server.register();



// This section manages the complexities of exporting for webpack or using the classes direct 

function conditionalExport(exports) {
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        console.log("conditionalExport: module.exports");
        module.exports = exports;
    } else {
      Object.keys(exports).forEach(key => {
        console.log("conditionalExport: using window attach " + key);
        window[key] = exports[key];
      });
    }
  }
  
  const exports = {
    baseMessagingHandler,
    baseMessagingServer,
    baseMessagingClient,
    background_Server,
    content_Server,
    sidebar_Server,
    classMapping
  };
  
  conditionalExport(exports);
  
// #endregion




