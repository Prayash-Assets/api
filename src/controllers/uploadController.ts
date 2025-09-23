import { FastifyRequest, FastifyReply } from "fastify";
import { Media } from "../models/Media";
import mongoose from "mongoose";
import { generatePresignedUploadUrl } from "../utils/s3Service";

// File upload configuration
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME_TYPES = ["application/pdf"];
const ALLOWED_EXTENSIONS = [".pdf"];

// Helper function to validate file type
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

interface PresignedUrlRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
}

interface ConfirmUploadRequest {
  key: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export const generatePresignedUrl = async (
  request: FastifyRequest<{ Body: PresignedUrlRequest }>,
  reply: FastifyReply
) => {
  try {
    const { fileName, fileType, fileSize } = request.body;

    console.log('Presigned URL request:', {
      fileName,
      fileType,
      fileSize,
      user: (request as any).user?.id
    });

    // Validate file type
    const fileTypeValidation = validateFileType(fileName, fileType);
    if (!fileTypeValidation.valid) {
      console.log('File type validation failed:', fileTypeValidation.error);
      return reply.status(400).send({
        success: false,
        message: fileTypeValidation.error,
        error: "INVALID_FILE_TYPE",
      });
    }

    // Validate file size
    const fileSizeValidation = validateFileSize(fileSize);
    if (!fileSizeValidation.valid) {
      console.log('File size validation failed:', fileSizeValidation.error);
      return reply.status(400).send({
        success: false,
        message: fileSizeValidation.error,
        error: "FILE_TOO_LARGE",
      });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = fileName
      .replace(".pdf", "")
      .replace(/[^a-zA-Z0-9-_]/g, "_");
    const uniqueFileName = `${timestamp}-${sanitizedName}.pdf`;
    const s3Key = `media/${uniqueFileName}`;

    console.log('Generated S3 key:', s3Key);

    // Generate presigned URL
    const presignedData = await generatePresignedUploadUrl(s3Key, fileType, fileSize);

    console.log('Presigned PUT URL generated successfully:', {
      url: presignedData.url,
      key: s3Key
    });

    reply.send({
      success: true,
      uploadUrl: presignedData.url,
      key: s3Key,
      expiresIn: 300, // 5 minutes
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to generate upload URL",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const confirmUpload = async (
  request: FastifyRequest<{ Body: ConfirmUploadRequest }>,
  reply: FastifyReply
) => {
  try {
    const { key, fileName, fileType, fileSize } = request.body;

    // Create media record in database
    const media = await Media.create({
      filename: key.split('/').pop(), // Extract filename from key
      originalName: fileName,
      name: key.split('/').pop(),
      url: `https://${process.env.AWS_S3_BUCKET_NAME || 'prayashassets'}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`,
      s3Key: key,
      size: fileSize,
      type: fileType,
      category: "document",
      mimetype: fileType,
      uploadDate: new Date(),
      uploadedBy: (request as any).user?.id || new mongoose.Types.ObjectId(),
      metadata: {
        fileExtension: ".pdf",
        originalSize: fileSize,
      },
    });

    reply.status(201).send({
      success: true,
      message: "File upload confirmed successfully",
      data: {
        _id: media._id,
        filename: media.filename,
        originalName: media.originalName,
        url: media.url,
        size: media.size,
        type: media.type,
        category: media.category,
        uploadDate: media.uploadDate,
      },
    });
  } catch (error) {
    console.error("Error confirming upload:", error);
    reply.status(500).send({
      success: false,
      message: "Failed to confirm upload",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
