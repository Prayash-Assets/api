# Presigned URL Upload Implementation

This implementation allows direct file uploads to S3 using presigned URLs, bypassing API Gateway's 10MB limit.

## How It Works

1. **Client requests presigned URL**: Frontend calls `/api/upload/presigned-url` with file metadata
2. **Server generates presigned URL**: Backend creates a temporary upload URL for S3
3. **Client uploads directly to S3**: File is uploaded directly to S3 using the presigned URL
4. **Client confirms upload**: Frontend calls `/api/upload/confirm` to save file metadata to database

## Benefits

- **No size limits**: Bypasses API Gateway's 10MB limit
- **Better performance**: Direct upload to S3, no server processing
- **Reduced server load**: Files don't go through your API server
- **Progress tracking**: Real-time upload progress
- **Security**: Presigned URLs expire after 5 minutes

## API Endpoints

### POST /api/upload/presigned-url

Generate a presigned URL for direct S3 upload.

**Request Body:**
```json
{
  "fileName": "document.pdf",
  "fileType": "application/pdf",
  "fileSize": 15728640
}
```

**Response:**
```json
{
  "success": true,
  "uploadUrl": "https://prayashassets.s3.ap-south-1.amazonaws.com/media/1234567890-document.pdf?X-Amz-Algorithm=...",
  "key": "media/1234567890-document.pdf",
  "expiresIn": 300
}
```

### POST /api/upload/confirm

Confirm successful upload and save metadata to database.

**Request Body:**
```json
{
  "key": "media/1234567890-document.pdf",
  "fileName": "document.pdf",
  "fileType": "application/pdf",
  "fileSize": 15728640
}
```

**Response:**
```json
{
  "success": true,
  "message": "File upload confirmed successfully",
  "data": {
    "_id": "64f8a1b2c3d4e5f6a7b8c9d0",
    "filename": "1234567890-document.pdf",
    "originalName": "document.pdf",
    "url": "https://prayashassets.s3.ap-south-1.amazonaws.com/media/1234567890-document.pdf",
    "size": 15728640,
    "type": "application/pdf",
    "category": "document",
    "uploadDate": "2023-09-23T15:30:00.000Z"
  }
}
```

## Frontend Implementation

### JavaScript/HTML Example

```javascript
async function uploadFile(file) {
  // Step 1: Get presigned URL
  const presignedResponse = await fetch('/api/upload/presigned-url', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    })
  });

  const { uploadUrl, key } = await presignedResponse.json();

  // Step 2: Upload directly to S3
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type
    }
  });

  // Step 3: Confirm upload
  const confirmResponse = await fetch('/api/upload/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      key: key,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size
    })
  });

  const result = await confirmResponse.json();
  console.log('Upload successful:', result.data);
}
```

### React Example

See `PresignedUpload.tsx` for a complete React component implementation.

## Configuration

### Environment Variables

Make sure these environment variables are set:

```env
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=prayashassets
```

### S3 Bucket Policy

Your S3 bucket policy should allow the necessary permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::prayashassets/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::prayashassets"
    }
  ]
}
```

### CORS Configuration

Your S3 bucket needs CORS configuration to allow direct uploads:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

## File Size Limits

- **Previous limit**: 10MB (API Gateway limit)
- **New limit**: 50MB (configurable in code)
- **S3 limit**: 5TB per file (practically unlimited for your use case)

## Security Features

- **Authentication required**: All endpoints require valid JWT token
- **File type validation**: Only PDF files allowed
- **File size validation**: Configurable maximum file size
- **Temporary URLs**: Presigned URLs expire after 5 minutes
- **Unique filenames**: Prevents filename conflicts

## Error Handling

The implementation includes comprehensive error handling:

- Invalid file types
- File size exceeded
- Missing authentication
- S3 upload failures
- Database save failures

## Migration from Existing Upload

To migrate from your existing upload endpoint:

1. **Keep existing endpoint**: The old `/api/media/upload` endpoint still works
2. **Update frontend gradually**: Switch to presigned URLs for new uploads
3. **Test thoroughly**: Ensure all file operations work correctly
4. **Monitor usage**: Check S3 costs and performance

## Testing

Use the provided HTML example (`presigned-upload-example.html`) to test the implementation:

1. Update the API_BASE URL
2. Add a valid JWT token
3. Select a PDF file
4. Upload and verify the file appears in your media list

## Troubleshooting

### Common Issues

1. **CORS errors**: Check S3 bucket CORS configuration
2. **403 Forbidden**: Verify IAM permissions for S3 operations
3. **File not found**: Ensure the S3 key matches between upload and confirm
4. **Upload timeout**: Check network connectivity and file size

### Debug Logging

The implementation includes detailed logging. Check your Lambda logs for:
- S3 upload attempts
- Presigned URL generation
- File confirmation requests

## Performance Considerations

- **Direct S3 upload**: Faster than going through API Gateway
- **No server processing**: Reduces Lambda execution time
- **Parallel uploads**: Multiple files can be uploaded simultaneously
- **Progress tracking**: Real-time feedback to users

## Cost Implications

- **Reduced Lambda costs**: Less execution time per upload
- **S3 costs**: Standard S3 storage and transfer costs apply
- **API Gateway costs**: Reduced payload size for API calls

This implementation provides a robust, scalable solution for handling large file uploads while maintaining security and user experience.
