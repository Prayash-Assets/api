import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

// Create Excel template for question upload
export const createQuestionTemplate = () => {
  const templateData = [
    {
      text: "What is the capital of France?",
      option1: "London",
      option2: "Berlin",
      option3: "Paris",
      option4: "Madrid",
      correct_option: 3,
      difficulty: "Easy",
      category_name: "Geography",
      subject_name: "World Geography",
      level_name: "Beginner",
      explanation: "Paris is the capital and largest city of France.",
    },
    {
      text: "Which programming language is known for 'Write Once, Run Anywhere'?",
      option1: "Java",
      option2: "Python",
      option3: "C++",
      option4: "",
      correct_option: 1,
      difficulty: "Medium",
      category_name: "Technology",
      subject_name: "Programming",
      level_name: "Intermediate",
      explanation: "Java's bytecode can run on any platform with a JVM.",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(templateData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");

  // Set column widths
  const columnWidths = [
    { wch: 50 }, // text
    { wch: 20 }, // option1
    { wch: 20 }, // option2
    { wch: 20 }, // option3
    { wch: 20 }, // option4
    { wch: 15 }, // correct_option
    { wch: 12 }, // difficulty
    { wch: 20 }, // category_name
    { wch: 20 }, // subject_name
    { wch: 15 }, // level_name
    { wch: 40 }, // explanation
  ];
  worksheet["!cols"] = columnWidths;

  const templatePath = path.join(
    __dirname,
    "../../templates/question_upload_template.xlsx"
  );

  // Ensure templates directory exists
  const templateDir = path.dirname(templatePath);
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true });
  }

  XLSX.writeFile(workbook, templatePath);
  return templatePath;
};

// Generate template on module load
try {
  createQuestionTemplate();
  console.log("Question upload template created successfully");
} catch (error) {
  console.error("Error creating question template:", error);
}
