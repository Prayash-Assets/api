import { FastifyRequest, FastifyReply } from "fastify";
import Joi from "joi";
import {
  MockTest,
  IMockTest,
  MockTestStatus,
  TestType,
} from "../models/MockTest";
import logger from "../config/logger"; // Import logger

const mockTestStatusValues = Object.values(MockTestStatus);
const testTypeValues = Object.values(TestType);

const mockTestSchema = Joi.object({
  title: Joi.string().required(),
  description: Joi.string().optional().allow(""),
  questions: Joi.array()
    .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
    .min(1)
    .optional(), // Make optional for frontend compatibility
  questionIds: Joi.array()
    .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
    .min(1)
    .optional(), // Allow questionIds from frontend
  duration: Joi.number().integer().min(1).required(),
  numberOfQuestions: Joi.number().integer().min(1).required(), // New field for question count
  totalMarks: Joi.number().integer().min(1).required(),
  passingMarks: Joi.number().integer().min(0).required(), // Allow 0 passing marks
  status: Joi.string()
    .valid(...mockTestStatusValues)
    .optional(),
  testType: Joi.string()
    .valid(...testTypeValues)
    .default(TestType.MOCK_TEST)
    .optional(),
  numberOfAttempts: Joi.number().integer().min(1).required(),
  marksPerQuestion: Joi.number().min(0.5).required(), // Allow decimal values like 0.5, 1.5 etc
  negativeMarking: Joi.number().min(0).optional(), // Allow decimal values, not just integers
  // createdBy: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(), // If you add createdBy
});

export const createMockTest = async (
  request: FastifyRequest<{ Body: IMockTest }>,
  reply: FastifyReply
) => {
  try {
    logger.info("Attempting to create a new mock test");
    const { error, value } = mockTestSchema.validate(request.body);
    if (error) {
      logger.error("Validation Error creating mock test", {
        error: error.details,
      });
      return reply
        .status(400)
        .send({ message: "Validation Error", details: error.details });
    }

    // Handle both questions and questionIds from frontend
    const requestBody = value as any;
    if (requestBody.questionIds && !requestBody.questions) {
      requestBody.questions = requestBody.questionIds;
      delete requestBody.questionIds;
    }

    // Ensure we have questions
    if (!requestBody.questions || requestBody.questions.length === 0) {
      return reply
        .status(400)
        .send({ message: "At least one question must be selected" });
    }

    // Validate that selected questions match the specified numberOfQuestions
    if (requestBody.questions.length !== requestBody.numberOfQuestions) {
      return reply.status(400).send({
        message: `Number of selected questions (${requestBody.questions.length}) must match the specified number of questions (${requestBody.numberOfQuestions})`,
      });
    }

    // Validate that totalMarks equals numberOfQuestions * marksPerQuestion
    const calculatedTotalMarks =
      requestBody.numberOfQuestions * requestBody.marksPerQuestion;
    if (Math.abs(requestBody.totalMarks - calculatedTotalMarks) > 0.01) {
      // Allow small floating point differences
      return reply.status(400).send({
        message: `Total marks (${requestBody.totalMarks}) must equal numberOfQuestions (${requestBody.numberOfQuestions}) × marksPerQuestion (${requestBody.marksPerQuestion}) = ${calculatedTotalMarks}`,
      });
    }

    // Validate passing marks doesn't exceed total marks
    if (requestBody.passingMarks > requestBody.totalMarks) {
      return reply.status(400).send({
        message: `Passing marks (${requestBody.passingMarks}) cannot exceed total marks (${requestBody.totalMarks})`,
      });
    }

    const existingMockTest = await MockTest.findOne({
      title: requestBody.title,
    });
    if (existingMockTest) {
      logger.warn("MockTest with this title already exists", {
        title: requestBody.title,
      });
      return reply
        .status(409)
        .send({ message: "MockTest with this title already exists" });
    }

    const mockTest = new MockTest(requestBody);
    await mockTest.save();
    logger.info("MockTest created successfully", { id: mockTest._id });
    reply.status(201).send(mockTest);
  } catch (error) {
    logger.error("Error creating mockTest", { error });
    reply.status(500).send({ message: "Error creating mockTest", error });
  }
};

export const getAllMockTests = async (
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply
) => {
  try {
    logger.info("Attempting to fetch paginated mock tests");

    // Parse query parameters with defaults
    const page = parseInt(request.query.page || "1", 10);
    const limit = parseInt(request.query.limit || "10", 10);

    // Ensure positive values
    const pageNum = Math.max(1, page);
    const limitNum = Math.max(1, Math.min(100, limit)); // Cap at 100 for safety

    // Get total count
    const total = await MockTest.countDocuments();

    // Calculate pagination values
    const totalPages = Math.ceil(total / limitNum);
    const skip = (pageNum - 1) * limitNum;

    // Fetch mock tests without population to avoid large payloads
    const mockTests = await MockTest.find().skip(skip).limit(limitNum);

    logger.info("Successfully fetched paginated mock tests", {
      page: pageNum,
      limit: limitNum,
      total,
    });

    reply.send({
      data: mockTests,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNum,
      },
    });
  } catch (error) {
    logger.error("Error fetching mockTests", { error });
    reply.status(500).send({ message: "Error fetching mockTests", error });
  }
};

export const getMockTestById = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const mockTestId = request.params.id;
    logger.info(`Attempting to fetch mock test with ID: ${mockTestId}`);
    const mockTest = await MockTest.findById(mockTestId).populate({
      path: "questions",
      populate: [
        {
          path: "category_id",
          select: "name",
          options: { strictPopulate: false },
        },
        {
          path: "subject_id",
          select: "name",
          options: { strictPopulate: false },
        },
        {
          path: "level_id",
          select: "name",
          options: { strictPopulate: false },
        },
      ],
    });
    if (!mockTest) {
      logger.warn("MockTest not found", { id: mockTestId });
      return reply.status(404).send({ message: "MockTest not found" });
    }

    // Transform the response to match frontend expectations
    const mockTestObj = mockTest.toObject();
    if (mockTestObj.questions) {
      mockTestObj.questions = mockTestObj.questions.map((question: any) => ({
        ...question,
        category: question.category_id,
        subject: question.subject_id,
        level: question.level_id,
      }));
    }

    logger.info("Successfully fetched mock test", { id: mockTestId });
    reply.send(mockTestObj);
  } catch (error) {
    logger.error("Error fetching mockTest", { id: request.params.id, error });
    reply.status(500).send({ message: "Error fetching mockTest", error });
  }
};

export const updateMockTest = async (
  request: FastifyRequest<{ Params: { id: string }; Body: Partial<IMockTest> }>,
  reply: FastifyReply
) => {
  try {
    const mockTestId = request.params.id;
    logger.info(`Attempting to update mock test with ID: ${mockTestId}`);

    // Create a partial validation schema for updates
    const updateSchema = Joi.object({
      title: Joi.string().optional(),
      description: Joi.string().optional().allow(""),
      questions: Joi.array()
        .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
        .min(1)
        .optional(),
      questionIds: Joi.array()
        .items(Joi.string().regex(/^[0-9a-fA-F]{24}$/))
        .min(1)
        .optional(),
      duration: Joi.number().integer().min(1).optional(),
      numberOfQuestions: Joi.number().integer().min(1).optional(), // New field for question count
      totalMarks: Joi.number().integer().min(1).optional(),
      passingMarks: Joi.number().integer().min(0).optional(),
      status: Joi.string()
        .valid(...mockTestStatusValues)
        .optional(),
      testType: Joi.string()
        .valid(...testTypeValues)
        .optional(),
      numberOfAttempts: Joi.number().integer().min(1).optional(),
      marksPerQuestion: Joi.number().min(0.5).optional(), // Allow decimal values like 0.5, 1.5 etc
      negativeMarking: Joi.number().min(0).optional(),
    });

    const { error, value } = updateSchema.validate(request.body);
    if (error) {
      logger.error("Validation Error updating mock test", {
        error: error.details,
      });
      return reply
        .status(400)
        .send({ message: "Validation Error", details: error.details });
    }

    // Handle both questions and questionIds from frontend
    const requestBody = value as any;
    if (requestBody.questionIds && !requestBody.questions) {
      requestBody.questions = requestBody.questionIds;
      delete requestBody.questionIds;
    }

    // Get current mock test data for validation
    const currentMockTest = await MockTest.findById(mockTestId);
    if (!currentMockTest) {
      logger.warn("MockTest not found for update", { id: mockTestId });
      return reply.status(404).send({ message: "MockTest not found" });
    }

    // Merge current data with update data for validation
    const mergedData = {
      numberOfQuestions:
        requestBody.numberOfQuestions || currentMockTest.numberOfQuestions,
      marksPerQuestion:
        requestBody.marksPerQuestion || currentMockTest.marksPerQuestion,
      totalMarks: requestBody.totalMarks || currentMockTest.totalMarks,
      passingMarks: requestBody.passingMarks || currentMockTest.passingMarks,
      questions: requestBody.questions || currentMockTest.questions,
    };

    // Validate that selected questions match the specified numberOfQuestions (if both are provided)
    if (requestBody.questions && mergedData.numberOfQuestions) {
      if (requestBody.questions.length !== mergedData.numberOfQuestions) {
        return reply.status(400).send({
          message: `Number of selected questions (${requestBody.questions.length}) must match the specified number of questions (${mergedData.numberOfQuestions})`,
        });
      }
    }

    // Validate that totalMarks equals numberOfQuestions * marksPerQuestion
    const calculatedTotalMarks =
      mergedData.numberOfQuestions * mergedData.marksPerQuestion;
    if (Math.abs(mergedData.totalMarks - calculatedTotalMarks) > 0.01) {
      // Allow small floating point differences
      return reply.status(400).send({
        message: `Total marks (${mergedData.totalMarks}) must equal numberOfQuestions (${mergedData.numberOfQuestions}) × marksPerQuestion (${mergedData.marksPerQuestion}) = ${calculatedTotalMarks}`,
      });
    }

    // Validate passing marks doesn't exceed total marks
    if (mergedData.passingMarks > mergedData.totalMarks) {
      return reply.status(400).send({
        message: `Passing marks (${mergedData.passingMarks}) cannot exceed total marks (${mergedData.totalMarks})`,
      });
    }

    // Check for title uniqueness if title is being updated
    if (requestBody.title) {
      const existingMockTest = await MockTest.findOne({
        title: requestBody.title,
        _id: { $ne: mockTestId }, // Exclude current mock test
      });
      if (existingMockTest) {
        logger.warn("MockTest with this title already exists", {
          title: requestBody.title,
        });
        return reply
          .status(409)
          .send({ message: "MockTest with this title already exists" });
      }
    }

    const mockTest = await MockTest.findByIdAndUpdate(mockTestId, requestBody, {
      new: true,
    }).populate({
      path: "questions",
      populate: [
        {
          path: "category_id",
          select: "name",
          options: { strictPopulate: false },
        },
        {
          path: "subject_id",
          select: "name",
          options: { strictPopulate: false },
        },
        {
          path: "level_id",
          select: "name",
          options: { strictPopulate: false },
        },
      ],
    });

    if (!mockTest) {
      logger.warn("MockTest not found for update", { id: mockTestId });
      return reply.status(404).send({ message: "MockTest not found" });
    }

    // Transform the response to match frontend expectations
    const mockTestObj = mockTest.toObject();
    if (mockTestObj.questions) {
      mockTestObj.questions = mockTestObj.questions.map((question: any) => ({
        ...question,
        category: question.category_id,
        subject: question.subject_id,
        level: question.level_id,
      }));
    }

    logger.info("MockTest updated successfully", { id: mockTestId });
    reply.send(mockTestObj);
  } catch (error) {
    logger.error("Error updating mockTest", { id: request.params.id, error });
    reply.status(500).send({ message: "Error updating mockTest", error });
  }
};

export const deleteMockTest = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const mockTestId = request.params.id;
    logger.info(`Attempting to delete mock test with ID: ${mockTestId}`);
    const mockTest = await MockTest.findByIdAndDelete(mockTestId);
    if (!mockTest) {
      logger.warn("MockTest not found for deletion", { id: mockTestId });
      return reply.status(404).send({ message: "MockTest not found" });
    }
    logger.info("MockTest deleted successfully", { id: mockTestId });
    reply.send({ message: "MockTest deleted successfully" });
  } catch (error) {
    logger.error("Error deleting mockTest", { id: request.params.id, error });
    reply.status(500).send({ message: "Error deleting mockTest", error });
  }
};
