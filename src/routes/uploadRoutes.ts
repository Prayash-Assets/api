import { FastifyInstance } from "fastify";
import { generatePresignedUrl, confirmUpload } from "../controllers/uploadController";
import { authenticate } from "../middleware/rbacMiddleware";

async function uploadRoutes(fastify: FastifyInstance) {
  // Apply authentication middleware to all routes
  fastify.addHook("preHandler", authenticate);

  // Generate presigned URL for direct S3 upload
  fastify.post(
    "/presigned-url",
    {
      schema: {
        description: "Generate presigned URL for direct S3 upload",
        tags: ["Upload"],
        body: {
          type: "object",
          properties: {
            fileName: { type: "string", minLength: 1 },
            fileType: { type: "string", minLength: 1 },
            fileSize: { type: "number", minimum: 1 }
          },
          required: ["fileName", "fileType", "fileSize"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              uploadUrl: { type: "string" },
              key: { type: "string" },
              fields: { type: "object" },
              expiresIn: { type: "number" }
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    generatePresignedUrl
  );

  // Confirm successful upload and save to database
  fastify.post(
    "/confirm",
    {
      schema: {
        description: "Confirm successful upload and save to database",
        tags: ["Upload"],
        body: {
          type: "object",
          properties: {
            key: { type: "string", minLength: 1 },
            fileName: { type: "string", minLength: 1 },
            fileType: { type: "string", minLength: 1 },
            fileSize: { type: "number", minimum: 1 }
          },
          required: ["key", "fileName", "fileType", "fileSize"],
        },
        response: {
          201: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: {
                type: "object",
                properties: {
                  _id: { type: "string" },
                  filename: { type: "string" },
                  originalName: { type: "string" },
                  url: { type: "string" },
                  size: { type: "number" },
                  type: { type: "string" },
                  category: { type: "string" },
                  uploadDate: { type: "string", format: "date-time" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    confirmUpload
  );
}

export default uploadRoutes;
