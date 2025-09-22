import { FastifyRequest, FastifyReply } from "fastify";
import { MultipartFile } from "@fastify/multipart";
import Joi from "joi";
import * as XLSX from "xlsx";
import { parse } from "csv-parse";
import { Question, IQuestion, DifficultyLevel } from "../models/Question";
import Category from "../models/Category";
import Subject from "../models/Subject";
import Level from "../models/Level";
import path from "path";
import fs from "fs";

// Define difficulty levels from the enum
const difficultyLevels = Object.values(DifficultyLevel);

// Define interface for file upload - remove the incorrect interface
// We'll use FastifyRequest directly with the file() method from @fastify/multipart

// Define Joi schema for IQuestion
// This schema should align with your IQuestion interface in ../models/Question
const questionSchema = Joi.object({
  text: Joi.string().required(),
  options: Joi.array()
    .items(
      Joi.object({
        optionText: Joi.string().required(),
        isCorrect: Joi.boolean().required(),
      })
    )
    .min(1) // Assuming at least one option is required
    .required(),
  correct_answer: Joi.string().optional().allow(""), // Optional string, can be derived
  difficulty: Joi.string()
    .valid(...difficultyLevels)
    .required(),
  category_id: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required(), // Assuming ObjectId string
  subject_id: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required(), // Assuming ObjectId string
  level_id: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required(), // Assuming ObjectId string
  explanation: Joi.string().allow("").optional(),
});

// Excel upload schema for validation
const excelQuestionSchema = Joi.object({
  text: Joi.string().required(),
  option1: Joi.string().required(),
  option2: Joi.string().required(),
  option3: Joi.string().optional().allow(""),
  option4: Joi.string().optional().allow(""),
  correct_option: Joi.number().min(1).max(4).required(),
  difficulty: Joi.string()
    .valid(...difficultyLevels)
    .required(),
  category_name: Joi.string().required(),
  subject_name: Joi.string().required(),
  level_name: Joi.string().required(),
  explanation: Joi.string().optional().allow(""),
});

// CSV upload schema for validation (same as Excel for now)
const csvQuestionSchema = Joi.object({
  text: Joi.string().required(),
  option1: Joi.string().required(),
  option2: Joi.string().required(),
  option3: Joi.string().optional().allow(""),
  option4: Joi.string().optional().allow(""),
  correct_option: Joi.alternatives()
    .try(
      Joi.number().min(1).max(4),
      Joi.string()
        .pattern(/^[1-4]$/)
        .custom((value, helpers) => {
          return parseInt(value, 10);
        })
    )
    .required(),
  difficulty: Joi.string()
    .valid(...difficultyLevels)
    .required(),
  category_name: Joi.string().required(),
  subject_name: Joi.string().required(),
  level_name: Joi.string().required(),
  explanation: Joi.string().optional().allow(""),
});

// Define error type for better typing
interface ProcessingError {
  row: number;
  message: string;
}

export const createQuestion = async (
  request: FastifyRequest<{ Body: IQuestion }>,
  reply: FastifyReply
) => {
  try {
    // Validate request body
    const { error, value } = questionSchema.validate(request.body);

    if (error) {
      return reply
        .status(400)
        .send({ message: "Validation Error", details: error.details });
    }

    // Check if question with the same text already exists
    const existingQuestion = await Question.findOne({
      text: value.text,
    });
    if (existingQuestion) {
      return reply
        .status(409)
        .send({ message: "Question with this text already exists" });
    }

    const question = new Question(value); // Use validated value
    await question.save();
    reply.status(201).send(question);
  } catch (error) {
    reply.status(500).send({ message: "Error creating question", error });
  }
};

export const getAllQuestions = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const page = parseInt((request.query as any)?.page || '1');
    const limit = parseInt((request.query as any)?.limit || '50');
    const search = (request.query as any)?.search;
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = {};
    if (search) {
      searchQuery = {
        text: { $regex: search, $options: 'i' }
      };
    }

    const [questions, totalQuestions] = await Promise.all([
      Question.find(searchQuery)
        .populate("category_id")
        .populate("subject_id")
        .populate("level_id")
        .skip(skip)
        .limit(limit),
      Question.countDocuments(searchQuery)
    ]);

    const totalPages = Math.ceil(totalQuestions / limit);

    reply.send({
      questions,
      pagination: {
        currentPage: page,
        totalPages,
        totalQuestions,
        questionsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    reply.status(500).send({ message: "Error fetching questions", error });
  }
};

export const getQuestionById = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const question = await Question.findById(request.params.id).populate(
      "category_id subject_id level_id"
    );
    if (!question) {
      return reply.status(404).send({ message: "Question not found" });
    }
    reply.send(question);
  } catch (error) {
    reply.status(500).send({ message: "Error fetching question", error });
  }
};

export const updateQuestion = async (
  request: FastifyRequest<{ Params: { id: string }; Body: Partial<IQuestion> }>,
  reply: FastifyReply
) => {
  try {
    const question = await Question.findByIdAndUpdate(
      request.params.id,
      request.body,
      { new: true }
    ).populate("category_id subject_id level_id");
    if (!question) {
      return reply.status(404).send({ message: "Question not found" });
    }
    reply.send(question);
  } catch (error) {
    reply.status(500).send({ message: "Error updating question", error });
  }
};

export const deleteQuestion = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const question = await Question.findByIdAndDelete({
      _id: request.params.id,
    });
    if (!question) {
      return reply.status(404).send({ message: "Question not found" });
    }
    reply.send({ message: "Question deleted successfully" });
  } catch (error) {
    reply.status(500).send({ message: "Error deleting question", error });
  }
};

export const uploadQuestionsFromExcel = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Get the uploaded file from multipart data
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({
        message: "No file uploaded. Please upload an Excel file.",
      });
    }

    // Validate file type
    const allowedMimeTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (!allowedMimeTypes.includes(data.mimetype)) {
      return reply.status(400).send({
        message:
          "Invalid file type. Please upload an Excel file (.xlsx or .xls).",
      });
    }

    // Read the Excel file
    const buffer = await data.toBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (!jsonData || jsonData.length === 0) {
      return reply.status(400).send({
        message: "Excel file is empty or has no valid data.",
      });
    }

    const validQuestions = [];
    const errors: ProcessingError[] = [];
    const processedQuestions = [];

    // Process each row
    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i] as any;
      const rowNumber = i + 2; // Excel rows start from 2 (after header)

      try {
        // Validate row data
        const { error, value } = excelQuestionSchema.validate(row);
        if (error) {
          errors.push({
            row: rowNumber,
            message: error.details.map((d) => d.message).join(", "),
          });
          continue;
        }

        // Find related entities by name
        const category = await Category.findOne({ name: value.category_name });
        const subject = await Subject.findOne({ name: value.subject_name });
        const level = await Level.findOne({ name: value.level_name });

        if (!category) {
          errors.push({
            row: rowNumber,
            message: `Category '${value.category_name}' not found`,
          });
          continue;
        }

        if (!subject) {
          errors.push({
            row: rowNumber,
            message: `Subject '${value.subject_name}' not found`,
          });
          continue;
        }

        if (!level) {
          errors.push({
            row: rowNumber,
            message: `Level '${value.level_name}' not found`,
          });
          continue;
        }

        // Check for duplicate questions
        const existingQuestion = await Question.findOne({ text: value.text });
        if (existingQuestion) {
          errors.push({
            row: rowNumber,
            message: `Question with text '${value.text}' already exists`,
          });
          continue;
        }

        // Build options array
        const options = [
          { optionText: value.option1, isCorrect: value.correct_option === 1 },
          { optionText: value.option2, isCorrect: value.correct_option === 2 },
        ];

        if (value.option3) {
          options.push({
            optionText: value.option3,
            isCorrect: value.correct_option === 3,
          });
        }

        if (value.option4) {
          options.push({
            optionText: value.option4,
            isCorrect: value.correct_option === 4,
          });
        }

        // Ensure at least one correct answer exists
        const hasCorrectAnswer = options.some((opt) => opt.isCorrect);
        if (!hasCorrectAnswer) {
          errors.push({
            row: rowNumber,
            message: "No correct option specified",
          });
          continue;
        }

        const questionData = {
          text: value.text,
          options,
          difficulty: value.difficulty,
          category_id: category._id,
          subject_id: subject._id,
          level_id: level._id,
          explanation: value.explanation || "",
        };

        validQuestions.push(questionData);
        processedQuestions.push({
          row: rowNumber,
          text: value.text.substring(0, 50) + "...",
        });
      } catch (rowError) {
        errors.push({
          row: rowNumber,
          message: `Processing error: ${
            rowError instanceof Error ? rowError.message : "Unknown error"
          }`,
        });
      }
    }

    // If there are validation errors, return them
    if (errors.length > 0 && validQuestions.length === 0) {
      return reply.status(400).send({
        message: "Excel validation failed",
        totalRows: jsonData.length,
        validQuestions: 0,
        errors,
      });
    }

    // Insert valid questions
    let insertedCount = 0;
    const insertErrors: ProcessingError[] = [];

    if (validQuestions.length > 0) {
      try {
        const result = await Question.insertMany(validQuestions, {
          ordered: false,
        });
        insertedCount = result.length;
      } catch (insertError: any) {
        // Handle bulk insert errors
        if (insertError.writeErrors) {
          insertError.writeErrors.forEach((err: any) => {
            insertErrors.push({
              row: err.index + 1,
              message: err.errmsg,
            });
          });
          insertedCount = insertError.result.nInserted || 0;
        } else {
          return reply.status(500).send({
            message: "Database error during bulk insert",
            error: insertError.message,
          });
        }
      }
    }

    // Return summary
    const response = {
      message: "Excel upload processed",
      summary: {
        totalRows: jsonData.length,
        validQuestions: validQuestions.length,
        insertedQuestions: insertedCount,
        failedValidation: errors.length,
        failedInsertion: insertErrors.length,
      },
      processedQuestions: processedQuestions.slice(0, 10), // Show first 10 for preview
      validationErrors: errors.length > 0 ? errors.slice(0, 10) : [], // Show first 10 errors
      insertionErrors: insertErrors.length > 0 ? insertErrors.slice(0, 10) : [],
    };

    const statusCode =
      insertedCount > 0
        ? errors.length > 0 || insertErrors.length > 0
          ? 207
          : 201
        : 400;
    reply.status(statusCode).send(response);
  } catch (error) {
    console.error("Excel upload error:", error);
    reply.status(500).send({
      message: "Error processing Excel file",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Helper function to parse CSV file from /tmp directory
const parseCSVFile = (filePath: string): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const results: any[] = [];

    fs.createReadStream(filePath)
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
        })
      )
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
};

export const uploadQuestionsFromCSV = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  let tempFilePath: string | null = null;

  // DEBUG LOG: Entry into uploadQuestionsFromCSV
  console.log(
    "[UPLOAD_CSV] Received uploadQuestionsFromCSV request at",
    new Date().toISOString()
  );

  try {
    // Get the uploaded file from multipart data
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({
        message: "No file uploaded. Please upload a CSV file.",
      });
    }

    // Validate file type - only CSV allowed
    const allowedMimeTypes = ["text/csv", "application/csv", "text/plain"];

    const fileExtension = data.filename?.toLowerCase().split(".").pop();

    if (!allowedMimeTypes.includes(data.mimetype) && fileExtension !== "csv") {
      return reply.status(400).send({
        message: "Invalid file type. Please upload a CSV file (.csv only).",
      });
    }

    // Create temporary file path
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(7);
    tempFilePath = `/tmp/questions_${timestamp}_${randomSuffix}.csv`;

    // Save uploaded file to /tmp directory
    const buffer = await data.toBuffer();
    console.log(`[UPLOAD_CSV] File size: ${buffer.length} bytes`);
    fs.writeFileSync(tempFilePath, buffer);

    // Parse CSV file
    const csvData = await parseCSVFile(tempFilePath);

    if (!csvData || csvData.length === 0) {
      return reply.status(400).send({
        message: "CSV file is empty or has no valid data.",
      });
    }

    console.log(`[UPLOAD_CSV] Parsed ${csvData.length} rows from CSV`);

    // Pre-load all categories, subjects, and levels to avoid N+1 queries
    console.log("[UPLOAD_CSV] Pre-loading categories, subjects, and levels...");
    const [categories, subjects, levels] = await Promise.all([
      Category.find({}).lean(),
      Subject.find({}).lean(),
      Level.find({}).lean(),
    ]);

    // Create lookup maps for faster access
    const categoryMap = new Map(categories.map((c) => [c.name, c]));
    const subjectMap = new Map(subjects.map((s) => [s.name, s]));
    const levelMap = new Map(levels.map((l) => [l.name, l]));

    console.log(
      `[UPLOAD_CSV] Loaded ${categories.length} categories, ${subjects.length} subjects, ${levels.length} levels`
    );

    const validQuestions = [];
    const errors: ProcessingError[] = [];
    const processedQuestions = [];

    // Process each row
    console.log("[UPLOAD_CSV] Starting row processing...");
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNumber = i + 2; // CSV rows start from 2 (after header)

      // Log progress every 100 rows
      if (i % 100 === 0) {
        console.log(`[UPLOAD_CSV] Processing row ${i + 1}/${csvData.length}`);
      }

      try {
        // Convert correct_option to number if it's a string
        if (typeof row.correct_option === "string") {
          row.correct_option = parseInt(row.correct_option, 10);
        }

        // Validate row data
        const { error, value } = csvQuestionSchema.validate(row);
        if (error) {
          errors.push({
            row: rowNumber,
            message: error.details.map((d) => d.message).join(", "),
          });
          continue;
        }

        // Find related entities using pre-loaded maps
        const category = categoryMap.get(value.category_name);
        const subject = subjectMap.get(value.subject_name);
        const level = levelMap.get(value.level_name);

        if (!category) {
          errors.push({
            row: rowNumber,
            message: `Category '${value.category_name}' not found`,
          });
          continue;
        }

        if (!subject) {
          errors.push({
            row: rowNumber,
            message: `Subject '${value.subject_name}' not found`,
          });
          continue;
        }

        if (!level) {
          errors.push({
            row: rowNumber,
            message: `Level '${value.level_name}' not found`,
          });
          continue;
        }

        // Check for duplicate questions - removed for performance during bulk CSV upload
        // const existingQuestion = await Question.findOne({ text: value.text });
        // if (existingQuestion) {
        //   errors.push({
        //     row: rowNumber,
        //     message: `Question with text '${value.text}' already exists`,
        //   });
        //   continue;
        // }

        // Build options array
        const options = [
          { optionText: value.option1, isCorrect: value.correct_option === 1 },
          { optionText: value.option2, isCorrect: value.correct_option === 2 },
        ];

        if (value.option3) {
          options.push({
            optionText: value.option3,
            isCorrect: value.correct_option === 3,
          });
        }

        if (value.option4) {
          options.push({
            optionText: value.option4,
            isCorrect: value.correct_option === 4,
          });
        }

        // Ensure at least one correct answer exists
        const hasCorrectAnswer = options.some((opt) => opt.isCorrect);
        if (!hasCorrectAnswer) {
          errors.push({
            row: rowNumber,
            message: "No correct option specified",
          });
          continue;
        }

        const questionData = {
          text: value.text,
          options,
          difficulty: value.difficulty,
          category_id: category._id,
          subject_id: subject._id,
          level_id: level._id,
          explanation: value.explanation || "",
        };

        validQuestions.push(questionData);
        processedQuestions.push({
          row: rowNumber,
          text: value.text.substring(0, 50) + "...",
        });
      } catch (rowError) {
        errors.push({
          row: rowNumber,
          message: `Processing error: ${
            rowError instanceof Error ? rowError.message : "Unknown error"
          }`,
        });
      }
    }

    console.log(
      `[UPLOAD_CSV] Validation complete. Valid: ${validQuestions.length}, Errors: ${errors.length}`
    );

    // If there are validation errors, return them
    if (errors.length > 0 && validQuestions.length === 0) {
      return reply.status(400).send({
        message: "CSV validation failed",
        totalRows: csvData.length,
        validQuestions: 0,
        errors,
      });
    }

    // Insert valid questions in batches to avoid memory issues
    let insertedCount = 0;
    const insertErrors: ProcessingError[] = [];

    if (validQuestions.length > 0) {
      console.log(
        `[UPLOAD_CSV] Starting batch insert of ${validQuestions.length} questions...`
      );

      // Process in batches of 500 to avoid memory issues
      const batchSize = 500;
      for (let i = 0; i < validQuestions.length; i += batchSize) {
        const batch = validQuestions.slice(i, i + batchSize);
        console.log(
          `[UPLOAD_CSV] Inserting batch ${
            Math.floor(i / batchSize) + 1
          }/${Math.ceil(validQuestions.length / batchSize)}`
        );

        try {
          const result = await Question.insertMany(batch, {
            ordered: false,
          });
          insertedCount += result.length;
        } catch (insertError: any) {
          console.error(`[UPLOAD_CSV] Batch insert error:`, insertError);
          // Handle bulk insert errors
          if (insertError.writeErrors) {
            insertError.writeErrors.forEach((err: any) => {
              insertErrors.push({
                row: i + err.index + 1,
                message: err.errmsg,
              });
            });
            insertedCount += insertError.result?.nInserted || 0;
          } else {
            console.error(
              `[UPLOAD_CSV] Fatal database error:`,
              insertError.message
            );
            return reply.status(500).send({
              message: "Database error during bulk insert",
              error: insertError.message,
            });
          }
        }
      }
    }

    console.log(
      `[UPLOAD_CSV] Insert complete. Inserted: ${insertedCount}, Insert Errors: ${insertErrors.length}`
    );

    // Return summary
    const response = {
      message: "CSV upload processed",
      summary: {
        totalRows: csvData.length,
        validQuestions: validQuestions.length,
        insertedQuestions: insertedCount,
        failedValidation: errors.length,
        failedInsertion: insertErrors.length,
      },
      processedQuestions: processedQuestions.slice(0, 10), // Show first 10 for preview
      validationErrors: errors.length > 0 ? errors.slice(0, 10) : [], // Show first 10 errors
      insertionErrors: insertErrors.length > 0 ? insertErrors.slice(0, 10) : [],
    };

    const statusCode =
      insertedCount > 0
        ? errors.length > 0 || insertErrors.length > 0
          ? 207
          : 201
        : 400;

    console.log(`[UPLOAD_CSV] Sending response with status ${statusCode}`);
    reply.status(statusCode).send(response);
  } catch (error) {
    console.error("[UPLOAD_CSV] Fatal error:", error);
    reply.status(500).send({
      message: "Error processing CSV file",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    // Clean up: delete temporary file from /tmp
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log(`[UPLOAD_CSV] Cleaned up temp file: ${tempFilePath}`);
      } catch (cleanupError) {
        console.error(
          "[UPLOAD_CSV] Error cleaning up temp file:",
          cleanupError
        );
      }
    }
  }
};

export const downloadQuestionTemplate = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../../templates/question_upload_template.xlsx"
    );

    // Check if template exists, create if not
    if (!fs.existsSync(templatePath)) {
      const { createQuestionTemplate } = await import("../utils/excelTemplate");
      createQuestionTemplate();
    }

    const filename = "question_upload_template.xlsx";

    reply
      .header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(fs.createReadStream(templatePath));
  } catch (error) {
    console.error("Template download error:", error);
    reply.status(500).send({
      message: "Error downloading template",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// CSV template download function
export const downloadCSVTemplate = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Create CSV template content
    const csvHeaders = [
      "text",
      "option1",
      "option2",
      "option3",
      "option4",
      "correct_option",
      "difficulty",
      "category_name",
      "subject_name",
      "level_name",
      "explanation",
    ];

    const sampleRow = [
      "What is the capital of France?",
      "London",
      "Berlin",
      "Paris",
      "Madrid",
      "3",
      "Easy",
      "Geography",
      "World Capitals",
      "Basic",
      "Paris is the capital and largest city of France.",
    ];

    const csvContent = [csvHeaders.join(","), sampleRow.join(",")].join("\n");

    const filename = "question_upload_template.csv";

    reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .send(csvContent);
  } catch (error) {
    console.error("CSV template download error:", error);
    reply.status(500).send({
      message: "Error downloading CSV template",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
