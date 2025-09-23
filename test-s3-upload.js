const { S3Client } = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');

// Test S3 presigned URL generation
async function testS3Upload() {
  try {
    const s3Client = new S3Client({
      region: 'ap-south-1',
    });

    const BUCKET_NAME = 'prayashassets';
    const key = `test-uploads/test-${Date.now()}.pdf`;
    const contentType = 'application/pdf';

    console.log('Testing S3 presigned URL generation...');
    console.log('Bucket:', BUCKET_NAME);
    console.log('Key:', key);
    console.log('Content-Type:', contentType);

    const { url, fields } = await createPresignedPost(s3Client, {
      Bucket: BUCKET_NAME,
      Key: key,
      Fields: {
        key: key,
        'Content-Type': contentType,
      },
      Expires: 300,
      Conditions: [
        ['content-length-range', 0, 20 * 1024 * 1024], // 20MB max
        ['eq', '$Content-Type', contentType],
      ],
    });

    console.log('\nPresigned URL generated successfully!');
    console.log('URL:', url);
    console.log('Fields:', JSON.stringify(fields, null, 2));

    // Test form data order
    console.log('\nForm field order:');
    Object.entries(fields).forEach(([key, value], index) => {
      console.log(`${index + 1}. ${key}: ${value}`);
    });

  } catch (error) {
    console.error('Error generating presigned URL:', error);
  }
}

testS3Upload();
