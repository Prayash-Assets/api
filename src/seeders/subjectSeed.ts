import Subject from "../models/Subject";
import logger from "../config/logger";

const subjectsToSeed = [
  { name: "Physics", value: "physics" },
  { name: "Chemistry", value: "chemistry" },
  { name: "Biology", value: "biology" },
  { name: "Algebra", value: "algebra" },
  { name: "World War II", value: "world_war_ii" },
];

export async function seedSubjects() {
  try {
    logger.info("Seeding subjects...");
    for (const subjectData of subjectsToSeed) {
      const existing = await Subject.findOne({ name: subjectData.name });
      if (!existing) {
        await Subject.create(subjectData);
        logger.info(`Subject '${subjectData.name}' seeded.`);
      } else {
        logger.info(`Subject '${subjectData.name}' already exists.`);
      }
    }
    logger.info("Subject seeding complete.");
  } catch (error: any) {
    logger.error("Error seeding subjects:", error);
  }
}
