import { FastifyInstance } from "fastify";
import {
  createQuestion,
  getAllQuestions,
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  uploadQuestionsFromExcel,
  uploadQuestionsFromCSV,
  downloadQuestionTemplate,
  downloadCSVTemplate,
} from "../controllers/questionController";
import { checkRoles } from "../middleware/rbacMiddleware";

export const questionRoutes = async (fastify: FastifyInstance) => {
  // Note: @fastify/multipart is now registered globally in index.ts

  // Admin-only routes for question management
  fastify.post(
    "/",
    { preHandler: [checkRoles(["admin"])] },
    createQuestion as any
  );
  fastify.put(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    updateQuestion as any
  );
  fastify.delete(
    "/:id",
    { preHandler: [checkRoles(["admin"])] },
    deleteQuestion as any
  );

  // Read operations - accessible to authenticated users (students and admins)
  fastify.get(
    "/",
    { preHandler: [checkRoles(["student", "admin"])] },
    getAllQuestions as any
  );
  fastify.get(
    "/:id",
    { preHandler: [checkRoles(["student", "admin"])] },
    getQuestionById as any
  );

  // Admin-only routes for bulk operations
  fastify.post("/upload-excel", {
    preHandler: checkRoles(["admin"]),
    handler: uploadQuestionsFromExcel as any,
  });

  // CSV upload endpoint
  fastify.post("/upload-csv", {
    preHandler: checkRoles(["admin"]),
    handler: uploadQuestionsFromCSV as any,
  });

  fastify.get("/download-template", {
    preHandler: checkRoles(["admin"]),
    handler: downloadQuestionTemplate as any,
  });

  // CSV template download endpoint
  fastify.get("/download-csv-template", {
    preHandler: checkRoles(["admin"]),
    handler: downloadCSVTemplate as any,
  });
};
