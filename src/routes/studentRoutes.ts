import { FastifyInstance, FastifyPluginOptions } from "fastify";
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
  getStudentResultDetail,
} from "../controllers/studentController";
import { getAvailablePackages } from "../controllers/packageController";
import { checkRoles } from "../middleware/rbacMiddleware";

async function studentRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  // Profile routes
  fastify.get("/profile", { preHandler: [checkRoles(["student"])] }, getProfile);
  fastify.put("/profile", { preHandler: [checkRoles(["student"])] }, updateProfile);

  // Dashboard data
  fastify.get("/dashboard", { preHandler: [checkRoles(["student"])] }, getDashboardData);

  // Packages
  fastify.get("/packages", { preHandler: [checkRoles(["student"])] }, getAvailablePackages);
  fastify.get("/purchased-packages", { preHandler: [checkRoles(["student"])] }, getPurchasedPackages);
  fastify.post("/purchase", { preHandler: [checkRoles(["student"])] }, purchasePackage);

  // Mock tests
  fastify.get("/mock-tests", { preHandler: [checkRoles(["student"])] }, getAvailableMockTests);
  fastify.get("/mock-tests/:id", { preHandler: [checkRoles(["student"])] }, getMockTest);
  fastify.get("/mock-tests/:id/start", { preHandler: [checkRoles(["student"])] }, getMockTest);
  fastify.get("/mock-tests/:id/attempts", { preHandler: [checkRoles(["student"])] }, getTestAttempts);
  fastify.get("/mock-tests/:id/eligibility", { preHandler: [checkRoles(["student"])] }, checkTestAttemptEligibility);
  fastify.post("/mock-tests/:id/submit", { preHandler: [checkRoles(["student"])] }, submitMockTest);

  // Test results
  fastify.get("/results", { preHandler: [checkRoles(["student"])] }, getStudentResults);
  fastify.get("/results/detail/:id", { preHandler: [checkRoles(["student"])] }, getStudentResultDetail);
  fastify.get("/results/:id", { preHandler: [checkRoles(["student"])] }, getDetailedTestResult);

  // Debug endpoints (temporary) - admin only
  fastify.get("/debug/packages", { preHandler: [checkRoles(["admin"])] }, debugPackageMockTests);
  fastify.post("/debug/assign-tests", { preHandler: [checkRoles(["admin"])] }, assignMockTestsToPackages);

  fastify.get("/debug/user-purchases", { preHandler: [checkRoles(["admin"])] }, async (request, reply) => {
    try {
      const User = require("../models/User").default;
      const Purchase = require("../models/Purchase").default;

      // Find user by email
      const user = await User.findOne({ email: "daniel@inovitrix.com" });
      console.log("DEBUG: Found user:", user ? { id: user._id, email: user.email } : "Not found");

      if (user) {
        // Find all purchases for this user
        const purchases = await Purchase.find({ user: user._id });
        console.log("DEBUG: Found purchases for user:", purchases.length);

        reply.send({
          user: { id: user._id, email: user.email },
          purchases: purchases.map((p: any) => ({
            id: p._id,
            status: p.status,
            package: p.package,
            createdAt: p.createdAt
          }))
        });
      } else {
        reply.send({ error: "User not found" });
      }
    } catch (error: any) {
      reply.status(500).send({ error: error.message });
    }
  });

  fastify.get("/debug/simple", { preHandler: [checkRoles(["admin"])] }, async (request, reply) => {
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
