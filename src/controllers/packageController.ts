import { FastifyRequest, FastifyReply } from "fastify";
import Joi from "joi";
import Package, { IPackage } from "../models/Package";
import logger from "../config/logger";

// Validation schema for package
const packageSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().optional().allow(""),
  mockTests: Joi.array()
    .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
    .min(1)
    .required(),
  files: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().min(1).required(),
        url: Joi.string().uri().required(),
      })
    )
    .optional()
    .default([]),
  links: Joi.array().items(Joi.string().uri()).optional().default([]),
  duration: Joi.number().integer().min(1).max(365).required(),
  price: Joi.number().min(0).max(99999.99).required(),
  discountPercentage: Joi.number().min(0).max(100).optional().allow(null),
  published: Joi.boolean().optional().default(false),
  publicView: Joi.boolean().optional().default(true),
  draft: Joi.boolean().optional().default(true),
});

const updatePackageSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().optional().allow(""),
  mockTests: Joi.array()
    .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
    .min(1)
    .optional(),
  files: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().min(1).required(),
        url: Joi.string().uri().required(),
      })
    )
    .optional(),
  links: Joi.array().items(Joi.string().uri()).optional(),
  duration: Joi.number().integer().min(1).max(365).optional(),
  price: Joi.number().min(0).max(99999.99).optional(),
  discountPercentage: Joi.number().min(0).max(100).optional().allow(null),
  published: Joi.boolean().optional(),
  publicView: Joi.boolean().optional(),
  draft: Joi.boolean().optional(),
});

// Create a new package
export const createPackage = async (
  req: FastifyRequest<{ Body: IPackage }>,
  res: FastifyReply
) => {
  try {
    logger.info("Attempting to create a new package");
    // Validate request body
    const { error, value } = packageSchema.validate(req.body);
    if (error) {
      logger.error("Validation error creating package", {
        error: error.details,
      });
      return res.status(400).send({
        message: "Validation Error",
        details: error.details,
      });
    }

    // Check if package with same name already exists
    const existingPackage = await Package.findOne({ name: value.name });
    if (existingPackage) {
      logger.warn("Package with this name already exists", {
        name: value.name,
      });
      return res.status(409).send({
        message: "Package with this name already exists",
      });
    }

    // Create new package
    console.log(value);
    const newPackage: IPackage = new Package(value);
    await newPackage.save();

    // Populate mock tests for response
    await newPackage.populate({
      path: "mockTests",
      select: "title description duration totalMarks status",
    });

    logger.info("Package created successfully", { id: newPackage._id });
    res.status(201).send(newPackage);
  } catch (error: any) {
    logger.error("Error creating package", { error });
    res.status(500).send({
      message: "Error creating package",
      error: error.message,
    });
  }
};

// Get all packages
export const getAllPackages = async (
  req: FastifyRequest,
  res: FastifyReply
) => {
  try {
    logger.info("Attempting to fetch all packages");

    const packages = await Package.find()
      .populate({
        path: "mockTests",
        select: "title description duration totalMarks status",
      })
      .sort({ createdAt: -1 });

    logger.info("Successfully fetched all packages", {
      count: packages.length,
    });
    res.status(200).send(packages);
  } catch (error: any) {
    logger.error("Error fetching packages", { error });
    res.status(500).send({
      message: "Error fetching packages",
      error: error.message,
    });
  }
};

// Get a single package by ID
export const getPackageById = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  res: FastifyReply
) => {
  try {
    const packageId = req.params.id;
    logger.info(`Attempting to fetch package with ID: ${packageId}`);

    const pkg = await Package.findById(packageId).populate({
      path: "mockTests",
      select: "title description duration totalMarks status questions",
      populate: {
        path: "questions",
        select: "text difficulty",
      },
    });

    if (!pkg) {
      logger.warn("Package not found", { id: packageId });
      return res.status(404).send({ message: "Package not found" });
    }

    logger.info("Successfully fetched package", { id: packageId });
    res.status(200).send(pkg);
  } catch (error: any) {
    logger.error("Error fetching package", { id: req.params.id, error });
    res.status(500).send({
      message: "Error fetching package",
      error: error.message,
    });
  }
};

// Update a package
export const updatePackage = async (
  req: FastifyRequest<{ Params: { id: string }; Body: Partial<IPackage> }>,
  res: FastifyReply
) => {
  try {
    const packageId = req.params.id;
    logger.info(`Attempting to update package with ID: ${packageId}`);

    // Validate request body
    const { error, value } = updatePackageSchema.validate(req.body);
    if (error) {
      logger.error("Validation error updating package", {
        error: error.details,
      });
      return res.status(400).send({
        message: "Validation Error",
        details: error.details,
      });
    }

    // Check for name uniqueness if name is being updated
    if (value.name) {
      const existingPackage = await Package.findOne({
        name: value.name,
        _id: { $ne: packageId }, // Exclude current package
      });
      if (existingPackage) {
        logger.warn("Package with this name already exists", {
          name: value.name,
        });
        return res.status(409).send({
          message: "Package with this name already exists",
        });
      }
    }

    const updatedPackage = await Package.findByIdAndUpdate(packageId, value, {
      new: true,
      runValidators: true,
    }).populate({
      path: "mockTests",
      select: "title description duration totalMarks status",
    });

    if (!updatedPackage) {
      logger.warn("Package not found for update", { id: packageId });
      return res.status(404).send({ message: "Package not found" });
    }

    logger.info("Package updated successfully", { id: packageId });
    res.status(200).send(updatedPackage);
  } catch (error: any) {
    logger.error("Error updating package", { id: req.params.id, error });
    res.status(500).send({
      message: "Error updating package",
      error: error.message,
    });
  }
};

// Delete a package
export const deletePackage = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  res: FastifyReply
) => {
  try {
    const packageId = req.params.id;
    logger.info(`Attempting to delete package with ID: ${packageId}`);

    const deletedPackage = await Package.findByIdAndDelete(packageId);
    if (!deletedPackage) {
      logger.warn("Package not found for deletion", { id: packageId });
      return res.status(404).send({ message: "Package not found" });
    }

    logger.info("Package deleted successfully", { id: packageId });
    res.status(200).send({
      message: "Package deleted successfully",
      deletedPackage: {
        _id: deletedPackage._id,
        name: deletedPackage.name,
      },
    });
  } catch (error: any) {
    logger.error("Error deleting package", { id: req.params.id, error });
    res.status(500).send({
      message: "Error deleting package",
      error: error.message,
    });
  }
};

// Get packages available for purchase (for students)
export const getAvailablePackages = async (
  req: FastifyRequest,
  res: FastifyReply
) => {
  try {
    logger.info("Attempting to fetch available packages for purchase");

    const packages = await Package.find({
      published: true, // Only fetch published packages
      draft: { $ne: true }, // Exclude draft packages
      publicView: true, // Only fetch public packages
    })
      .populate({
        path: "mockTests",
        select: "title description duration totalMarks status",
      })
      .select(
        "name description price originalPrice discountPercentage duration files links createdAt published mockTests"
      )
      .sort({ createdAt: -1 });

    logger.info("Successfully fetched available packages", {
      count: packages.length,
    });
    res.status(200).send(packages);
  } catch (error: any) {
    logger.error("Error fetching available packages", { error });
    res.status(500).send({
      message: "Error fetching available packages",
      error: error.message,
    });
  }
};
