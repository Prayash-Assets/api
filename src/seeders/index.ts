import mongoose from "mongoose";
import logger from "../config/logger";
import { seedCategories } from "./categorySeed";
import { seedSubjects } from "./subjectSeed";
import { seedLevels } from "./levelSeed";
import { seedRoles } from "./roleSeed";
import { seedAdminUser } from "./adminUserSeed";
import { seedQuestions } from "./questionSeed";
import { seedPackages } from "./packageSeed";
import { seedPurchases } from "./purchaseSeed";
import dotenv from "dotenv";
dotenv.config();

async function seedAll() {
  try {
    console.log("Starting data seeding process...");
    console.log(`${process.env.MONGODB_URI}`);
    await mongoose.connect(`${process.env.MONGODB_URI}`);
    logger.info("Connected to MongoDB");
    await seedCategories();
    await seedSubjects();
    await seedLevels();
    await seedRoles();
    await seedAdminUser();
    await seedQuestions();
    await seedPackages(); // Add package seeding before purchases
    await seedPurchases();
    logger.info("Data seeding process completed.");
    await mongoose.disconnect();
  } catch (error: any) {
    logger.error("Error during seeding process:", error);
    process.exit(1);
  }
}

seedAll();
