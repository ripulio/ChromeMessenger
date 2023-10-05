/*
import {
    background_Server,
    baseMessagingClient,
    content_Server,
    sidebar_Server,
} from 'chromemessenger';
*/


// Conditional Imports for base classes
/*
let baseMessagingClient;
if (typeof require !== 'undefined') {
  const module = require('./baseMessengers');
  baseMessagingClient = module.baseMessagingClient;
} else {
  baseMessagingClient = window.baseMessagingClient;
}
*/

// Define your client classes
class content_Client extends baseMessagingClient {
  // We don't implement the methods in the derived class
  async echoMessage(message) { }
  async sayHello() { }
  async calculateSum(a, b) { }
}

// Register it
content_Client.register();

// Define proxy methods for the background page
class background_Client extends baseMessagingClient {
  async callMeBack() { }
  async sayHello() { }
}

// Register the background page
background_Client.register();

// Conditional Exports
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    content_Client,
    background_Client
  };
} else {
  window.content_Client = content_Client;
  window.background_Client = background_Client;
}
