import { Schema, model, Document } from "mongoose";

export interface ICategory extends Document {
  name: string;
  value: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const CategorySchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  value: {
    type: String,
    required: true,
  },
}, {
  timestamps: true, // This will automatically add createdAt and updatedAt fields
});

export default model<ICategory>("Category", CategorySchema);
