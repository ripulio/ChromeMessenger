class background_Server extends baseMessagingServer { }
class content_Server extends baseMessagingServer { }
class sidebar_Server extends baseMessagingServer { }

class background_Client extends baseMessagingClient {
    async sayHello() {}
    async callMeBack() {}

    // These blank methods are handled by the proxy
    //async greeting(name, age) { }
    //async getStatus(type) { }

    //async getProjects(domain) { }

    //async executeProject(request) { }
}

class content_Client extends baseMessagingClient {
    //async contentExecuteProject(projectId, anotherParam) { }
    //async runComponent(projectId, anotherParam) { }
    //async greeting(name, age) { }
    //async getStatus(type) { }
    //async foo() { }

    async sayHello() { }
    async echoMessage(message) { }
    async calculateSum(a, b) { }

}

class sidebar_Client extends baseMessagingClient { }

// Register classes
background_Server.register();
background_Client.register();
content_Server.register();
content_Client.register();
sidebar_Server.register();
sidebar_Client.register();

console.log(classMapping);