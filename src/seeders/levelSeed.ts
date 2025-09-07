import Level from "../models/Level";
import logger from "../config/logger";

const levelsToSeed = [
  { name: "National", value: 1 },
  { name: "International", value: 2 },
];

export async function seedLevels() {
  try {
    logger.info("Seeding levels...");
    for (const levelData of levelsToSeed) {
      const existing = await Level.findOne({ name: levelData.name });
      if (!existing) {
        await Level.create(levelData);
        logger.info(`Level '${levelData.name}' seeded.`);
      } else {
        logger.info(`Level '${levelData.name}' already exists.`);
      }
    }
    logger.info("Level seeding complete.");
  } catch (error: any) {
    logger.error("Error seeding levels:", error);
  }
}
