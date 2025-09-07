import { FastifyRequest, FastifyReply } from "fastify";
import User, { Student, Admin } from "../models/User";
import { Question } from "../models/Question";
import { MockTest } from "../models/MockTest";
import Package from "../models/Package";
import { Result } from "../models/Result";
import Category from "../models/Category";
import Subject from "../models/Subject";
import Level from "../models/Level";
import Purchase from "../models/Purchase";
import { Media } from "../models/Media";
import logger from "../config/logger";

// Get comprehensive dashboard statistics
export const getDashboardStats = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    logger.info("Fetching dashboard statistics");

    // Basic counts
    const [
      totalUsers,
      totalStudents,
      totalAdmins,
      totalQuestions,
      totalMockTests,
      totalPackages,
      totalResults,
      totalCategories,
      totalSubjects,
      totalLevels,
      totalPurchases,
      totalMedia,
    ] = await Promise.all([
      User.countDocuments(),
      Student.countDocuments(),
      Admin.countDocuments(),
      Question.countDocuments(),
      MockTest.countDocuments(),
      Package.countDocuments(),
      Result.countDocuments(),
      Category.countDocuments(),
      Subject.countDocuments(),
      Level.countDocuments(),
      Purchase.countDocuments(),
      Media.countDocuments(),
    ]);

    // User analytics - new registrations in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newUsersLast30Days = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Test performance metrics
    const testPerformanceAgg = await Result.aggregate([
      {
        $group: {
          _id: null,
          totalAttempts: { $sum: 1 },
          passedAttempts: {
            $sum: { $cond: [{ $eq: ["$isPassed", true] }, 1, 0] },
          },
          totalScore: { $sum: "$score" },
          totalMarks: { $sum: "$totalMarks" },
          averagePercentage: { $avg: "$percentage" },
        },
      },
    ]);

    const testPerformance = testPerformanceAgg[0] || {
      totalAttempts: 0,
      passedAttempts: 0,
      totalScore: 0,
      totalMarks: 0,
      averagePercentage: 0,
    };

    const passPercentage =
      testPerformance.totalAttempts > 0
        ? (testPerformance.passedAttempts / testPerformance.totalAttempts) * 100
        : 0;

    const averageScore =
      testPerformance.totalMarks > 0
        ? (testPerformance.totalScore / testPerformance.totalMarks) * 100
        : 0;

    // Recent results (last 10)
    const recentResults = await Result.find()
      .populate("student", "fullname")
      .populate("mockTest", "title")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Recent users (last 10)
    const recentUsers = await User.find()
      .select("fullname email userType createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Popular categories (by question count)
    const popularCategories = await Category.aggregate([
      {
        $lookup: {
          from: "questions",
          localField: "_id",
          foreignField: "category_id",
          as: "questions",
        },
      },
      {
        $project: {
          name: 1,
          questionCount: { $size: "$questions" },
        },
      },
      { $sort: { questionCount: -1 } },
      { $limit: 5 },
    ]);

    // Package statistics
    const packageStats = await Package.aggregate([
      {
        $group: {
          _id: null,
          publishedPackages: {
            $sum: { $cond: [{ $eq: ["$published", true] }, 1, 0] },
          },
          draftPackages: {
            $sum: { $cond: [{ $eq: ["$published", false] }, 1, 0] },
          },
          totalRevenue: { $sum: "$price" },
        },
      },
    ]);

    // Monthly user registrations (last 12 months)
    const monthlyRegistrations = await User.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Test completion trends (last 12 months)
    const testCompletionTrends = await Result.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)),
          },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalTests: { $sum: 1 },
          passedTests: {
            $sum: { $cond: [{ $eq: ["$isPassed", true] }, 1, 0] },
          },
          averageScore: { $avg: "$percentage" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Subject-wise performance
    const subjectPerformance = await Result.aggregate([
      {
        $lookup: {
          from: "mocktests",
          localField: "mockTest",
          foreignField: "_id",
          as: "testDetails",
        },
      },
      {
        $lookup: {
          from: "questions",
          localField: "testDetails.questions",
          foreignField: "_id",
          as: "questions",
        },
      },
      {
        $lookup: {
          from: "subjects",
          localField: "questions.subject_id",
          foreignField: "_id",
          as: "subjects",
        },
      },
      {
        $unwind: "$subjects",
      },
      {
        $group: {
          _id: "$subjects.name",
          totalAttempts: { $sum: 1 },
          averageScore: { $avg: "$percentage" },
          passRate: {
            $avg: { $cond: [{ $eq: ["$isPassed", true] }, 1, 0] },
          },
        },
      },
      { $sort: { averageScore: -1 } },
      { $limit: 10 },
    ]);

    // Revenue analytics - Fix to use correct purchase status
    const revenueAnalytics = await Purchase.aggregate([
      {
        $match: { status: "captured" }, // Changed from "completed" to "captured"
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalSales: { $sum: 1 },
          averageOrderValue: { $avg: "$amount" },
        },
      },
    ]);

    // Recent purchases (last 10 successful purchases)
    const recentPurchases = await Purchase.find({ status: "captured" })
      .populate("user", "fullname")
      .populate("package", "name title")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // System health metrics
    const systemHealth = {
      activeTests: await MockTest.countDocuments({ status: "Published" }),
      draftTests: await MockTest.countDocuments({ status: "Draft" }),
      mediaStorage: await Media.aggregate([
        {
          $group: {
            _id: null,
            totalSize: { $sum: "$size" },
            totalFiles: { $sum: 1 },
          },
        },
      ]),
    };

    // Top performing students
    const topStudents = await Result.aggregate([
      {
        $group: {
          _id: "$student",
          averageScore: { $avg: "$percentage" },
          totalTests: { $sum: 1 },
          totalPassed: {
            $sum: { $cond: [{ $eq: ["$isPassed", true] }, 1, 0] },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "studentInfo",
        },
      },
      {
        $unwind: "$studentInfo",
      },
      {
        $project: {
          name: "$studentInfo.fullname",
          email: "$studentInfo.email",
          averageScore: { $round: ["$averageScore", 2] },
          totalTests: 1,
          totalPassed: 1,
          passRate: {
            $round: [
              {
                $multiply: [{ $divide: ["$totalPassed", "$totalTests"] }, 100],
              },
              2,
            ],
          },
        },
      },
      { $sort: { averageScore: -1 } },
      { $limit: 10 },
    ]);

    const response = {
      // Basic counts
      totalUsers,
      totalStudents,
      totalAdmins,
      totalQuestions,
      totalMockTests,
      totalPackages,
      totalResults,
      totalCategories,
      totalSubjects,
      totalLevels,
      totalPurchases,
      totalMedia,

      // Growth metrics
      newUsersLast30Days,
      userGrowthRate:
        totalUsers > 0 ? (newUsersLast30Days / totalUsers) * 100 : 0,

      // Test performance
      testPerformance: {
        totalAttempts: testPerformance.totalAttempts,
        passedAttempts: testPerformance.passedAttempts,
        averageScore: Math.round(averageScore),
        passPercentage: Math.round(passPercentage),
        averagePercentage: Math.round(testPerformance.averagePercentage || 0),
      },

      // Recent activity
      recentResults: recentResults.map((result) => ({
        _id: result._id,
        student: result.student,
        mockTest: result.mockTest,
        score: result.score,
        totalMarks: result.totalMarks,
        percentage: Math.round(result.percentage),
        isPassed: result.isPassed,
        createdAt: result.createdAt,
      })),

      recentUsers: recentUsers.map((user) => ({
        _id: user._id,
        fullname: user.fullname,
        email: user.email,
        userType: user.userType,
        createdAt: user.createdAt,
      })),

      // Popular content
      popularCategories,
      subjectPerformance,
      topStudents,

      // Package and revenue
      packageStats: packageStats[0] || {
        publishedPackages: 0,
        draftPackages: 0,
        totalRevenue: 0,
      },

      revenueAnalytics: {
        totalRevenue: revenueAnalytics[0]?.totalRevenue || 0,
        totalSales: revenueAnalytics[0]?.totalSales || 0,
        averageOrderValue: revenueAnalytics[0]?.averageOrderValue || 0,
        recentPurchases: recentPurchases.map((purchase: any) => ({
          _id: purchase._id,
          amount: purchase.amount,
          createdAt: purchase.createdAt,
          user: { fullname: purchase.user?.fullname || "Unknown User" },
          package: {
            title:
              purchase.package?.title ||
              purchase.package?.name ||
              "Unknown Package",
          },
        })),
      },

      // Trends
      monthlyRegistrations,
      testCompletionTrends,

      // System health
      systemHealth: {
        activeTests: systemHealth.activeTests,
        draftTests: systemHealth.draftTests,
        mediaStorage: systemHealth.mediaStorage[0] || {
          totalSize: 0,
          totalFiles: 0,
        },
      },

      // Metadata
      generatedAt: new Date(),
      cacheTTL: 300, // 5 minutes cache recommendation
    };

    logger.info("Dashboard statistics fetched successfully");
    reply.send(response);
  } catch (error: any) {
    logger.error("Error fetching dashboard statistics", {
      error: error.message,
    });
    reply.status(500).send({
      error: "Failed to fetch dashboard statistics",
      message: error.message,
    });
  }
};

// Get real-time metrics (lighter version for frequent updates)
export const getRealTimeMetrics = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const [activeUsers, ongoingTests, todayRegistrations, todayResults] =
      await Promise.all([
        User.countDocuments(),
        Result.countDocuments({
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }),
        User.countDocuments({
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }),
        Result.countDocuments({
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }),
      ]);

    reply.send({
      activeUsers,
      ongoingTests,
      todayRegistrations,
      todayResults,
      timestamp: new Date(),
    });
  } catch (error: any) {
    logger.error("Error fetching real-time metrics", { error: error.message });
    reply.status(500).send({
      error: "Failed to fetch real-time metrics",
      message: error.message,
    });
  }
};

// Get system health status
export const getSystemHealth = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const healthChecks = {
      database: true, // Basic check - if we can run queries, DB is up
      storage: (await Media.countDocuments()) >= 0,
      services: {
        questionBank: (await Question.countDocuments()) >= 0,
        testEngine: (await MockTest.countDocuments()) >= 0,
        userManagement: (await User.countDocuments()) >= 0,
      },
      timestamp: new Date(),
    };

    const allHealthy =
      healthChecks.database &&
      healthChecks.storage &&
      Object.values(healthChecks.services).every(Boolean);

    reply.send({
      status: allHealthy ? "healthy" : "warning",
      checks: healthChecks,
    });
  } catch (error: any) {
    logger.error("Error checking system health", { error: error.message });
    reply.status(503).send({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date(),
    });
  }
};
