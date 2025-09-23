import { FastifyRequest, FastifyReply } from "fastify";
import { Media, IMedia } from "../models/Media";
import mongoose from "mongoose";
import { uploadToS3, deleteFromS3, getSignedUrl, getFileFromS3 } from "../utils/s3Service";

// File upload configuration
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// Restrict to PDF files only
const ALLOWED_MIME_TYPES = ["application/pdf"];

const ALLOWED_EXTENSIONS = [".pdf"];

// Helper function to determine file category (always document for PDF)
const getFileCategory = (
  mimetype: string
): "document" | "image" | "video" | "other" => {
  if (mimetype === "application/pdf") return "document";
  return "other"; // Should not happen with PDF-only restriction
};

// Helper function to validate file type (PDF only)
const validateFileType = (filename: string, mimetype: string) => {
  const fileExtension = filename
    .toLowerCase()
    .substring(filename.lastIndexOf("."));

  if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
    return {
      valid: false,
      error: `Only PDF files are allowed. Found: ${fileExtension}`,
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
    return {
      valid: false,
      error: `Only PDF files are supported. Found MIME type: ${mimetype}`,
    };
  }

  return { valid: true };
};

// Helper function to validate file size
const validateFileSize = (size: number) => {
  if (size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size too large. Maximum allowed size is ${Math.round(
        MAX_FILE_SIZE / (1024 * 1024)
      )}MB. Found: ${Math.round(size / (1024 * 1024))}MB`,
    };
  }

  return { valid: true };
};



export const uploadFile = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Use @fastify/multipart to get the uploaded file
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        success: false,
        message: "No PDF file uploaded",
        error: "FILE_REQUIRED",
      });
    }

    // Validate file type (PDF only)
    const fileTypeValidation = validateFileType(data.filename, data.mimetype);
    if (!fileTypeValidation.valid) {
      return reply.status(400).send({
        success: false,
        message: fileTypeValidation.error,
        error: "INVALID_FILE_TYPE",
        allowedTypes: ALLOWED_MIME_TYPES,
        allowedExtensions: ALLOWED_EXTENSIONS,
        foundType: data.mimetype,
        foundExtension: data.filename.substring(data.filename.lastIndexOf(".")),
      });
    }

    // Get file buffer using @fastify/multipart's toBuffer method
    const fileBuffer = await data.toBuffer();

    // Validate file size
    const fileSizeValidation = validateFileSize(fileBuffer.length);
    if (!fileSizeValidation.valid) {
      return reply.status(400).send({
        success: false,
        message: fileSizeValidation.error,
        error: "FILE_TOO_LARGE",
        maxSize: `${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`,
        foundSize: `${Math.round(fileBuffer.length / (1024 * 1024))}MB`,
      });
    }

    // Generate unique filename for PDF
    const timestamp = Date.now();
    const sanitizedName = data.filename
      .replace(".pdf", "")
      .replace(/[^a-zA-Z0-9-_]/g, "_");
    const filename = `${timestamp}-${sanitizedName}.pdf`;
    const s3Key = `media/${filename}`;

    // Upload to S3
    const s3Result = await uploadToS3(fileBuffer, s3Key, data.mimetype);

    // Save media info to database
    const media = await Media.create({
      filename: filename,
      originalName: data.filename,
      name: filename,
      url: s3Result.Location,
      s3Key: s3Key,
      size: fileBuffer.length,
      type: data.mimetype,
      category: "document",
      mimetype: data.mimetype,
      uploadDate: new Date(),
      uploadedBy: (request as any).user?.id || new mongoose.Types.ObjectId(),
      metadata: {
        fileExtension: ".pdf",
        originalSize: fileBuffer.length,
      },
    });

    // Return response that matches frontend expectations
    reply.status(201).send({
      success: true,
      message: "PDF file uploaded successfully",
      data: media,
      // Also return the media object directly for compatibility
      _id: media._id,
      name: filename,
      originalName: data.filename,
      url: s3Result.Location,
      size: fileBuffer.length,
      type: data.mimetype,
      category: "document",
      uploadDate: media.uploadedAt || new Date(),
    });
  } catch (error) {
    console.error("PDF upload error:", error);
    console.error("Error details:", {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
    });

    let errorMessage = "PDF upload failed";
    let errorCode = "UPLOAD_ERROR";

    if (error instanceof Error) {
      if (error.message.includes("NoSuchBucket")) {
        errorMessage = "S3 bucket not found. Please contact administrator.";
        errorCode = "BUCKET_ERROR";
      } else if (error.message.includes("AccessDenied")) {
        errorMessage = "S3 access denied. Please contact administrator.";
        errorCode = "PERMISSION_ERROR";
      } else if (error.message.includes("CredentialsError")) {
        errorMessage = "AWS credentials error. Please contact administrator.";
        errorCode = "CREDENTIALS_ERROR";
      } else {
        errorMessage = error.message;
      }
    }

    reply.status(500).send({
      success: false,
      message: errorMessage,
      error: errorCode,
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getAllMedia = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      search,
    } = request.query as {
      page?: number;
      limit?: number;
      category?: string;
      search?: string;
    };

    // Build query
    let query: any = {};

    // Filter by category if provided
    if (category && category !== "all") {
      query.category = category;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { originalName: { $regex: search, $options: "i" } },
        { filename: { $regex: search, $options: "i" } },
      ];
    }

    const offset = (page - 1) * limit;

    // Get media with pagination
    const media = await Media.find(query)
      .sort({ uploadedAt: -1 })
      .skip(offset)
      .limit(limit);

    const totalItems = await Media.countDocuments(query);
    const totalPages = Math.ceil(totalItems / limit);

    // Transform data to match frontend expectations
    const transformedMedia = media.map((item) => ({
      _id: item._id,
      name: item.filename,
      originalName: item.originalName,
      url: item.url,
      size: item.size,
      type: item.mimetype,
      category: item.category,
      uploadDate: item.uploadedAt || item.uploadDate || new Date(),
    }));

    reply.send({
      success: true,
      media: transformedMedia,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Get media error:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to fetch media files",
      error: "FETCH_ERROR",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "Unknown error"
          : undefined,
    });
  }
};

export const getMediaStats = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const totalFiles = await Media.countDocuments();

    // Get total size
    const sizeAggregation = await Media.aggregate([
      {
        $group: {
          _id: null,
          totalSize: { $sum: "$size" },
        },
      },
    ]);

    const totalSize =
      sizeAggregation.length > 0 ? sizeAggregation[0].totalSize : 0;

    // Get category statistics
    const categoryStats = await Media.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          size: { $sum: "$size" },
        },
      },
    ]);

    const categories: any = {};
    categoryStats.forEach((stat) => {
      categories[stat._id] = {
        count: stat.count,
        size: stat.size,
      };
    });

    // Get recent uploads
    const recentUploads = await Media.find({})
      .sort({ uploadedAt: -1 })
      .limit(10)
      .select("_id originalName uploadedAt");

    reply.send({
      success: true,
      totalFiles,
      totalSize,
      categories,
      recentUploads: recentUploads.map((upload) => ({
        _id: upload._id,
        originalName: upload.originalName,
        uploadDate: upload.uploadedAt,
      })),
    });
  } catch (error) {
    console.error("Get media stats error:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to fetch media statistics",
      error: "STATS_ERROR",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "Unknown error"
          : undefined,
    });
  }
};

export const updateMedia = async (
  request: FastifyRequest<{
    Params: { id: string };
    Body: { originalName?: string; category?: string };
  }>,
  reply: FastifyReply
) => {
  try {
    const { id } = request.params;
    const { originalName, category } = request.body;

    // Build update object
    const updates: any = {};
    if (originalName) updates.originalName = originalName;
    if (category) updates.category = category;

    const media = await Media.findByIdAndUpdate(id, updates, { new: true });

    if (!media) {
      return reply.status(404).send({
        success: false,
        message: "Media file not found",
        error: "NOT_FOUND",
      });
    }

    // Return response that matches frontend expectations
    const responseData = {
      _id: media._id,
      name: media.filename,
      originalName: media.originalName,
      url: media.url,
      size: media.size,
      type: media.mimetype,
      category: media.category,
      uploadDate: media.uploadedAt,
    };

    reply.send({
      success: true,
      message: "Media updated successfully",
      data: responseData,
      ...responseData,
    });
  } catch (error) {
    console.error("Update media error:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to update media file",
      error: "UPDATE_ERROR",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "Unknown error"
          : undefined,
    });
  }
};

export const deleteMedia = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const { id } = request.params;
    const media = await Media.findById(id);

    if (!media) {
      return reply.status(404).send({
        success: false,
        message: "Media file not found",
        error: "NOT_FOUND",
      });
    }

    // Delete file from S3
    try {
      if (media.s3Key) {
        await deleteFromS3(media.s3Key);
      }
    } catch (fileError) {
      console.error("S3 file deletion error:", fileError);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete from database
    await Media.findByIdAndDelete(id);

    reply.send({
      success: true,
      message: "Media file deleted successfully",
      deletedMedia: {
        _id: media._id,
        originalName: media.originalName,
      },
    });
  } catch (error) {
    console.error("Delete media error:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to delete media file",
      error: "DELETE_ERROR",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "Unknown error"
          : undefined,
    });
  }
};

export const getMediaById = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) => {
  try {
    const { id } = request.params;
    const media = await Media.findById(id);

    if (!media) {
      return reply.status(404).send({
        success: false,
        message: "Media file not found",
        error: "NOT_FOUND",
      });
    }

    // Transform data to match frontend expectations
    const responseData = {
      _id: media._id,
      name: media.filename,
      originalName: media.originalName,
      url: media.url,
      size: media.size,
      type: media.mimetype,
      category: media.category,
      uploadDate: media.uploadedAt,
      metadata: media.metadata,
    };

    reply.send({
      success: true,
      data: responseData,
      ...responseData,
    });
  } catch (error) {
    console.error("Get media by ID error:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to fetch media file",
      error: "FETCH_ERROR",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : "Unknown error"
          : undefined,
    });
  }
};

// Serve files from S3 with authentication
export const serveFile = async (
  request: FastifyRequest<{ Params: { filename: string } }>,
  reply: FastifyReply
) => {
  try {
    const { filename } = request.params;
    
    // Find media record in database
    const media = await Media.findOne({ filename });
    if (!media) {
      return reply.status(404).send({
        success: false,
        message: "PDF file not found",
        error: "FILE_NOT_FOUND",
      });
    }

    // Ensure it's a PDF file
    if (!filename.toLowerCase().endsWith('.pdf')) {
      return reply.status(403).send({
        success: false,
        message: "Only PDF files are served",
        error: "INVALID_FILE_TYPE",
      });
    }

    // Get file from S3
    const fileBuffer = await getFileFromS3(media.s3Key!);

    // Validate the PDF file has content
    if (fileBuffer.length === 0) {
      return reply.status(500).send({
        success: false,
        message: "PDF file is empty or corrupted",
        error: "EMPTY_FILE",
      });
    }

    // Set PDF-specific headers
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Length", fileBuffer.length.toString());
    reply.header("Cache-Control", "private, max-age=3600"); // 1 hour cache for authenticated content
    reply.header("Content-Disposition", `inline; filename="${filename}"`);
    reply.header("Accept-Ranges", "bytes");
    reply.header("X-Content-Type-Options", "nosniff");

    // Handle range requests for PDF streaming
    const range = request.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileBuffer.length - 1;
      const chunksize = end - start + 1;

      reply.header(
        "Content-Range",
        `bytes ${start}-${end}/${fileBuffer.length}`
      );
      reply.header("Content-Length", chunksize.toString());
      reply.status(206); // Partial Content

      const chunk = fileBuffer.slice(start, end + 1);
      return reply.send(chunk);
    }

    // Send the complete PDF file
    reply.send(fileBuffer);
  } catch (error) {
    console.error("Serve PDF file error:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to serve PDF file",
      error: "SERVE_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Legacy aliases for backward compatibility
export const uploadMedia = uploadFile;
export const getMedia = getAllMedia;

// New function to get signed URL for direct S3 access (optional)
export const getFileUrl = async (
  request: FastifyRequest<{ Params: { filename: string } }>,
  reply: FastifyReply
) => {
  try {
    const { filename } = request.params;
    
    // Find media record in database
    const media = await Media.findOne({ filename });
    if (!media || !media.s3Key) {
      return reply.status(404).send({
        success: false,
        message: "File not found",
        error: "FILE_NOT_FOUND",
      });
    }

    // Generate signed URL (1 hour expiry)
    const signedUrl = await getSignedUrl(media.s3Key, 3600);

    reply.send({
      success: true,
      url: signedUrl,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error("Get file URL error:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to generate file URL",
      error: "URL_ERROR",
    });
  }
};
