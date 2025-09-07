import { Schema, model, Document } from "mongoose";

export interface ISubject extends Document {
  name: string;
  value: string;
}

const SubjectSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: String,
    required: true,
  },
});

export default model<ISubject>("Subject", SubjectSchema);
