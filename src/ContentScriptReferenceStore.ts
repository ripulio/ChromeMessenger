const nullTarget = () => {
  value: null;
};

const objectStore = new Map<string, (globalContext: any) => any>();
let nextObjectId = 1;

export function storeFunctionReference(contextObjectId: string, prop: string) {
  const objectId = `func_${nextObjectId++}`;
  objectStore.set(objectId, (globalContext) => {
    if (contextObjectId === "global") {
      return globalContext[prop].bind(globalContext);
    } else {
      const objectReference = getObjectReference(globalContext, contextObjectId);
      return objectReference[prop].bind(objectReference);
    }
  });
  return objectId;
}

export function storeStaticFunctionReference(func: Function){
  const objectId = `static_${nextObjectId++}`;
  objectStore.set(objectId, () => func);
  return objectId;
}

export function storeStaticObjectReference(object: any){
  const objectId = `static_${nextObjectId++}`;
  objectStore.set(objectId, () => object);
  return objectId;
}

export function storeObjectReference(contextObjectId: string, prop: PropertyKey) {
  const objectId = `obj_${nextObjectId++}`;
  objectStore.set(objectId, (globalContext) => 
    {
      if (contextObjectId === "global") {
        return globalContext[prop];
      } else {
        return getObjectReference(globalContext, contextObjectId)[prop];
      }
    });
  return objectId;
}

export function getObjectReference(globalContext: any, objectId: string) {
  return objectStore.get(objectId)?.(globalContext);
}

export function getFunctionReference(globalContext: any, functionId: string) {
  const returnValue = objectStore.get(functionId)?.(globalContext);
  if (typeof returnValue !== "function") {
    throw new Error(`Function reference is not a function: ${functionId}`);
  }
  return returnValue;
}
