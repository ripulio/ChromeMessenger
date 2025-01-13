// Define the types
export type ObjectReferenceResponse = {
  data: any;
  messageType: "objectReferenceResponse";
  objectId?: string | undefined;
  iteratorId?: string | undefined;
  correlationId: string;
  deserializeData?: boolean;
};
