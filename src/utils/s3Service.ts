import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl as getSignedUrlV3 } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

// Configure AWS S3 Client - Lambda will use execution role automatically
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || process.env.S3_BUCKET_NAME || 'prayashassets';

export const uploadToS3 = async (
  fileBuffer: Buffer,
  key: string,
  contentType: string
): Promise<{ Location: string; Key: string }> => {
  try {
    console.log('S3 Upload attempt:', {
      bucket: BUCKET_NAME,
      key,
      contentType,
      fileSize: fileBuffer.length,
      region: process.env.AWS_REGION
    });

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    const result = await s3Client.send(command);
    console.log('S3 Upload successful:', result);
    
    return {
      Location: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
      Key: key,
    };
  } catch (error) {
    console.error('S3 Upload failed:', error);
    throw error;
  }
};

export const deleteFromS3 = async (key: string): Promise<void> => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
};

export const getSignedUrl = async (key: string, expiresIn: number = 3600): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrlV3(s3Client, command, { expiresIn });
};

export const generatePresignedUploadUrl = async (
  key: string,
  contentType: string,
  contentLength: number,
  expiresIn: number = 300
): Promise<{ url: string; fields?: any }> => {
  try {
    console.log('Generating presigned URL with params:', {
      bucket: BUCKET_NAME,
      key,
      contentType,
      contentLength,
      expiresIn,
      region: process.env.AWS_REGION
    });

    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: BUCKET_NAME,
      Key: key,
      Fields: {
        'Content-Type': contentType,
      },
      Expires: expiresIn,
      Conditions: [
        ['content-length-range', 0, contentLength * 2], // Allow up to 2x the reported size
        ['eq', '$Content-Type', contentType],
      ],
    });
    
    console.log('Presigned URL generated:', {
      url,
      fieldsKeys: Object.keys(fields || {}),
      keyField: fields?.key
    });
    
    return {
      url,
      fields,
    };
  } catch (error) {
    console.error('Failed to generate presigned URL:', error);
    throw error;
  }
};

export const getFileFromS3 = async (key: string): Promise<Buffer> => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const result = await s3Client.send(command);
  
  if (!result.Body) {
    throw new Error('File not found in S3');
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  const stream = result.Body as any;
  
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  
  return Buffer.concat(chunks);
};