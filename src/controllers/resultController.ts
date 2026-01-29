import { FastifyRequest, FastifyReply } from "fastify";
import Joi from "joi";
import { Result, IResult } from "../models/Result";
import { MockTest } from "../models/MockTest";
import logger from "../config/logger";
import { sanitizeObject } from "../utils/textSanitizer";

// Validation schema for creating a result
const resultSchema = Joi.object({
  student: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required(),
  mockTest: Joi.string()
    .regex(/^[0-9a-fA-F]{24}$/)
    .required(),
  startTime: Joi.date().required(),
  endTime: Joi.date().required(),
  score: Joi.number().required(),
  answers: Joi.array()
    .items(
      Joi.object({
        question: Joi.string()
          .regex(/^[0-9a-fA-F]{24}$/)
          .required(),
        selectedOption: Joi.string()
          .regex(/^[0-9a-fA-F]{24}$/)
          .required(),
        isCorrect: Joi.boolean().required(),
        marks: Joi.number().required(),
      })
    )
    .required(),
  totalMarks: Joi.number().required(),
  isPassed: Joi.boolean().required(),
  attemptNumber: Joi.number().integer().min(1).optional(),
});

// Create a new result
export const createResult = async (
  request: FastifyRequest<{ Body: IResult }>,
  reply: FastifyReply
) => {
  try {
    logger.info("Attempting to create a new result");
    const { error, value } = resultSchema.validate(request.body);
    if (error) {
      logger.error("Validation Error creating result", {
        error: error.details,
      });
      return reply
        .status(400)
        .send({ message: "Validation Error", details: error.details });
    }

    // Check if the mock test exists
    const mockTest = await MockTest.findById(value.mockTest);
    if (!mockTest) {
      logger.warn("MockTest not found", { id: value.mockTest });
      return reply.status(404).send({ message: "MockTest not found" });
    }

    // Check if the student has already attempted this mock test the maximum number of times
    const attemptCount = await Result.countDocuments({
      student: value.student,
      mockTest: value.mockTest,
    });

    if (attemptCount >= mockTest.numberOfAttempts) {
      logger.warn("Maximum attempts reached for this mock test", {
        student: value.student,
        mockTest: value.mockTest,
        maxAttempts: mockTest.numberOfAttempts,
      });
      return reply.status(400).send({
        message: `Maximum attempts (${mockTest.numberOfAttempts}) reached for this mock test`,
      });
    }

    // Set the attempt number
    value.attemptNumber = attemptCount + 1;

    const result = new Result(value);
    await result.save();
    logger.info("Result created successfully", { id: result._id });
    reply.status(201).send(result);
  } catch (error) {
    logger.error("Error creating result", { error });
    reply.status(500).send({ message: "Error creating result", error });
  }
};

// Get all results
export const getAllResults = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    logger.info("Attempting to fetch all results");
    const results = await Result.find()
      .populate("student", "fullname email")
      .populate("mockTest", "title");
    logger.info("Successfully fetched all results");
    reply.send(results);
  } catch (error) {
    logger.error("Error fetching results", { error });
    reply.status(500).send({ message: "Error fetching results", error });
  }
};

// Get results by student ID
export const getResultsByStudent = async (
  request: FastifyRequest<{ Params: { studentId: string } }>,
  reply: FastifyReply
) => {
  try {
    const studentId = request.params.studentId;
    logger.info(
      `Attempting to fetch results for student with ID: ${studentId}`
    );
    const results = await Result.find({ student: studentId })
      .populate("student", "fullname email")
      .populate("mockTest", "title");
    logger.info("Successfully fetched results for student", { studentId });
    reply.send(results);
  } catch (error) {
    logger.error("Error fetching results for student", {
      studentId: request.params.studentId,
      error,
    });
    reply.status(500).send({
      message: "Error fetching results for student",
      error,
    });
  }
};

// Get results by mock test ID
export const getResultsByMockTest = async (
  request: FastifyRequest<{ Params: { mockTestId: string } }>,
  reply: FastifyReply
) => {
  try {
    const mockTestId = request.params.mockTestId;
    logger.info(
      `Attempting to fetch results for mock test with ID: ${mockTestId}`
    );
    const results = await Result.find({ mockTest: mockTestId })
      .populate("student", "fullname email")
      .populate("mockTest", "title");
    logger.info("Successfully fetched results for mock test", { mockTestId });
    reply.send(results);
  } catch (error) {
    logger.error("Error fetching results for mock test", {
      mockTestId: request.params.mockTestId,
      error,
    });
    reply.status(500).send({
      message: "Error fetching results for mock test",
      error,
    });
  }
};

// Get a specific result by ID
export const getResultById = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const resultId = request.params.id;
    logger.info(`Attempting to fetch result with ID: ${resultId}`);
    const result = await Result.findById(resultId)
      .populate("student", "fullname email")
      .populate("mockTest", "title")
      .populate("answers.question")
      .populate("answers.selectedOption");
    if (!result) {
      logger.warn("Result not found", { id: resultId });
      return reply.status(404).send({ message: "Result not found" });
    }
    logger.info("Successfully fetched result", { id: resultId });
    reply.send(result);
  } catch (error) {
    logger.error("Error fetching result", { id: request.params.id, error });
    reply.status(500).send({ message: "Error fetching result", error });
  }
};

// Update a result
export const updateResult = async (
  request: FastifyRequest<{ Params: { id: string }; Body: Partial<IResult> }>,
  reply: FastifyReply
) => {
  try {
    const resultId = request.params.id;
    logger.info(`Attempting to update result with ID: ${resultId}`);
    // You might want to add validation for the partial update as well
    const result = await Result.findByIdAndUpdate(resultId, request.body, {
      new: true,
    })
      .populate("student", "fullname email")
      .populate("mockTest", "title");
    if (!result) {
      logger.warn("Result not found for update", { id: resultId });
      return reply.status(404).send({ message: "Result not found" });
    }
    logger.info("Result updated successfully", { id: resultId });
    reply.send(result);
  } catch (error) {
    logger.error("Error updating result", { id: request.params.id, error });
    reply.status(500).send({ message: "Error updating result", error });
  }
};

// Delete a result
export const deleteResult = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const resultId = request.params.id;
    logger.info(`Attempting to delete result with ID: ${resultId}`);
    const result = await Result.findByIdAndDelete(resultId);
    if (!result) {
      logger.warn("Result not found for deletion", { id: resultId });
      return reply.status(404).send({ message: "Result not found" });
    }
    logger.info("Result deleted successfully", { id: resultId });
    reply.send({ message: "Result deleted successfully" });
  } catch (error) {
    logger.error("Error deleting result", { id: request.params.id, error });
    reply.status(500).send({ message: "Error deleting result", error });
  }
};

// Get all results with filtering and pagination (admin only)
export const getAdminResults = async (
  request: FastifyRequest<{
    Querystring: {
      page?: string;
      limit?: string;
      studentId?: string;
      mockTestId?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
    };
  }>,
  reply: FastifyReply
) => {
  try {
    // Parse numeric values properly
    const page = parseInt(request.query.page || "1", 10);
    const limit = parseInt(request.query.limit || "20", 10);
    const {
      studentId,
      mockTestId,
      startDate,
      endDate,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = request.query;

    logger.info("Fetching admin results with filters", {
      page,
      limit,
      studentId,
      mockTestId,
      startDate,
      endDate,
      search,
      sortBy,
      sortOrder,
    });

    // Build filter object
    const filter: any = {};

    if (studentId) {
      filter.student = studentId;
    }

    if (mockTestId) {
      filter.mockTest = mockTestId;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    // Build sort object
    const sort: any = {};
    if (sortBy === "student") {
      sort["student.fullname"] = sortOrder === "asc" ? 1 : -1;
    } else if (sortBy === "mockTest") {
      sort["mockTest.title"] = sortOrder === "asc" ? 1 : -1;
    } else {
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;
    }

    // Calculate pagination - ensure these are numbers
    const skip = (page - 1) * limit;

    // Build aggregation pipeline
    const pipeline: any[] = [
      { $match: filter },
      {
        $lookup: {
          from: "users",
          localField: "student",
          foreignField: "_id",
          as: "student",
        },
      },
      {
        $lookup: {
          from: "mocktests",
          localField: "mockTest",
          foreignField: "_id",
          as: "mockTest",
        },
      },
      { $unwind: "$student" },
      { $unwind: "$mockTest" },
    ];

    // Add search filter if provided
    if (search) {
      pipeline.push({
        $match: {
          $or: [
            { "student.fullname": { $regex: search, $options: "i" } },
            { "student.email": { $regex: search, $options: "i" } },
            { "mockTest.title": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Add sorting and pagination with proper numeric values
    pipeline.push({ $sort: sort }, { $skip: skip }, { $limit: limit });

    // Execute aggregation
    const results = await Result.aggregate(pipeline);

    // Get total count for pagination
    const totalCountPipeline = [...pipeline.slice(0, -2)]; // Remove skip and limit
    totalCountPipeline.push({ $count: "total" });
    const totalCountResult = await Result.aggregate(totalCountPipeline);
    const total = totalCountResult[0]?.total || 0;

    // Transform results for frontend
    const transformedResults = results.map((result) => ({
      _id: result._id,
      student: {
        _id: result.student._id,
        fullname: result.student.fullname,
        email: result.student.email,
        userType: result.student.userType,
      },
      mockTest: {
        _id: result.mockTest._id,
        title: result.mockTest.title,
        description: result.mockTest.description,
        totalMarks: result.mockTest.totalMarks,
        passingMarks: result.mockTest.passingMarks,
        duration: result.mockTest.duration,
      },
      score: result.score,
      totalMarks: result.totalMarks,
      percentage: result.percentage,
      correctAnswers: result.correctAnswers,
      incorrectAnswers: result.incorrectAnswers,
      unansweredQuestions: result.unansweredQuestions,
      timeTaken: result.timeTaken,
      isPassed: result.isPassed,
      attemptNumber: result.attemptNumber,
      submissionType: result.submissionType,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    }));

    reply.send({
      results: transformedResults,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
        totalRecords: total,
      },
    });
  } catch (error) {
    logger.error("Error fetching admin results", { error });
    reply.status(500).send({
      message: "Error fetching results",
      error,
    });
  }
};

// Get detailed analytics for admin dashboard
export const getResultsAnalytics = async (
  request: FastifyRequest<{
    Querystring: {
      startDate?: string;
      endDate?: string;
      mockTestId?: string;
    };
  }>,
  reply: FastifyReply
) => {
  try {
    const { startDate, endDate, mockTestId } = request.query;

    logger.info("Fetching results analytics", {
      startDate,
      endDate,
      mockTestId,
    });

    // Build filter
    const filter: any = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (mockTestId) filter.mockTest = mockTestId;

    // Get basic statistics
    const [
      totalAttempts,
      passedAttempts,
      averageScore,
      scoreDistribution,
      dailyAttempts,
      topPerformers,
      testWiseStats,
      subjectWiseStats,
    ] = await Promise.all([
      // Total attempts
      Result.countDocuments(filter),

      // Passed attempts
      Result.countDocuments({ ...filter, isPassed: true }),

      // Average score
      Result.aggregate([
        { $match: filter },
        { $group: { _id: null, avgScore: { $avg: "$percentage" } } },
      ]),

      // Score distribution
      Result.aggregate([
        { $match: filter },
        {
          $bucket: {
            groupBy: "$percentage",
            boundaries: [0, 25, 50, 75, 90, 100],
            default: "Other",
            output: { count: { $sum: 1 } },
          },
        },
      ]),

      // Daily attempts (last 30 days)
      Result.aggregate([
        {
          $match: {
            ...filter,
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
              day: { $dayOfMonth: "$createdAt" },
            },
            attempts: { $sum: 1 },
            passed: { $sum: { $cond: ["$isPassed", 1, 0] } },
          },
        },
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
      ]),

      // Top performers
      Result.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "users",
            localField: "student",
            foreignField: "_id",
            as: "student",
          },
        },
        { $unwind: "$student" },
        {
          $group: {
            _id: "$student._id",
            studentName: { $first: "$student.fullname" },
            studentEmail: { $first: "$student.email" },
            totalAttempts: { $sum: 1 },
            averageScore: { $avg: "$percentage" },
            bestScore: { $max: "$percentage" },
            totalPassed: { $sum: { $cond: ["$isPassed", 1, 0] } },
          },
        },
        { $sort: { averageScore: -1 } },
        { $limit: 10 },
      ]),

      // Test-wise statistics
      Result.aggregate([
        { $match: filter },
        {
          $lookup: {
            from: "mocktests",
            localField: "mockTest",
            foreignField: "_id",
            as: "mockTest",
          },
        },
        { $unwind: "$mockTest" },
        {
          $group: {
            _id: "$mockTest._id",
            testTitle: { $first: "$mockTest.title" },
            totalAttempts: { $sum: 1 },
            averageScore: { $avg: "$percentage" },
            passRate: {
              $avg: { $cond: ["$isPassed", 1, 0] },
            },
            bestScore: { $max: "$percentage" },
            worstScore: { $min: "$percentage" },
          },
        },
        { $sort: { totalAttempts: -1 } },
      ]),

      // Subject-wise statistics (from detailed analysis)
      Result.aggregate([
        { $match: filter },
        { $unwind: "$detailedAnalysis.subjectWise" },
        {
          $group: {
            _id: "$detailedAnalysis.subjectWise.k",
            totalQuestions: { $sum: "$detailedAnalysis.subjectWise.v.total" },
            totalAttempted: {
              $sum: "$detailedAnalysis.subjectWise.v.attempted",
            },
            totalCorrect: { $sum: "$detailedAnalysis.subjectWise.v.correct" },
            averagePercentage: {
              $avg: "$detailedAnalysis.subjectWise.v.percentage",
            },
          },
        },
        { $sort: { averagePercentage: -1 } },
      ]),
    ]);

    const analytics = {
      overview: {
        totalAttempts,
        passedAttempts,
        failedAttempts: totalAttempts - passedAttempts,
        passRate:
          totalAttempts > 0 ? (passedAttempts / totalAttempts) * 100 : 0,
        averageScore: averageScore[0]?.avgScore || 0,
      },
      scoreDistribution: scoreDistribution.map((bucket) => ({
        range: bucket._id === "Other" ? "100+" : bucket._id,
        count: bucket.count,
      })),
      dailyTrends: dailyAttempts.map((day) => ({
        date: `${day._id.year}-${String(day._id.month).padStart(
          2,
          "0"
        )}-${String(day._id.day).padStart(2, "0")}`,
        attempts: day.attempts,
        passed: day.passed,
        passRate: day.attempts > 0 ? (day.passed / day.attempts) * 100 : 0,
      })),
      topPerformers: topPerformers.map((performer) => ({
        studentId: performer._id,
        studentName: performer.studentName,
        studentEmail: performer.studentEmail,
        totalAttempts: performer.totalAttempts,
        averageScore: Math.round(performer.averageScore * 100) / 100,
        bestScore: Math.round(performer.bestScore * 100) / 100,
        passRate:
          performer.totalAttempts > 0
            ? Math.round(
              (performer.totalPassed / performer.totalAttempts) * 100
            )
            : 0,
      })),
      testWiseStats: testWiseStats.map((test) => ({
        testId: test._id,
        testTitle: test.testTitle,
        totalAttempts: test.totalAttempts,
        averageScore: Math.round(test.averageScore * 100) / 100,
        passRate: Math.round(test.passRate * 100),
        bestScore: Math.round(test.bestScore * 100) / 100,
        worstScore: Math.round(test.worstScore * 100) / 100,
      })),
      subjectWiseStats: subjectWiseStats.map((subject) => ({
        subject: subject._id,
        totalQuestions: subject.totalQuestions,
        totalAttempted: subject.totalAttempted,
        totalCorrect: subject.totalCorrect,
        accuracyRate:
          subject.totalAttempted > 0
            ? Math.round((subject.totalCorrect / subject.totalAttempted) * 100)
            : 0,
        averagePercentage: Math.round(subject.averagePercentage * 100) / 100,
      })),
    };

    reply.send(analytics);
  } catch (error) {
    logger.error("Error fetching results analytics", { error });
    reply.status(500).send({
      message: "Error fetching analytics",
      error,
    });
  }
};

// Export results data as CSV
export const exportResultsCSV = async (
  request: FastifyRequest<{
    Querystring: {
      studentId?: string;
      mockTestId?: string;
      startDate?: string;
      endDate?: string;
    };
  }>,
  reply: FastifyReply
) => {
  try {
    const { studentId, mockTestId, startDate, endDate } = request.query;

    logger.info("Exporting results as CSV", {
      studentId,
      mockTestId,
      startDate,
      endDate,
    });

    // Build filter
    const filter: any = {};
    if (studentId) filter.student = studentId;
    if (mockTestId) filter.mockTest = mockTestId;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Get results with populated data
    const results = await Result.find(filter)
      .populate("student", "fullname email")
      .populate(
        "mockTest",
        "title description totalMarks passingMarks duration"
      )
      .sort({ createdAt: -1 });

    // Convert to CSV format
    const csvHeaders = [
      "Student Name",
      "Student Email",
      "Test Title",
      "Test Date",
      "Duration (min)",
      "Score",
      "Total Marks",
      "Percentage",
      "Correct Answers",
      "Incorrect Answers",
      "Unanswered",
      "Time Taken (min)",
      "Status",
      "Attempt Number",
      "Submission Type",
    ];

    const csvData = results.map((result) => [
      (result.student as any).fullname,
      (result.student as any).email,
      (result.mockTest as any).title,
      new Date(result.createdAt).toLocaleDateString(),
      (result.mockTest as any).duration,
      result.score,
      result.totalMarks,
      `${result.percentage.toFixed(2)}%`,
      result.correctAnswers,
      result.incorrectAnswers,
      result.unansweredQuestions,
      Math.round(result.timeTaken / 60),
      result.isPassed ? "PASSED" : "FAILED",
      result.attemptNumber,
      result.submissionType,
    ]);

    // Generate CSV content
    const csvContent = [
      csvHeaders.join(","),
      ...csvData.map((row) =>
        row
          .map((cell) =>
            typeof cell === "string" && cell.includes(",") ? `"${cell}"` : cell
          )
          .join(",")
      ),
    ].join("\n");

    // Set headers for file download
    reply.header("Content-Type", "text/csv");
    reply.header(
      "Content-Disposition",
      `attachment; filename="mocktest-results-${new Date().toISOString().split("T")[0]
      }.csv"`
    );

    reply.send(csvContent);
  } catch (error) {
    logger.error("Error exporting results CSV", { error });
    reply.status(500).send({
      message: "Error exporting CSV",
      error,
    });
  }
};

// Get detailed result for admin view (admin only)
export const getAdminResultById = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const resultId = request.params.id;
    logger.info(`Admin fetching detailed result with ID: ${resultId}`);

    const result = await Result.findById(resultId)
      .populate("student", "fullname email userType")
      .populate(
        "mockTest",
        "title description totalMarks passingMarks duration"
      )
      .populate({
        path: "answers.question",
        populate: [
          { path: "category_id", select: "name" },
          { path: "subject_id", select: "name" },
          { path: "level_id", select: "name" },
        ],
      });

    if (!result) {
      logger.warn("Result not found for admin view", { id: resultId });
      return reply.status(404).send({ message: "Result not found" });
    }

    // Transform the result for admin view with complete data
    const detailedResult = {
      _id: result._id,
      testId: result.mockTest._id,
      testTitle: (result.mockTest as any).title,
      testDescription: (result.mockTest as any).description,
      testDuration: (result.mockTest as any).duration,
      score: result.score,
      totalMarks: result.totalMarks,
      passingMarks: (result.mockTest as any).passingMarks,
      percentage: result.percentage,
      correctAnswers: result.correctAnswers,
      incorrectAnswers: result.incorrectAnswers,
      unansweredQuestions: result.unansweredQuestions,
      totalQuestions:
        result.correctAnswers +
        result.incorrectAnswers +
        result.unansweredQuestions,
      timeTaken: result.timeTaken,
      timeAllowed: (result.mockTest as any).duration * 60,
      isPassed: result.isPassed,
      attemptNumber: result.attemptNumber,
      submissionType: result.submissionType,
      completedAt: result.createdAt,
      student: {
        _id: result.student._id,
        fullname: (result.student as any).fullname,
        email: (result.student as any).email,
        userType: (result.student as any).userType,
      },
      mockTest: {
        _id: result.mockTest._id,
        title: (result.mockTest as any).title,
        description: (result.mockTest as any).description,
        totalMarks: (result.mockTest as any).totalMarks,
        passingMarks: (result.mockTest as any).passingMarks,
        duration: (result.mockTest as any).duration,
      },
      detailedAnalysis: result.detailedAnalysis,
      questionWiseAnalysis: result.answers.map((answer: any) => {
        const questionOptions = answer.question.options || [];
        const rawAnswer = answer.answer || answer.selectedAnswer;

        // Convert user answer to actual option text
        let userAnswerText = rawAnswer;
        if (rawAnswer !== null && rawAnswer !== undefined && rawAnswer !== "") {
          // If the answer is a number (option index), get the option text
          if (typeof rawAnswer === "number" || !isNaN(Number(rawAnswer))) {
            const optionIndex = Number(rawAnswer);
            if (optionIndex >= 0 && optionIndex < questionOptions.length) {
              userAnswerText = questionOptions[optionIndex].optionText;
            }
          } else if (typeof rawAnswer === "string") {
            // Check if it's an option ID and map to text
            const matchedOption = questionOptions.find(
              (opt: any) => opt._id?.toString() === rawAnswer || opt.optionText === rawAnswer
            );
            if (matchedOption) {
              userAnswerText = matchedOption.optionText;
            }
          } else if (Array.isArray(rawAnswer)) {
            // Handle multiple answers
            userAnswerText = rawAnswer.map((ans: any) => {
              if (typeof ans === "number" || !isNaN(Number(ans))) {
                const optionIndex = Number(ans);
                if (optionIndex >= 0 && optionIndex < questionOptions.length) {
                  return questionOptions[optionIndex].optionText;
                }
              }
              const matchedOption = questionOptions.find(
                (opt: any) => opt._id?.toString() === ans || opt.optionText === ans
              );
              return matchedOption ? matchedOption.optionText : ans;
            });
          }
        }

        // Get correct answer text from options
        const correctAnswerTexts = questionOptions
          .filter((opt: any) => opt.isCorrect)
          .map((opt: any) => opt.optionText);

        return {
          questionId: answer.question._id,
          questionText: answer.question.text,
          options: answer.question.options,
          userAnswer: userAnswerText || "Not answered",
          correctAnswer: correctAnswerTexts.length === 1 ? correctAnswerTexts[0] : correctAnswerTexts,
          isCorrect: answer.isCorrect,
          marks: answer.marks,
          timeTaken: answer.timeTaken || 0,
          difficulty: answer.question.difficulty,
          subject: answer.question.subject_id?.name || "General",
          category: answer.question.category_id?.name || "General",
          explanation: answer.question.explanation || "",
        };
      }),
    };

    logger.info("Successfully fetched detailed result for admin", {
      id: resultId,
    });
    // Sanitize text to fix encoding issues with special characters
    reply.send(sanitizeObject(detailedResult));
  } catch (error) {
    logger.error("Error fetching detailed result for admin", {
      id: request.params.id,
      error,
    });
    reply.status(500).send({ message: "Error fetching result details", error });
  }
};
