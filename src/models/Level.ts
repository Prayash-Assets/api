import { Schema, model, Document } from "mongoose";

export interface ILevel extends Document {
  name: string;
  value: string;
}

const LevelSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ["National", "International"],
  },
  value: {
    type: String,
    required: true,
  },
});

export default model<ILevel>("Level", LevelSchema);
