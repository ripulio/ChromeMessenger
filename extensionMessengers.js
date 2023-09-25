import { baseMessagingServer } from './baseMessengers'; 
import { baseMessagingClient } from './baseMessengers'; 
import { classMapping } from './baseMessengers';


export class background_Server extends baseMessagingServer { }
export class content_Server extends baseMessagingServer { }
export class sidebar_Server extends baseMessagingServer { }





// implement the proxy client classes, with your required methods in your code. 
// there is no implementation of the methods in the clients, they are just proxies
// to the server methods.  However the server method table passed into the constructor
// must have the methods implemented.  The proxy client will call the server method
// if the method tables do not align, an error will be thrown.

/*

 class background_Client extends baseMessagingClient {
    async sayHello() {}
    async callMeBack() {}
}

 class content_Client extends baseMessagingClient {
    async sayHello() { }
    async echoMessage(message) { }
    async calculateSum(a, b) { }

}

class sidebar_Client extends baseMessagingClient { }

*/


// Register classes
background_Server.register();
content_Server.register();
sidebar_Server.register();


// you will also need to register your classes in your code
//content_Client.register();
//sidebar_Client.register();
//background_Client.register();

console.log(classMapping);