import Category from "../models/Category";
import logger from "../config/logger";

const categoriesToSeed = [
  { name: "Science", value: "science" },
  { name: "Mathematics", value: "mathematics" },
  { name: "History", value: "history" },
  { name: "General Knowledge", value: "general_knowledge" },
];

export async function seedCategories() {
  try {
    logger.info("Seeding categories...");
    for (const categoryData of categoriesToSeed) {
      const existing = await Category.findOne({ name: categoryData.name });
      if (!existing) {
        await Category.create(categoryData);
        logger.info(`Category '${categoryData.name}' seeded.`);
      } else {
        logger.info(`Category '${categoryData.name}' already exists.`);
      }
    }
    logger.info("Category seeding complete.");
  } catch (error: any) {
    logger.error("Error seeding categories:", error);
  }
}
