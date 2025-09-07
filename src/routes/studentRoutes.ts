import { FastifyInstance, FastifyPluginOptions } from "fastify";
import { checkRoles } from "../middleware/rbacMiddleware";
import {
  getDashboardData,
  getPurchasedPackages,
  purchasePackage,
  getAvailableMockTests,
  getMockTest,
  submitMockTest,
  getStudentResults,
  getDetailedTestResult,
  checkTestAttemptEligibility,
  getTestAttempts,
  getProfile,
  updateProfile,
  debugPackageMockTests,
  assignMockTestsToPackages,
} from "../controllers/studentController";
import { getAvailablePackages } from "../controllers/packageController";

async function studentRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // All routes require student role
  const studentOnly = [checkRoles(["student"])];

  // Profile routes
  fastify.get("/profile", { preHandler: studentOnly }, getProfile);
  fastify.put("/profile", { preHandler: studentOnly }, updateProfile);

  // Dashboard data
  fastify.get("/dashboard", { preHandler: studentOnly }, getDashboardData);

  // Packages
  fastify.get("/packages", { preHandler: studentOnly }, getAvailablePackages);
  fastify.get("/purchased-packages", { preHandler: studentOnly }, getPurchasedPackages);
  fastify.post("/purchase", { preHandler: studentOnly }, purchasePackage);

  // Mock tests
  fastify.get(
    "/mock-tests",
    { preHandler: studentOnly },
    getAvailableMockTests
  );
  fastify.get("/mock-tests/:testId", { preHandler: studentOnly }, getMockTest);
  fastify.get(
    "/mock-tests/:testId/start",
    { preHandler: studentOnly },
    getMockTest
  );
  fastify.get(
    "/mock-tests/:testId/attempts",
    { preHandler: studentOnly },
    getTestAttempts
  );
  fastify.get(
    "/mock-tests/:testId/eligibility",
    { preHandler: studentOnly },
    checkTestAttemptEligibility
  );
  fastify.post(
    "/mock-tests/:testId/submit",
    { preHandler: studentOnly },
    submitMockTest
  );

  // Test results
  fastify.get("/results", { preHandler: studentOnly }, getStudentResults);
  fastify.get(
    "/results/:resultId/detailed",
    { preHandler: studentOnly },
    getDetailedTestResult
  );

  // Debug endpoints (temporary)
  fastify.get(
    "/debug/packages",
    { preHandler: studentOnly },
    debugPackageMockTests
  );
  fastify.post(
    "/debug/assign-tests",
    { preHandler: studentOnly },
    assignMockTestsToPackages
  );

  fastify.get(
    "/debug/simple",
    { preHandler: studentOnly },
    async (request, reply) => {
      try {
        const userId = (request as any).user?.id;
        const Student = require("../models/User").Student;
        const Package = require("../models/Package").default;

        // Get student with packages
        const student = await Student.findById(userId).populate({
          path: "packages",
          populate: {
            path: "mockTests",
            select: "title description status",
          },
        });

        // Get all packages in database
        const allPackages = await Package.find().populate(
          "mockTests",
          "title status"
        );

        reply.send({
          studentId: userId,
          studentPackages: student?.packages || [],
          allPackages: allPackages.map((pkg: any) => ({
            id: pkg._id,
            name: pkg.name,
            published: pkg.published,
            publicView: pkg.publicView,
            mockTestsCount: pkg.mockTests?.length || 0,
            mockTests: pkg.mockTests || [],
          })),
        });
      } catch (error: any) {
        reply
          .status(500)
          .send({ error: "Debug endpoint failed", message: error.message });
      }
    }
  );
}

export default studentRoutes;
