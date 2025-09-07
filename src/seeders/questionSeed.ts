import { Question } from "../models/Question";
import Category from "../models/Category";
import Subject from "../models/Subject";
import Level from "../models/Level";
import logger from "../config/logger";

const questionsToSeed = [
  {
    text: "What is the speed of light?",
    category: "Science",
    subject: "Physics",
    difficulty: "Easy",
    answer: "299,792,458 m/s",
  },
  {
    text: "Who discovered penicillin?",
    category: "Science",
    subject: "Biology",
    difficulty: "Medium",
    answer: "Alexander Fleming",
  },
  {
    text: "What is the formula for water?",
    category: "Science",
    subject: "Chemistry",
    difficulty: "Easy",
    answer: "H2O",
  },
  {
    text: "In which year did World War II end?",
    category: "History",
    subject: "World War II",
    difficulty: "Medium",
    answer: "1945",
  },
  {
    text: "Solve for x: 2x + 3 = 7.",
    category: "Mathematics",
    subject: "Algebra",
    difficulty: "Easy",
    answer: "x = 2",
  },
];

export async function seedQuestions() {
  try {
    logger.info("Seeding questions...");
    for (const q of questionsToSeed) {
      const category = await Category.findOne({ name: q.category });
      const subject = await Subject.findOne({ name: q.subject });
      // Always use "National" level for demo; change as needed
      const level = await Level.findOne({ name: "National" });
      if (!category || !subject || !level) {
        logger.warn(
          `Missing reference for question: ${
            q.text
          }. Category: ${!!category}, Subject: ${!!subject}, Level: ${!!level}`
        );
        continue;
      }
      const existing = await Question.findOne({ text: q.text });
      if (!existing) {
        await Question.create({
          text: q.text,
          options: [{ optionText: q.answer, isCorrect: true }],
          correct_answer: q.answer,
          difficulty: q.difficulty, // "Easy", "Medium", "Hard"
          category_id: category._id,
          subject_id: subject._id,
          level_id: level._id, // "National" or "International"
        });
        logger.info(`Question '${q.text}' seeded.`);
      } else {
        logger.info(`Question '${q.text}' already exists.`);
      }
    }
    logger.info("Question seeding complete.");
  } catch (error: any) {
    logger.error("Error seeding questions:", error);
  }
}
