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
  // Discount protection fields (for group/org discounts on top of package discount)
  minFloorPrice?: number;              // Absolute minimum price package can sell for
  maxAdditionalDiscount?: number;      // Max % discount on top of package discount (0-100)
  eligibilityDiscountEnabled: boolean; // Allow group/org discounts on this package
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
    // Discount protection fields (for group/org discounts on top of package discount)
    minFloorPrice: {
      type: Number,
      default: null,
      min: 0,
    },
    maxAdditionalDiscount: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    eligibilityDiscountEnabled: {
      type: Boolean,
      default: true, // Enable group/org discounts by default
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
  const isNew = this.isNew;
  const priceChanged = this.isModified("price");
  const discountChanged = this.isModified("discountPercentage");
  const originalPriceChanged = this.isModified("originalPrice");

  // If nothing relevant changed, skip
  if (!isNew && !priceChanged && !discountChanged && !originalPriceChanged) {
    return next();
  }

  console.log("Pre-save middleware - Before processing:", {
    isNew,
    priceChanged,
    discountChanged,
    originalPriceChanged,
    price: this.price,
    originalPrice: this.originalPrice,
    discountPercentage: this.discountPercentage,
  });

  // Case 1: Discount exists (being applied or modified)
  if (this.discountPercentage && this.discountPercentage > 0) {
    const discount = this.discountPercentage as number;

    if (isNew) {
      // New document: treat price as original, calculate discounted
      this.originalPrice = this.price;
      this.price = this.originalPrice * (1 - discount / 100);
    } else if (originalPriceChanged && this.originalPrice) {
      // Original price explicitly set: use it to calculate discounted price
      this.price = this.originalPrice * (1 - discount / 100);
    } else if (priceChanged && !originalPriceChanged && !this.originalPrice) {
      // Price changed but no original price set: treat price as original
      this.originalPrice = this.price;
      this.price = this.originalPrice * (1 - discount / 100);
    } else if (discountChanged && this.originalPrice) {
      // Only discount changed: recalculate from existing original price
      this.price = this.originalPrice * (1 - discount / 100);
    } else if (
      discountChanged &&
      !this.originalPrice &&
      this.price
    ) {
      // Discount changed but no original price: treat current price as original
      this.originalPrice = this.price;
      this.price = this.originalPrice * (1 - discount / 100);
    } else if (this.originalPrice && this.originalPrice === this.price) {
      // Bug fix: originalPrice and price are same - fix it
      this.price = this.originalPrice * (1 - discount / 100);
    }
  }
  // Case 2: No discount (being removed or not set)
  else {
    if (this.originalPrice) {
      // Clear discount: restore original price and remove originalPrice field
      this.price = this.originalPrice;
      this.originalPrice = undefined;
    }
  }

  console.log("Pre-save middleware - After processing:", {
    price: this.price,
    originalPrice: this.originalPrice,
    discountPercentage: this.discountPercentage,
  });

  next();
});

// Ensure virtual fields are serialized
packageSchema.set("toJSON", { virtuals: true });
packageSchema.set("toObject", { virtuals: true });

export default mongoose.model<IPackage>("Package", packageSchema);
