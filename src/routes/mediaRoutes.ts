import { FastifyInstance } from "fastify";
import {
  uploadFile,
  getAllMedia,
  getMediaById,
  updateMedia,
  deleteMedia,
  getMediaStats,
  serveFile,
  getFileUrl,
} from "../controllers/mediaController";
import { authenticate } from "../middleware/rbacMiddleware";

async function mediaRoutes(fastify: FastifyInstance) {
  // Apply authentication middleware to all routes
  fastify.addHook("preHandler", authenticate);

  // Serve static files (authentication required)
  fastify.get(
    "/files/:filename",
    {
      schema: {
        description: "Serve PDF files (authenticated)",
        tags: ["Media"],
        params: {
          type: "object",
          properties: {
            filename: { type: "string" },
          },
          required: ["filename"],
        },
      },
    },
    serveFile
  );

  // Get signed URL for file (optional alternative)
  fastify.get(
    "/url/:filename",
    {
      schema: {
        description: "Get signed URL for file access",
        tags: ["Media"],
        params: {
          type: "object",
          properties: {
            filename: { type: "string" },
          },
          required: ["filename"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              url: { type: "string" },
              expiresIn: { type: "number" },
            },
          },
          404: {
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
    getFileUrl
  );

  // Upload a new PDF file
  fastify.post(
    "/upload",
    {
      schema: {
        description: "Upload a new PDF file",
        tags: ["Media"],
        consumes: ["multipart/form-data"],
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
                  name: { type: "string" },
                  url: { type: "string" },
                  size: { type: "number" },
                  type: { type: "string" },
                  category: { type: "string", enum: ["document"] },
                  uploadDate: { type: "string", format: "date-time" },
                },
              },
              _id: { type: "string" },
              name: { type: "string" },
              originalName: { type: "string" },
              url: { type: "string" },
              size: { type: "number" },
              type: { type: "string" },
              category: { type: "string", enum: ["document"] },
              uploadDate: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              error: { type: "string" },
              allowedTypes: { type: "array", items: { type: "string" } },
              allowedExtensions: { type: "array", items: { type: "string" } },
              foundType: { type: "string" },
              foundExtension: { type: "string" },
              maxSize: { type: "string" },
              foundSize: { type: "string" },
            },
          },
          500: {
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
    uploadFile
  );

  // Get all PDF files with pagination and filtering
  fastify.get(
    "/",
    {
      schema: {
        description: "Get all PDF files with optional filtering and pagination",
        tags: ["Media"],
        querystring: {
          type: "object",
          properties: {
            page: {
              type: "string",
              pattern: "^[1-9]\\d*$",
              description: "Page number for pagination",
            },
            limit: {
              type: "string",
              pattern: "^[1-9]\\d*$",
              description: "Number of items per page",
            },
            search: {
              type: "string",
              description: "Search in PDF file names",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              media: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    _id: { type: "string" },
                    name: { type: "string" },
                    originalName: { type: "string" },
                    url: { type: "string" },
                    size: { type: "number" },
                    type: { type: "string" },
                    category: { type: "string", enum: ["document"] },
                    uploadDate: { type: "string", format: "date-time" },
                  },
                },
              },
              pagination: {
                type: "object",
                properties: {
                  currentPage: { type: "number" },
                  totalPages: { type: "number" },
                  totalItems: { type: "number" },
                  itemsPerPage: { type: "number" },
                  hasNextPage: { type: "boolean" },
                  hasPrevPage: { type: "boolean" },
                },
              },
            },
          },
          500: {
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
    getAllMedia
  );

  // Get media statistics
  fastify.get(
    "/stats",
    {
      schema: {
        description: "Get media library statistics",
        tags: ["Media"],
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              totalFiles: { type: "number" },
              totalSize: { type: "number" },
              categories: {
                type: "object",
                additionalProperties: {
                  type: "object",
                  properties: {
                    count: { type: "number" },
                    size: { type: "number" },
                  },
                },
              },
              recentUploads: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    _id: { type: "string" },
                    originalName: { type: "string" },
                    uploadDate: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          500: {
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
    getMediaStats
  );

  // Get a single media file by ID
  fastify.get(
    "/:id",
    {
      schema: {
        description: "Get a media file by ID",
        tags: ["Media"],
        params: {
          type: "object",
          properties: {
            id: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  _id: { type: "string" },
                  name: { type: "string" },
                  originalName: { type: "string" },
                  url: { type: "string" },
                  size: { type: "number" },
                  type: { type: "string" },
                  category: { type: "string" },
                  uploadDate: { type: "string", format: "date-time" },
                  metadata: {
                    type: "object",
                    properties: {
                      width: { type: "number" },
                      height: { type: "number" },
                      duration: { type: "number" },
                      pages: { type: "number" },
                      fileExtension: { type: "string" },
                      originalSize: { type: "number" },
                    },
                  },
                },
              },
              _id: { type: "string" },
              name: { type: "string" },
              originalName: { type: "string" },
              url: { type: "string" },
              size: { type: "number" },
              type: { type: "string" },
              category: { type: "string" },
              uploadDate: { type: "string", format: "date-time" },
              metadata: { type: "object" },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              error: { type: "string" },
            },
          },
          500: {
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
    getMediaById
  );

  // Update media file metadata
  fastify.put(
    "/:id",
    {
      schema: {
        description: "Update media file metadata",
        tags: ["Media"],
        params: {
          type: "object",
          properties: {
            id: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
          },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            originalName: { type: "string", minLength: 1, maxLength: 255 },
            category: {
              type: "string",
              enum: ["document", "image", "video", "other"],
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: {
                type: "object",
                properties: {
                  _id: { type: "string" },
                  name: { type: "string" },
                  originalName: { type: "string" },
                  url: { type: "string" },
                  size: { type: "number" },
                  type: { type: "string" },
                  category: { type: "string" },
                  uploadDate: { type: "string", format: "date-time" },
                },
              },
              _id: { type: "string" },
              name: { type: "string" },
              originalName: { type: "string" },
              url: { type: "string" },
              size: { type: "number" },
              type: { type: "string" },
              category: { type: "string" },
              uploadDate: { type: "string", format: "date-time" },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              error: { type: "string" },
            },
          },
          500: {
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
    updateMedia
  );

  // Delete a media file
  fastify.delete(
    "/:id",
    {
      schema: {
        description: "Delete a media file",
        tags: ["Media"],
        params: {
          type: "object",
          properties: {
            id: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
          },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              deletedMedia: {
                type: "object",
                properties: {
                  _id: { type: "string" },
                  originalName: { type: "string" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              error: { type: "string" },
            },
          },
          500: {
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
    deleteMedia
  );
}

export default mediaRoutes;
