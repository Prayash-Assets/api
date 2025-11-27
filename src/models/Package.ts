import mongoose, { Schema, Document, Types } from "mongoose";
import { IUser } from "./User";
import { IMockTest } from "./MockTest";

export interface IPackageFile {
  name: string;
  url: string; // or a more complex type if storing file metadata
}

export interface IPackage extends Document {
  name: string;
  description?: string;
  mockTests: Types.ObjectId[] | IMockTest[];
  files: IPackageFile[];
  links: string[];
  duration: number; // Duration in days, for example
  price: number;
  originalPrice?: number; // Price before discount
  discountPercentage?: number; // Discount percentage (0-100)
  published?: boolean;
  publicView: boolean;
  draft?: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Virtual field for calculated discounted price
  discountedPrice?: number;
  // Method to check if package has discount
  hasDiscount?: boolean;
  // Methods defined in schema
  getDisplayPrice(): number;
  getOriginalPrice(): number;
}

const packageSchema: Schema<IPackage> = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    mockTests: [
      {
        type: Schema.Types.ObjectId,
        ref: "MockTest",
      },
    ],
    files: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    links: [
      {
        type: String,
        trim: true,
      },
    ],
    duration: {
      // Assuming duration in days
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    originalPrice: {
      type: Number,
      default: undefined, // Changed from null to undefined
    },
    discountPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    published: {
      type: Boolean,
      default: false,
    },
    draft: {
      type: Boolean,
      default: false,
    },
    publicView: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Virtual field to calculate discounted price
packageSchema.virtual("discountedPrice").get(function () {
  // The price field already contains the discounted price due to pre-save middleware
  return this.price;
});

// Virtual field to check if package has discount
packageSchema.virtual("hasDiscount").get(function () {
  return this.discountPercentage && this.discountPercentage > 0;
});

// Method to get display price (returns current price, which is already discounted if applicable)
packageSchema.methods.getDisplayPrice = function () {
  // The price field already contains the discounted price due to pre-save middleware
  return this.price;
};

// Method to get original price for display
packageSchema.methods.getOriginalPrice = function () {
  return this.originalPrice || this.price;
};

// Pre-save middleware to handle price calculations
packageSchema.pre("save", function (next) {
  // Check if this is a new document or if price/discount fields have changed
  const isNew = this.isNew;
  const priceChanged = this.isModified("price");
  const discountChanged = this.isModified("discountPercentage");

  // If neither price nor discount changed, skip recalculation
  if (!isNew && !priceChanged && !discountChanged) {
    return next();
  }

  // Case 1: Discount is being applied or increased
  if (
    this.discountPercentage &&
    this.discountPercentage > 0
  ) {
    // If this is a new document or price was just changed, treat incoming price as original
    if (isNew || priceChanged) {
      // Store the incoming price as original price
      this.originalPrice = this.price;
      // Calculate discounted price
      this.price = this.originalPrice * (1 - this.discountPercentage / 100);
    }
    // If only discount changed but price stayed the same, recalculate from originalPrice
    else if (discountChanged && this.originalPrice) {
      this.price = this.originalPrice * (1 - this.discountPercentage / 100);
    }
  }
  // Case 2: Discount is being removed
  else if (!this.discountPercentage || this.discountPercentage === 0) {
    if (this.originalPrice) {
      // Restore price from originalPrice
      this.price = this.originalPrice;
      this.originalPrice = undefined;
    }
  }

  next();
});

// Ensure virtual fields are serialized
packageSchema.set("toJSON", { virtuals: true });
packageSchema.set("toObject", { virtuals: true });

export default mongoose.model<IPackage>("Package", packageSchema);
