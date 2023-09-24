import { baseMessagingServer } from './baseMessengers'; 
import { baseMessagingClient } from './baseMessengers'; 
import { classMapping } from './baseMessengers';


export class background_Server extends baseMessagingServer { }
export class content_Server extends baseMessagingServer { }
export class sidebar_Server extends baseMessagingServer { }

export class background_Client extends baseMessagingClient {
    async sayHello() {}
    async callMeBack() {}

    // These blank methods are handled by the proxy
    //async greeting(name, age) { }
    //async getStatus(type) { }

    //async getProjects(domain) { }

    //async executeProject(request) { }
}

export class content_Client extends baseMessagingClient {
    //async contentExecuteProject(projectId, anotherParam) { }
    //async runComponent(projectId, anotherParam) { }
    //async greeting(name, age) { }
    //async getStatus(type) { }
    //async foo() { }

    async sayHello() { }
    async echoMessage(message) { }
    async calculateSum(a, b) { }

}

export class sidebar_Client extends baseMessagingClient { }

// Register classes
background_Server.register();
background_Client.register();
content_Server.register();
content_Client.register();
sidebar_Server.register();
sidebar_Client.register();

console.log(classMapping);