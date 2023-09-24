// Import base classes from baseMessengers.js
import { 
    baseMessagingHandler,
    baseMessagingServer,
    baseMessagingClient,
    classMapping
} from './baseMessengers';

// Import derived classes from extensionMessengers.js
import { 
    background_Server, 
    content_Server, 
    sidebar_Server, 
    background_Client, 
    content_Client, 
    sidebar_Client 
} from './extensionMessengers';

// Re-export base and derived classes
export {
    // Base classes
    baseMessagingHandler,
    baseMessagingServer,
    baseMessagingClient,
    classMapping,

    // Derived classes
    background_Server,
    content_Server,
    sidebar_Server,
    background_Client,
    content_Client,
    sidebar_Client
};
