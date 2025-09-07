import { FastifyRequest, FastifyReply } from "fastify";
import User, { Student } from "../models/User";
import Package from "../models/Package";
import { MockTest } from "../models/MockTest";
import { AuthenticatedRequest } from "../middleware/rbacMiddleware";
import { Result } from "../models/Result";
import Joi from "joi";
import logger from "../config/logger";

// Validation schema for student profile update
const updateStudentProfileSchema = Joi.object({
  fullname: Joi.string().min(3).max(30).optional(),
  phone: Joi.number().optional(),
  city: Joi.string().optional(),
  state: Joi.string().optional(),
  education: Joi.string().optional(),
  school: Joi.string().optional(),
});

// Dashboard data for student overview
export const getDashboardData = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Get student with purchased packages
    const student = await Student.findById(userId).populate("packages");
    if (!student) {
      return reply.status(404).send({ error: "Student not found" });
    }

    // Get performance data (mock implementation)
    const performanceData = {
      totalTests: 25,
      completedTests: 8,
      averageScore: 78,
      bestScore: 95,
      recentTests: [
        {
          _id: "test1",
          title: "Mathematics Practice Test 1",
          subject: "Mathematics",
          score: 85,
        },
        {
          _id: "test2",
          title: "Science Mock Test",
          subject: "Science",
          score: 92,
        },
      ],
    };

    reply.send({
      packages: student.packages || [],
      performance: performanceData,
      mockTests: [], // Will be populated from actual mock tests
    });
  } catch (error: any) {
    console.error("Get dashboard data error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get purchased packages for a student
export const getPurchasedPackages = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    console.log("DEBUG: Fetching purchased packages for student:", userId);

    // Get student's purchased packages with populated mockTests
    const student = await Student.findById(userId).populate({
      path: "packages",
      populate: {
        path: "mockTests",
        select: "title description duration totalMarks status testType",
      },
    });

    if (!student) {
      console.log("DEBUG: Student not found:", userId);
      return reply.status(404).send({ error: "Student not found" });
    }

    console.log("DEBUG: Student packages raw data:", {
      studentId: userId,
      packagesCount: student.packages?.length || 0,
      packageIds: student.packages?.map((pkg: any) => pkg._id) || [],
    });

    // Add purchase and expiry dates (mock data for now)
    const packagesWithDetails = (student.packages || []).map((pkg: any) => {
      console.log("DEBUG: Processing package:", {
        packageId: pkg._id,
        packageName: pkg.name,
        mockTestsCount: pkg.mockTests?.length || 0,
        mockTests:
          pkg.mockTests?.map((test: any) => ({
            id: test._id,
            title: test.title,
            status: test.status,
          })) || [],
      });

      // Ensure validityDays is a valid number, fallback to duration or 30 days
      const validityDays = pkg.validityDays || pkg.duration || 30;
      const purchaseDate = new Date();
      const expiryDate = new Date(
        Date.now() + validityDays * 24 * 60 * 60 * 1000
      );

      return {
        ...pkg.toObject(),
        isPurchased: true,
        purchaseDate: purchaseDate.toISOString(),
        expiryDate: expiryDate.toISOString(),
        isActive: expiryDate > new Date(),
        validityDays, // Include the calculated validity days
      };
    });

    console.log(
      "DEBUG: Final packages with details:",
      packagesWithDetails.length
    );

    reply.send(packagesWithDetails);
  } catch (error: any) {
    console.error("Get purchased packages error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Purchase a package
export const purchasePackage = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    const { packageId } = request.body as { packageId: string };

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    if (!packageId) {
      return reply.status(400).send({ error: "Package ID is required" });
    }

    // Check if package exists
    const packageDoc = await Package.findById(packageId);
    if (!packageDoc) {
      return reply.status(404).send({ error: "Package not found" });
    }

    // Get student
    const student = await Student.findById(userId);
    if (!student) {
      return reply.status(404).send({ error: "Student not found" });
    }

    // Check if already purchased
    const alreadyPurchased = student.packages?.includes(packageId as any);
    if (alreadyPurchased) {
      return reply.status(400).send({ error: "Package already purchased" });
    }

    // Add package to student's packages
    if (!student.packages) {
      student.packages = [];
    }
    student.packages.push(packageId as any);
    await student.save();

    console.log("Package purchased:", { userId, packageId });
    reply.send({ message: "Package purchased successfully" });
  } catch (error: any) {
    console.error("Purchase package error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get available mock tests for student
export const getAvailableMockTests = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    console.log("DEBUG: Fetching mock tests for student:", userId);

    // Get student's purchased packages to determine available tests
    const student = await Student.findById(userId).populate({
      path: "packages",
      populate: {
        path: "mockTests",
        match: { status: "Published" }, // Only get published mock tests
        populate: {
          path: "questions",
          select: "_id", // Only get question count for performance
        },
      },
    });

    if (!student) {
      console.log("DEBUG: Student not found:", userId);
      return reply.status(404).send({ error: "Student not found" });
    }

    console.log("DEBUG: Student found with packages:", {
      studentId: userId,
      packagesCount: student.packages?.length || 0,
      packages: student.packages?.map((pkg: any) => ({
        id: pkg._id,
        name: pkg.name,
        mockTestsCount: pkg.mockTests?.length || 0,
      })),
    });

    // Extract all mock test IDs from purchased packages
    const availableMockTestIds = new Set();
    if (student.packages && Array.isArray(student.packages)) {
      student.packages.forEach((pkg: any) => {
        if (pkg.mockTests && Array.isArray(pkg.mockTests)) {
          pkg.mockTests.forEach((test: any) => {
            if (test && test._id) {
              availableMockTestIds.add(test._id.toString());
              console.log("DEBUG: Adding mock test from package:", {
                packageName: pkg.name,
                testId: test._id.toString(),
                testTitle: test.title,
              });
            }
          });
        }
      });
    }

    console.log(
      "DEBUG: Available mock test IDs:",
      Array.from(availableMockTestIds)
    );

    // If no mock tests available from packages, return empty array
    if (availableMockTestIds.size === 0) {
      console.log("DEBUG: No mock tests found in purchased packages");
      return reply.send([]);
    }

    // Fetch only the mock tests that are in the student's packages
    let mockTests = await MockTest.find({
      _id: { $in: Array.from(availableMockTestIds) },
      status: "Published", // Double-check they're published
    }).populate({
      path: "questions",
      select: "_id", // Only get question count for performance
    });

    // Filter out any nulls (shouldn't happen, but for safety)
    mockTests = mockTests.filter((test) => test && test._id);

    if (mockTests.length !== availableMockTestIds.size) {
      const foundIds = new Set(
        mockTests.map((t) => (t._id as string).toString())
      );
      const missingIds = Array.from(availableMockTestIds).filter(
        (id) => !foundIds.has(id as string)
      );
      console.warn("WARNING: Some mock test IDs not found in DB:", missingIds);
    }

    // Get all results for this student to check completion status
    let studentResults: any[] = [];
    try {
      studentResults = await Result.find({ student: userId }).populate(
        "mockTest",
        "_id"
      );
      console.log("DEBUG: Found student results:", {
        count: studentResults.length,
        resultIds: studentResults.map((r) => r._id),
      });
    } catch (error) {
      console.error("ERROR: Failed to fetch student results:", error);
      // Continue without results data if there's an error
      studentResults = [];
    }

    // Create a map of test IDs to their attempt counts, completion status, and latest result ID
    const testAttempts = new Map();
    studentResults.forEach((result) => {
      // Check if mockTest exists and has an _id before processing
      if (!result.mockTest || !(result.mockTest as any)?._id) {
        console.warn("WARNING: Result has null or invalid mockTest:", {
          resultId: result._id,
          mockTest: result.mockTest,
        });
        return; // Skip this result
      }

      const testId = (result.mockTest as any)._id.toString();
      if (!testAttempts.has(testId)) {
        testAttempts.set(testId, {
          attemptCount: 0,
          isCompleted: false,
          bestScore: 0,
          latestResultId: null,
        });
      }
      const current = testAttempts.get(testId);
      current.attemptCount++;
      current.isCompleted = true;
      current.latestResultId = result._id; // Store the latest result ID
      if (result.percentage > current.bestScore) {
        current.bestScore = result.percentage;
      }
    });

    // Transform the data to match frontend expectations
    const transformedMockTests = mockTests
      .filter((test) => test && test._id) // Ensure test and _id exist
      .map((test) => {
        const testId = (test._id as any).toString();
        const attemptInfo = testAttempts.get(testId) || {
          attemptCount: 0,
          isCompleted: false,
          bestScore: 0,
          latestResultId: null,
        };

        return {
          _id: test._id,
          title: test.title || "Untitled Test",
          description: test.description || "",
          duration: test.duration || 60,
          totalQuestions: test.questions?.length || 0,
          totalMarks: test.totalMarks || 0,
          passingMarks: test.passingMarks || 0,
          difficulty: "Medium", // You might want to calculate this based on questions
          subject: "General", // You might want to determine this from questions
          testType: test.testType || "Practice", // Add test type field
          marksPerQuestion: test.marksPerQuestion || 1,
          negativeMarking: test.negativeMarking || 0,
          numberOfAttempts: test.numberOfAttempts || 1,
          isCompleted: attemptInfo.isCompleted,
          attempts: attemptInfo.attemptCount,
          maxAttempts: test.numberOfAttempts || 1,
          score: attemptInfo.bestScore,
          canAttempt: attemptInfo.attemptCount < (test.numberOfAttempts || 1),
          resultId: attemptInfo.latestResultId, // Include the latest result ID
          createdAt: (test as any).createdAt,
          updatedAt: (test as any).updatedAt,
        };
      });

    reply.send(transformedMockTests);
  } catch (error: any) {
    console.error("Get available mock tests error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get specific mock test details
export const getMockTest = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    const { testId } = request.params as { testId: string };

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Fetch actual mock test data from the database with populated questions
    const mockTest = await MockTest.findById(testId).populate({
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
      return reply.status(404).send({ error: "Mock test not found" });
    }

    // Transform the response to match frontend expectations
    const mockTestObj = mockTest.toObject();

    // Transform questions to match the frontend interface format
    if (mockTestObj.questions) {
      mockTestObj.questions = mockTestObj.questions.map((question: any) => {
        // Determine question type based on options structure
        let questionType = "multiple-choice";
        let options: string[] = [];
        let correctAnswer: string | string[] = "";

        if (question.options && question.options.length > 0) {
          // Extract option texts
          options = question.options.map((opt: any) => opt.optionText);

          // Find correct answers
          const correctOptions = question.options
            .filter((opt: any) => opt.isCorrect)
            .map((opt: any) => opt.optionText);

          // Determine question type based on number of correct answers
          if (correctOptions.length > 1) {
            questionType = "multiple-select";
            correctAnswer = correctOptions;
          } else if (
            options.length === 2 &&
            (options.includes("True") ||
              options.includes("False") ||
              options.includes("true") ||
              options.includes("false"))
          ) {
            questionType = "true-false";
            correctAnswer = correctOptions[0] || "";
          } else {
            questionType = "multiple-choice";
            correctAnswer = correctOptions[0] || "";
          }
        } else {
          // Text question if no options
          questionType = "text";
          correctAnswer = question.correct_answer || "";
        }

        return {
          _id: question._id,
          text: question.text,
          type: questionType,
          options: options.length > 0 ? options : undefined,
          correctAnswer,
          marks: 1, // Default marks per question, can be customized
          difficulty: question.difficulty,
          subject: question.subject_id?.name || "Unknown",
          category: question.category_id?.name || "Unknown",
          explanation: question.explanation || "",
        };
      });
    }

    // Add calculated fields
    (mockTestObj as any).totalQuestions = mockTestObj.questions?.length || 0;

    reply.send(mockTestObj);
  } catch (error: any) {
    console.error("Get mock test error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Submit mock test answers with proper result saving
export const submitMockTest = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    const { testId } = request.params as { testId: string };
    const {
      answers,
      timeTaken,
      isAutoSubmit = false,
    } = request.body as {
      answers: Record<string, any>;
      timeTaken: number;
      isAutoSubmit?: boolean;
    };

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Get the mock test with populated questions
    const mockTest = await MockTest.findById(testId).populate({
      path: "questions",
      populate: [
        {
          path: "category_id",
          select: "name",
        },
        {
          path: "subject_id",
          select: "name",
        },
        {
          path: "level_id",
          select: "name",
        },
      ],
    });

    if (!mockTest) {
      return reply.status(404).send({ error: "Mock test not found" });
    }

    // Check if user has exceeded maximum attempts
    const existingAttempts = await Result.countDocuments({
      student: userId,
      mockTest: testId,
    });

    if (existingAttempts >= mockTest.numberOfAttempts) {
      return reply.status(400).send({
        error: `Maximum attempts (${mockTest.numberOfAttempts}) reached for this test`,
      });
    }

    // Calculate results
    const transformedQuestions = mockTest.questions.map((question: any) => {
      let questionType = "multiple-choice";
      let options: string[] = [];
      let correctAnswer: string | string[] = "";

      if (question.options && question.options.length > 0) {
        options = question.options.map((opt: any) => opt.optionText);

        if (question.type === "multiple-select") {
          questionType = "multiple-select";
          correctAnswer = question.options
            .filter((opt: any) => opt.isCorrect)
            .map((opt: any) => opt.optionText);
        } else {
          const correctOpt = question.options.find((opt: any) => opt.isCorrect);
          correctAnswer = correctOpt ? correctOpt.optionText : "";
        }
      } else if (question.type === "true-false") {
        questionType = "true-false";
        options = ["True", "False"];
        correctAnswer = question.correctAnswer || "";
      } else if (question.type === "text") {
        questionType = "text";
        correctAnswer = question.correctAnswer || "";
      }

      return {
        _id: question._id,
        text: question.text,
        type: questionType,
        options,
        correctAnswer,
        marks: question.marks || mockTest.marksPerQuestion,
        difficulty: question.difficulty,
        subject: question.subject_id?.name || "General",
        category: question.category_id?.name || "General",
      };
    });

    // Process answers and calculate score
    let correctAnswers = 0;
    let incorrectAnswers = 0;
    let unansweredQuestions = 0;
    let totalScore = 0;

    const processedAnswers = transformedQuestions.map((question) => {
      const userAnswer = answers[question._id]?.answer || "";
      const timeTakenOnQuestion = answers[question._id]?.timeSpent || 0;

      let isCorrect = false;
      let marks = 0;

      const isAnswered =
        userAnswer &&
        ((typeof userAnswer === "string" && userAnswer.trim() !== "") ||
          (Array.isArray(userAnswer) && userAnswer.length > 0));

      if (!isAnswered) {
        unansweredQuestions++;
      } else {
        // Check if answer is correct
        if (question.type === "multiple-select") {
          const correctArr = Array.isArray(question.correctAnswer)
            ? question.correctAnswer
            : [];
          const userArr = Array.isArray(userAnswer) ? userAnswer : [];
          isCorrect =
            correctArr.length === userArr.length &&
            correctArr.every((ans) => userArr.includes(ans));
        } else {
          isCorrect = userAnswer === question.correctAnswer;
        }

        if (isCorrect) {
          correctAnswers++;
          marks = question.marks;
        } else {
          incorrectAnswers++;
          marks = -(mockTest.negativeMarking || 0);
        }

        totalScore += marks;
      }

      return {
        question: question._id,
        answer: userAnswer,
        correctAnswer: question.correctAnswer, // Store the correct answer for display
        isCorrect,
        marks,
        timeTaken: timeTakenOnQuestion,
      };
    });

    // Calculate detailed analysis
    const subjectWise: Record<string, any> = {};
    const difficultyWise: Record<string, any> = {};
    const categoryWise: Record<string, any> = {};

    transformedQuestions.forEach((question) => {
      const userAnswer = answers[question._id]?.answer || "";
      const isAnswered =
        userAnswer &&
        ((typeof userAnswer === "string" && userAnswer.trim() !== "") ||
          (Array.isArray(userAnswer) && userAnswer.length > 0));

      let isCorrect = false;
      if (isAnswered) {
        if (question.type === "multiple-select") {
          const correctArr = Array.isArray(question.correctAnswer)
            ? question.correctAnswer
            : [];
          const userArr = Array.isArray(userAnswer) ? userAnswer : [];
          isCorrect =
            correctArr.length === userArr.length &&
            correctArr.every((ans) => userArr.includes(ans));
        } else {
          isCorrect = userAnswer === question.correctAnswer;
        }
      }

      // Subject-wise analysis
      const subject = question.subject || "General";
      if (!subjectWise[subject]) {
        subjectWise[subject] = {
          attempted: 0,
          correct: 0,
          total: 0,
          percentage: 0,
        };
      }
      subjectWise[subject].total++;
      if (isAnswered) {
        subjectWise[subject].attempted++;
        if (isCorrect) subjectWise[subject].correct++;
      }

      // Difficulty-wise analysis
      const difficulty = question.difficulty || "Medium";
      if (!difficultyWise[difficulty]) {
        difficultyWise[difficulty] = {
          attempted: 0,
          correct: 0,
          total: 0,
          percentage: 0,
        };
      }
      difficultyWise[difficulty].total++;
      if (isAnswered) {
        difficultyWise[difficulty].attempted++;
        if (isCorrect) difficultyWise[difficulty].correct++;
      }

      // Category-wise analysis
      const category = question.category || "General";
      if (!categoryWise[category]) {
        categoryWise[category] = {
          attempted: 0,
          correct: 0,
          total: 0,
          percentage: 0,
        };
      }
      categoryWise[category].total++;
      if (isAnswered) {
        categoryWise[category].attempted++;
        if (isCorrect) categoryWise[category].correct++;
      }
    });

    // Calculate percentages
    [subjectWise, difficultyWise, categoryWise].forEach((analysis) => {
      Object.values(analysis).forEach((data: any) => {
        data.percentage =
          data.attempted > 0 ? (data.correct / data.attempted) * 100 : 0;
      });
    });

    const totalQuestions = transformedQuestions.length;
    const percentage =
      totalQuestions > 0 ? (totalScore / mockTest.totalMarks) * 100 : 0;
    const isPassed = totalScore >= mockTest.passingMarks;

    // Create result record
    const result = new Result({
      student: userId,
      mockTest: testId,
      startTime: new Date(Date.now() - timeTaken * 1000), // Calculate start time
      endTime: new Date(),
      score: Math.max(0, totalScore), // Ensure score is not negative
      answers: processedAnswers,
      totalMarks: mockTest.totalMarks,
      isPassed,
      attemptNumber: existingAttempts + 1,
      timeTaken,
      correctAnswers,
      incorrectAnswers,
      unansweredQuestions,
      percentage: Math.max(0, percentage),
      submissionType: isAutoSubmit ? "auto" : "manual",
      detailedAnalysis: {
        subjectWise,
        difficultyWise,
        categoryWise,
      },
    });

    await result.save();

    // Send response
    reply.send({
      message: "Test submitted successfully",
      result: {
        _id: result._id,
        score: result.score,
        totalMarks: result.totalMarks,
        percentage: result.percentage,
        correctAnswers,
        incorrectAnswers,
        unansweredQuestions,
        totalQuestions,
        isPassed,
        timeTaken,
        attemptNumber: result.attemptNumber,
      },
    });
  } catch (error: any) {
    console.error("Submit mock test error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get student's test results with pagination
export const getStudentResults = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    const { page = 1, limit = 10 } = request.query as {
      page?: number;
      limit?: number;
    };

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const skip = (page - 1) * limit;

    const results = await Result.find({ student: userId })
      .populate("mockTest", "title description totalMarks duration testType")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Result.countDocuments({ student: userId });

    // Filter out results with null mockTest (deleted tests) and transform
    const validResults = results.filter((result) => result.mockTest);
    const orphanedResultsCount = results.length - validResults.length;

    if (orphanedResultsCount > 0) {
      console.warn(
        `Found ${orphanedResultsCount} orphaned results (deleted tests) for student ${userId}`
      );
    }

    const transformedResults = validResults.map((result) => ({
      _id: result._id,
      testId: result.mockTest._id,
      testTitle: (result.mockTest as any).title,
      testDescription: (result.mockTest as any).description,
      testType: (result.mockTest as any).testType, // Add test type field
      score: result.score,
      totalMarks: result.totalMarks,
      percentage: result.percentage,
      correctAnswers: result.correctAnswers,
      incorrectAnswers: result.incorrectAnswers,
      unansweredQuestions: result.unansweredQuestions,
      totalQuestions:
        result.correctAnswers +
        result.incorrectAnswers +
        result.unansweredQuestions,
      timeTaken: result.timeTaken,
      isPassed: result.isPassed,
      attemptNumber: result.attemptNumber,
      submissionType: result.submissionType,
      completedAt: result.createdAt,
    }));

    reply.send({
      results: transformedResults,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (error: any) {
    console.error("Get student results error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get detailed result for a specific test attempt
export const getDetailedTestResult = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    const { resultId } = request.params as { resultId: string };

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const result = await Result.findOne({
      _id: resultId,
      student: userId,
    })
      .populate(
        "mockTest",
        "title description totalMarks duration passingMarks"
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
      return reply.status(404).send({ error: "Result not found" });
    }

    if (!result.mockTest) {
      return reply.status(404).send({ error: "Associated test not found" });
    }

    // For older results that don't have correctAnswer stored, we need to extract it from the question
    // Also filter out answers with null questions (deleted questions)
    const validAnswers = result.answers.filter(
      (answer: any) => answer.question
    );
    const questionWiseAnalysis = validAnswers.map((answer: any) => {
      let correctAnswer = answer.correctAnswer;

      // If correctAnswer is not stored (for older results), extract it from the question
      if (!correctAnswer && answer.question) {
        const question = answer.question;

        if (question.options && question.options.length > 0) {
          // Extract correct answers from options
          const correctOptions = question.options
            .filter((opt: any) => opt.isCorrect)
            .map((opt: any) => opt.optionText);

          if (correctOptions.length > 1) {
            correctAnswer = correctOptions; // Multiple correct answers
          } else {
            correctAnswer = correctOptions[0] || ""; // Single correct answer
          }
        } else if (question.type === "true-false") {
          correctAnswer = question.correctAnswer || "";
        } else if (question.type === "text") {
          correctAnswer = question.correctAnswer || "";
        } else {
          correctAnswer = question.correct_answer || "";
        }
      }

      return {
        questionId: answer.question._id,
        questionText: answer.question.text,
        userAnswer: answer.answer,
        correctAnswer: correctAnswer || "Not available",
        isCorrect: answer.isCorrect,
        marks: answer.marks,
        timeTaken: answer.timeTaken || 0,
        difficulty: answer.question.difficulty,
        subject: answer.question.subject_id?.name || "General",
        category: answer.question.category_id?.name || "General",
      };
    });

    // Transform the result for frontend
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
      detailedAnalysis: result.detailedAnalysis,
      questionWiseAnalysis,
    };

    reply.send(detailedResult);
  } catch (error: any) {
    console.error("Get detailed result error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Check if user can attempt a test (considering max attempts)
export const checkTestAttemptEligibility = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    const { testId } = request.params as { testId: string };

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const mockTest = await MockTest.findById(testId);
    if (!mockTest) {
      return reply.status(404).send({ error: "Mock test not found" });
    }

    const existingAttempts = await Result.countDocuments({
      student: userId,
      mockTest: testId,
    });

    const canAttempt = existingAttempts < mockTest.numberOfAttempts;
    const remainingAttempts = Math.max(
      0,
      mockTest.numberOfAttempts - existingAttempts
    );

    reply.send({
      canAttempt,
      totalAttempts: mockTest.numberOfAttempts,
      usedAttempts: existingAttempts,
      remainingAttempts,
    });
  } catch (error: any) {
    console.error("Check test attempt eligibility error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get test attempts for a specific test
export const getTestAttempts = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    const { testId } = request.params as { testId: string };

    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    // Get all attempts for this user and test
    const attempts = await Result.find({
      student: userId,
      mockTest: testId,
    })
      .populate("mockTest", "title totalMarks")
      .sort({ createdAt: -1 }); // Most recent first

    // Transform the attempts to match frontend expectations
    const transformedAttempts = attempts.map((attempt) => ({
      _id: attempt._id,
      score: attempt.score,
      totalMarks: attempt.totalMarks,
      correctAnswers: attempt.correctAnswers,
      incorrectAnswers: attempt.incorrectAnswers,
      totalQuestions:
        attempt.correctAnswers +
        attempt.incorrectAnswers +
        attempt.unansweredQuestions,
      timeTaken: attempt.timeTaken,
      completedAt: attempt.createdAt,
      percentage: attempt.percentage,
      attemptNumber: attempt.attemptNumber,
      isPassed: attempt.isPassed,
    }));

    reply.send(transformedAttempts);
  } catch (error: any) {
    console.error("Get test attempts error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get student profile with complete information
export const getProfile = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const student = await Student.findById(userId)
      .populate("roles")
      .select("-password");

    if (!student) {
      return reply.status(404).send({ error: "Student not found" });
    }

    // Build complete student profile response
    const profileResponse = {
      id: student.id,
      fullname: student.fullname,
      email: student.email,
      userType: student.userType,
      phone: student.phone,
      city: student.city,
      state: student.state,
      education: student.education,
      school: student.school,
      roles: student.roles,
      isVerified: student.isVerified,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    };

    logger.info("Student profile retrieved", { userId });
    reply.send({ user: profileResponse });
  } catch (error: any) {
    logger.error("Get student profile error", {
      error: error.message,
      stack: error.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Update student profile
export const updateProfile = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const { error, value } = updateStudentProfileSchema.validate(request.body);
    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    // Check if phone number already exists (if changing phone)
    if (value.phone) {
      const currentStudent = await Student.findById(userId);
      if (currentStudent && value.phone !== currentStudent.phone) {
        const existingPhoneUser = await User.findOne({ phone: value.phone });
        if (existingPhoneUser) {
          return reply
            .status(400)
            .send({ error: "Phone number already exists" });
        }
      }
    }

    // Update student profile
    const updatedStudent = await Student.findByIdAndUpdate(userId, value, {
      new: true,
      runValidators: true,
    })
      .populate("roles")
      .select("-password");

    if (!updatedStudent) {
      return reply.status(404).send({ error: "Student not found" });
    }

    // Build complete student profile response
    const profileResponse = {
      id: updatedStudent.id,
      fullname: updatedStudent.fullname,
      email: updatedStudent.email,
      userType: updatedStudent.userType,
      phone: updatedStudent.phone,
      city: updatedStudent.city,
      state: updatedStudent.state,
      education: updatedStudent.education,
      school: updatedStudent.school,
      roles: updatedStudent.roles,
      isVerified: updatedStudent.isVerified,
      createdAt: updatedStudent.createdAt,
      updatedAt: updatedStudent.updatedAt,
    };

    logger.info("Student profile updated", { userId });
    reply.send({
      message: "Profile updated successfully",
      user: profileResponse,
    });
  } catch (error: any) {
    logger.error("Update student profile error", {
      error: error.message,
      stack: error.stack,
    });
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Debug and troubleshooting function for package-mocktest issues
export const debugPackageMockTests = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const userId = request.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    console.log("=== DEBUGGING PACKAGE-MOCKTEST RELATIONSHIP ===");
    console.log("User ID:", userId);

    // 1. Check if student exists and has packages
    const student = await Student.findById(userId);
    if (!student) {
      return reply.status(404).send({ error: "Student not found" });
    }

    console.log("Student found:", {
      id: student._id,
      email: student.email,
      packagesCount: student.packages?.length || 0,
      packageIds: student.packages?.map((p) => p.toString()) || [],
    });

    // 2. Get all packages in database
    const allPackages = await Package.find();
    console.log("Total packages in database:", allPackages.length);

    // 3. Get all mock tests in database
    const allMockTests = await MockTest.find();
    console.log("Total mock tests in database:", allMockTests.length);
    console.log(
      "Published mock tests:",
      allMockTests.filter((mt) => mt.status === "Published").length
    );

    // 4. Check student's packages with populated mock tests
    const studentWithPackages = await Student.findById(userId).populate({
      path: "packages",
      populate: {
        path: "mockTests",
        select: "title description status",
      },
    });

    const studentPackages = studentWithPackages?.packages || [];
    console.log("Student packages with mock tests:");
    studentPackages.forEach((pkg: any, index: number) => {
      console.log(`Package ${index + 1}:`, {
        id: pkg._id,
        name: pkg.name,
        published: pkg.published,
        publicView: pkg.publicView,
        mockTestsCount: pkg.mockTests?.length || 0,
        mockTestIds: pkg.mockTests?.map((mt: any) => mt._id.toString()) || [],
        publishedMockTests:
          pkg.mockTests?.filter((mt: any) => mt.status === "Published")
            .length || 0,
      });
    });

    // 5. Verify package-mocktest relationships
    const packageDetails = await Promise.all(
      allPackages.map(async (pkg) => {
        const populatedPkg = await Package.findById(pkg._id).populate(
          "mockTests",
          "title status"
        );
        return {
          id: pkg._id,
          name: pkg.name,
          published: pkg.published,
          publicView: pkg.publicView,
          mockTestsRaw: pkg.mockTests.map((mt) => mt.toString()),
          mockTestsPopulated: populatedPkg?.mockTests || [],
          publishedMockTestsCount:
            populatedPkg?.mockTests?.filter(
              (mt: any) => mt.status === "Published"
            ).length || 0,
        };
      })
    );

    // 6. Check for orphaned mock tests (not assigned to any package)
    const assignedMockTestIds = new Set();
    packageDetails.forEach((pkg) => {
      pkg.mockTestsRaw.forEach((mtId) => assignedMockTestIds.add(mtId));
    });

    const orphanedMockTests = allMockTests.filter(
      (mt) => !assignedMockTestIds.has((mt._id as string).toString())
    );

    console.log(
      "Orphaned mock tests (not assigned to any package):",
      orphanedMockTests.length
    );

    // 7. Summary and recommendations
    const summary = {
      studentInfo: {
        id: userId,
        packagesCount: student.packages?.length || 0,
        hasPackages: (student.packages?.length || 0) > 0,
      },
      databaseInfo: {
        totalPackages: allPackages.length,
        totalMockTests: allMockTests.length,
        publishedMockTests: allMockTests.filter(
          (mt) => mt.status === "Published"
        ).length,
        packagesWithMockTests: packageDetails.filter(
          (pkg) => pkg.mockTestsRaw.length > 0
        ).length,
        orphanedMockTests: orphanedMockTests.length,
      },
      studentPackages: packageDetails.filter((pkg) =>
        student.packages?.some(
          (sp) => sp.toString() === (pkg.id as string).toString()
        )
      ),
      recommendations: [] as string[],
    };

    // Generate recommendations
    if (summary.studentInfo.packagesCount === 0) {
      summary.recommendations.push(
        "Student has no packages. Purchase a package first."
      );
    }

    if (summary.databaseInfo.totalMockTests === 0) {
      summary.recommendations.push(
        "No mock tests in database. Create mock tests first."
      );
    }

    if (summary.databaseInfo.publishedMockTests === 0) {
      summary.recommendations.push(
        "No published mock tests. Publish mock tests to make them available."
      );
    }

    if (summary.databaseInfo.packagesWithMockTests === 0) {
      summary.recommendations.push(
        "No packages have mock tests assigned. Assign mock tests to packages."
      );
    }

    const studentPackagesWithMockTests = summary.studentPackages.filter(
      (pkg) => pkg.mockTestsRaw.length > 0
    );
    if (studentPackagesWithMockTests.length === 0) {
      summary.recommendations.push(
        "Student's packages have no mock tests assigned. Assign mock tests to the student's packages."
      );
    }

    console.log("=== SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));

    reply.send({
      summary,
      allPackages: packageDetails,
      orphanedMockTests: orphanedMockTests.map((mt) => ({
        id: mt._id,
        title: mt.title,
        status: mt.status,
      })),
    });
  } catch (error: any) {
    console.error("Debug error:", error);
    reply.status(500).send({
      error: "Debug failed",
      message: error.message,
      stack: error.stack,
    });
  }
};

// Helper function to assign mock tests to packages (for admin use)
export const assignMockTestsToPackages = async (
  request: AuthenticatedRequest,
  reply: FastifyReply
) => {
  try {
    const { packageId, mockTestIds } = request.body as {
      packageId: string;
      mockTestIds: string[];
    };

    if (!packageId || !mockTestIds || !Array.isArray(mockTestIds)) {
      return reply.status(400).send({
        error: "packageId and mockTestIds (array) are required",
      });
    }

    // Verify package exists
    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return reply.status(404).send({ error: "Package not found" });
    }

    // Verify mock tests exist
    const mockTests = await MockTest.find({ _id: { $in: mockTestIds } });
    if (mockTests.length !== mockTestIds.length) {
      return reply.status(404).send({
        error: "Some mock tests not found",
        requested: mockTestIds.length,
        found: mockTests.length,
      });
    }

    // Assign mock tests to package
    pkg.mockTests = mockTestIds as any;
    await pkg.save();

    console.log(
      `Assigned ${mockTestIds.length} mock tests to package ${pkg.name}`
    );

    reply.send({
      message: "Mock tests assigned successfully",
      package: {
        id: pkg._id,
        name: pkg.name,
        assignedMockTests: mockTestIds.length,
      },
    });
  } catch (error: any) {
    console.error("Assign mock tests error:", error);
    reply.status(500).send({
      error: "Failed to assign mock tests",
      message: error.message,
    });
  }
};
