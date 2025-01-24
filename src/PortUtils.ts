export async function waitForPortResponse(port: MessagePort, correlationId: string) : Promise<any>{
    return new Promise((resolve, reject) => {
        const listener = (ev: MessageEvent<any>) => {
            if (ev.data.correlationId === correlationId){
                resolve(ev.data);
                port.removeEventListener('message', listener);
            }
        };
        port.addEventListener('message', listener);
    })
}