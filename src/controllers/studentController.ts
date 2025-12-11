import { FastifyRequest, FastifyReply } from "fastify";
import User, { Student } from "../models/User";
import Package from "../models/Package";
import Purchase from "../models/Purchase";
import { Result } from "../models/Result";
import { MockTest } from "../models/MockTest";
import { Question } from "../models/Question";

interface TestRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Get dashboard data for a student
export const getDashboardData = async (
  request: TestRequest,
  reply: FastifyReply
) => {
  try {
    // Temporarily remove auth for testing
    const userId = "68615116798897f13973b81c"; // Real user ID for testing

    // Mock performance data - replace with actual data from your system
    const performanceData = {
      totalTests: 0,
      averageScore: 0,
      completedTests: 0,
      rank: 0,
    };

    reply.send({
      packages: [],
      performance: performanceData,
      mockTests: [], // Will be populated from actual mock tests
    });
  } catch (error: any) {
    console.error("Get dashboard data error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get purchased packages for a student from Purchase collection
export const getPurchasedPackages = async (
  request: TestRequest,
  reply: FastifyReply
) => {
  try {
    // Find user by email if no authenticated user
    let userId = (request as any).user?.id;

    if (!userId) {
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      userId = user?._id;
    }

    console.log("DEBUG: Fetching purchased packages for user:", userId);
    console.log("DEBUG: User from request:", (request as any).user);

    // Find all successful purchases for this user

    const purchases = await Purchase.find({
      user: userId,
      status: "captured"
    }).populate({
      path: "package",
      select: "name description price originalPrice discountPercentage validityDays files links mockTests",
      populate: {
        path: "mockTests",
        select: "title description duration totalMarks status testType",
      },
    });

    console.log("DEBUG: Found purchases:", {
      userId: userId,
      purchaseCount: purchases.length,
      purchaseIds: purchases.map(p => p._id)
    });

    // Extract packages with purchase details
    const packagesWithDetails = purchases.map((purchase: any) => {
      const pkg = purchase.package;

      console.log("DEBUG: Processing purchase:", {
        purchaseId: purchase._id,
        packageId: pkg._id,
        packageName: pkg.name,
        purchaseDate: purchase.createdAt,
        mockTestsCount: pkg.mockTests?.length || 0
      });

      // Calculate expiry date (30 days from purchase)
      const validityDays = pkg.validityDays || 30;
      const purchaseDate = new Date(purchase.createdAt);
      const expiryDate = new Date(purchaseDate.getTime() + (validityDays * 24 * 60 * 60 * 1000));

      return {
        _id: pkg._id,
        name: pkg.name,
        description: pkg.description,
        price: pkg.price,
        originalPrice: pkg.originalPrice,
        discountPercentage: pkg.discountPercentage,
        validityDays: validityDays,
        duration: validityDays, // Keep compatibility
        mockTests: pkg.mockTests || [],
        files: pkg.files || [],
        links: pkg.links || [],
        purchaseDate: purchaseDate.toISOString(),
        expiryDate: expiryDate.toISOString(),
        isActive: expiryDate > new Date(),
        purchaseId: purchase._id
      };
    });

    console.log("DEBUG: Sending packages to frontend:", {
      count: packagesWithDetails.length,
      packages: packagesWithDetails.map((pkg: any) => ({
        id: pkg._id,
        name: pkg.name,
        mockTestsCount: pkg.mockTests?.length || 0,
        isActive: pkg.isActive
      }))
    });

    reply.send(packagesWithDetails);
  } catch (error: any) {
    console.error("Get purchased packages error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get available packages for purchase
export const getAvailablePackages = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const packages = await Package.find({
      published: true,
      publicView: true,
    }).populate("mockTests", "title description duration totalMarks");

    reply.send(packages);
  } catch (error: any) {
    console.error("Get available packages error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Purchase a package (placeholder - actual implementation in purchaseController)
export const purchasePackage = async (
  request: TestRequest,
  reply: FastifyReply
) => {
  reply.status(501).send({ error: "Not implemented - use purchase controller" });
};

// Get available mock tests for a student
export const getAvailableMockTests = async (
  request: TestRequest,
  reply: FastifyReply
) => {
  try {
    let userId = (request as any).user?.id;
    if (!userId) {
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      userId = user?._id;
    }

    console.log("🔍 Fetching available mock tests for user:", userId);

    // Find all successful purchases for this user
    const purchases = await Purchase.find({
      user: userId,
      status: "captured"
    }).populate({
      path: "package",
      populate: {
        path: "mockTests",
        select: "title description duration totalMarks status testType numberOfQuestions",
      },
    });

    // Extract all mock tests from purchased packages
    const availableMockTests: any[] = [];

    purchases.forEach((purchase: any) => {
      const pkg = purchase.package;
      if (pkg && pkg.mockTests) {
        pkg.mockTests.forEach((mockTest: any) => {
          // Only include published mock tests
          if (mockTest.status === 'Published') {
            availableMockTests.push({
              ...mockTest.toObject(),
              packageName: pkg.name,
              purchaseId: purchase._id
            });
          }
        });
      }
    });

    console.log("✅ Found available mock tests:", availableMockTests.length);

    reply.send(availableMockTests);
  } catch (error: any) {
    console.error("❌ Get available mock tests error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Get a specific mock test
export const getMockTest = async (
  request: TestRequest,
  reply: FastifyReply
) => {
  try {
    const { id: testId } = request.params as { id: string };
    console.log("🔍 Fetching mock test with ID:", testId);

    // Get mock test with populated questions
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
      console.log("❌ Mock test not found");
      return reply.status(404).send({ error: "Mock test not found" });
    }

    console.log("✅ Mock test found:", {
      title: mockTest.title,
      questionsCount: mockTest.questions?.length || 0,
      duration: mockTest.duration,
      totalMarks: mockTest.totalMarks
    });

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

    reply.send(mockTestObj);
  } catch (error: any) {
    console.error("❌ Get mock test error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

// Submit mock test and calculate results
export const submitMockTest = async (request: TestRequest, reply: FastifyReply) => {
  try {
    console.log("🚀 Starting test submission...");
    const { id: testId } = request.params as { id: string };
    const { answers } = request.body as { answers: Array<{ questionId: string; selectedOption: number }> };

    console.log("📝 Test ID:", testId);
    console.log("📝 Answers received:", answers?.length || 0);

    let userId = (request as any).user?.id;
    if (!userId) {
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      userId = user?._id;
    }

    console.log("👤 User ID:", userId);

    // Get mock test details with populated questions
    console.log("🔍 Finding mock test...");
    const mockTest = await MockTest.findById(testId).populate('questions');
    if (!mockTest) {
      console.log("❌ Mock test not found");
      return reply.status(404).send({ error: "Mock test not found" });
    }
    console.log("✅ Mock test found:", mockTest.title);

    // Get questions from the mock test
    const questions = mockTest.questions;
    if (!questions.length) {
      console.log("❌ No questions found");
      return reply.status(404).send({ error: "No questions found for this test" });
    }
    console.log("✅ Questions found:", questions.length);

    // Calculate results
    let correctAnswers = 0;
    let incorrectAnswers = 0;
    let score = 0;
    const processedAnswers = [];

    for (const question of questions) {
      const q = question as any; // Type assertion for populated question
      const userAnswer = answers.find(a => a.questionId === q._id.toString());

      // Find the correct answer from options
      let correctAnswerIndex = -1;
      if (q.options) {
        correctAnswerIndex = q.options.findIndex((opt: any) => opt.isCorrect === true);
      }

      const isCorrect = userAnswer && userAnswer.selectedOption === correctAnswerIndex;

      if (userAnswer) {
        if (isCorrect) {
          correctAnswers++;
          score += mockTest.marksPerQuestion || 1;
        } else {
          incorrectAnswers++;
          // Apply negative marking if configured
          if (mockTest.negativeMarking) {
            score -= mockTest.negativeMarking;
          }
        }
      }

      processedAnswers.push({
        question: q._id,
        answer: userAnswer?.selectedOption?.toString() || "",
        correctAnswer: correctAnswerIndex.toString(),
        isCorrect: !!isCorrect,
        marks: isCorrect ? (mockTest.marksPerQuestion || 1) : (mockTest.negativeMarking ? -mockTest.negativeMarking : 0)
      });
    }

    const unansweredQuestions = questions.length - answers.length;
    const totalMarks = mockTest.totalMarks;
    const percentage = totalMarks > 0 ? (score / totalMarks) * 100 : 0;
    const isPassed = score >= mockTest.passingMarks;

    // Check for existing attempts for this package-test combination
    const { packageId } = request.body as { packageId?: string };
    let existingResults;
    if (packageId) {
      // For package-specific submissions, only count attempts with this package
      existingResults = await Result.find({
        student: userId,
        mockTest: testId,
        package: packageId
      });
    } else {
      // For non-package submissions, count all attempts
      existingResults = await Result.find({
        student: userId,
        mockTest: testId
      });
    }
    const attemptNumber = existingResults.length + 1;

    // Create result record
    console.log("💾 Creating result record...");
    console.log("📊 Calculated results:", {
      score,
      correctAnswers,
      incorrectAnswers,
      unansweredQuestions,
      percentage,
      totalMarks,
      isPassed
    });

    const result = new Result({
      student: userId,
      mockTest: testId,
      package: packageId || undefined,
      startTime: new Date(Date.now() - (mockTest.duration * 60 * 1000)), // Approximate start time
      endTime: new Date(),
      score,
      answers: processedAnswers,
      totalMarks,
      isPassed,
      attemptNumber,
      timeTaken: mockTest.duration * 60, // Full duration for now
      totalQuestions: questions.length,
      correctAnswers,
      incorrectAnswers,
      unansweredQuestions,
      percentage,
      submissionType: "manual"
    });

    console.log("💾 Saving result to database...");
    const savedResult = await result.save();
    console.log("✅ Result saved with ID:", savedResult._id);

    console.log("📤 Sending response...");
    reply.send({
      success: true,
      resultId: savedResult._id,
      score,
      percentage,
      correctAnswers,
      incorrectAnswers,
      unansweredQuestions,
      isPassed
    });
  } catch (error: any) {
    console.error("❌ Submit mock test error:", error.message);
    console.error("❌ Full error:", error);
    reply.status(500).send({ error: "Internal Server Error", details: error.message });
  }
};

export const getStudentResults = async (request: TestRequest, reply: FastifyReply) => {
  try {
    const { packageId } = request.query as { packageId?: string };

    let userId = (request as any).user?.id;
    if (!userId) {
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      userId = user?._id;
    }

    const query: any = { student: userId };
    if (packageId) {
      query.package = packageId;
    }

    const results = await Result.find(query)
      .populate('mockTest', 'title description duration totalMarks')
      .sort({ attemptNumber: -1, createdAt: -1 });

    reply.send(results);
  } catch (error: any) {
    console.error("Get student results error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

export const getDetailedTestResult = async (request: TestRequest, reply: FastifyReply) => {
  try {
    const { id: testId } = request.params as { id: string };
    const { packageId } = request.query as { packageId?: string };

    let userId = (request as any).user?.id;
    if (!userId) {
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      userId = user?._id;
    }

    const query: any = { student: userId, mockTest: testId };
    if (packageId) {
      query.package = packageId;
    }

    const results = await Result.find(query)
      .populate('mockTest', 'title description duration totalMarks')
      .populate('answers.question', 'question options correctAnswer')
      .sort({ attemptNumber: -1 });

    if (!results.length) {
      return reply.status(404).send({ error: "Results not found" });
    }

    reply.send(results);
  } catch (error: any) {
    console.error("Get detailed test result error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

export const checkTestAttemptEligibility = async (request: TestRequest, reply: FastifyReply) => {
  try {
    const { id: testId } = request.params as { id: string };
    const { packageId } = request.query as { packageId?: string };

    let userId = (request as any).user?.id;
    if (!userId) {
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      userId = user?._id;
    }

    // Get mock test details
    const mockTest = await MockTest.findById(testId);
    if (!mockTest) {
      return reply.status(404).send({ error: "Mock test not found" });
    }

    // Check existing attempts for this specific package-test combination
    let existingAttempts;
    if (packageId) {
      // For package-specific requests, only count attempts with this package
      existingAttempts = await Result.find({
        student: userId,
        mockTest: testId,
        package: packageId
      });
    } else {
      // For non-package requests, count all attempts
      existingAttempts = await Result.find({
        student: userId,
        mockTest: testId
      });
    }
    const maxAttempts = mockTest.numberOfAttempts || 1;
    const attemptsUsed = existingAttempts.length;
    const remainingAttempts = Math.max(0, maxAttempts - attemptsUsed);
    const canAttempt = remainingAttempts > 0;

    reply.send({
      canAttempt,
      attemptsUsed,
      maxAttempts,
      remainingAttempts
    });
  } catch (error: any) {
    console.error("Check test attempt eligibility error:", error.message);
    reply.status(500).send({ error: "Internal Server Error" });
  }
};

export const getTestAttempts = async (request: TestRequest, reply: FastifyReply) => {
  reply.status(501).send({ error: "Not implemented" });
};

// Profile functions (placeholders)
export const getProfile = async (request: TestRequest, reply: FastifyReply) => {
  reply.status(501).send({ error: "Not implemented" });
};

export const updateProfile = async (request: TestRequest, reply: FastifyReply) => {
  reply.status(501).send({ error: "Not implemented" });
};

// Debug functions (placeholders)
export const debugPackageMockTests = async (request: TestRequest, reply: FastifyReply) => {
  reply.status(501).send({ error: "Not implemented" });
};

export const assignMockTestsToPackages = async (request: TestRequest, reply: FastifyReply) => {
  reply.status(501).send({ error: "Not implemented" });
};

// Get specific detailed result for a student (reuses structure from admin view)
export const getStudentResultDetail = async (
  request: TestRequest,
  reply: FastifyReply
) => {
  try {
    const { id: resultId } = request.params as { id: string };

    let userId = (request as any).user?.id;
    if (!userId) {
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      userId = user?._id;
    }

    // Find result and ensure it belongs to the student
    const result = await Result.findOne({ _id: resultId, student: userId })
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
      return reply.status(404).send({ message: "Result not found" });
    }

    // Transform the result for student view with complete data (Same as Admin)
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
      questionWiseAnalysis: result.answers.map((answer: any) => ({
        questionId: answer.question._id,
        questionText: answer.question.text,
        options: answer.question.options,
        userAnswer: answer.answer || answer.selectedAnswer,
        correctAnswer: answer.question.correctAnswer,
        isCorrect: answer.isCorrect,
        marks: answer.marks,
        timeTaken: answer.timeTaken || 0,
        difficulty: answer.question.difficulty,
        subject: answer.question.subject_id?.name || "General",
        category: answer.question.category_id?.name || "General",
        explanation: answer.question.explanation || "",
      })),
    };

    reply.send(detailedResult);
  } catch (error) {
    console.error("Error fetching detailed result for student:", error);
    reply.status(500).send({ message: "Error fetching result details", error });
  }
};