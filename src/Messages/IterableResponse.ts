import { ObjectReferenceResponse } from "./ObjectReferenceResponse";

export type IterableResponse = ObjectReferenceResponse & {
  iteratorId?: string | undefined;
};
