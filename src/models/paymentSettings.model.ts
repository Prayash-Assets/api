import mongoose, { Document, Model, Schema } from "mongoose";

// Interface for TypeScript
export interface IPaymentSettings extends Document {
  gateway: "stripe" | "paypal" | "razorpay" | "other";
  isLive: boolean;
  publicKey: string;
  secretKey: string;
  testPublicKey?: string;
  testSecretKey?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition
const paymentSettingsSchema = new Schema<IPaymentSettings>(
  {
    gateway: {
      type: String,
      enum: ["stripe", "paypal", "razorpay", "other"],
      default: "stripe",
      required: [true, "Payment gateway is required"],
    },
    isLive: {
      type: Boolean,
      default: false,
    },
    publicKey: {
      type: String,
      required: [
        function (this: IPaymentSettings) {
          return this.isLive === true;
        },
        "Public key is required in live mode",
      ],
    },
    secretKey: {
      type: String,
      required: [true, "Secret key is required"],
      select: false, // Don't return this field by default
    },
    testPublicKey: {
      type: String,
    },
    testSecretKey: {
      type: String,
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "payment_settings",
  }
);

// Create and export the model
const PaymentSettings: Model<IPaymentSettings> =
  mongoose.models.PaymentSettings ||
  mongoose.model<IPaymentSettings>("PaymentSettings", paymentSettingsSchema);

export default PaymentSettings;
