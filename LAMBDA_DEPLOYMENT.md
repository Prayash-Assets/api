# AWS Lambda Deployment Instructions

## Build Command
```bash
npm run build:lambda
```

## Generated File
- **File**: `dist/lambda.js` (4.3MB)
- **Handler**: `lambda.handler`
- **Runtime**: Node.js 18.x

## AWS Lambda Configuration

### Function Settings
- **Runtime**: Node.js 18.x or later
- **Handler**: `lambda.handler`
- **Timeout**: 30 seconds
- **Memory**: 512 MB (minimum recommended)

### Environment Variables
Set these in AWS Lambda console:
```
MONGODB_URI=your-mongodb-connection-string
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
AWS_REGION=your-aws-region
S3_BUCKET_NAME=your-s3-bucket
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email
EMAIL_PASS=your-email-password
FRONTEND_URL=your-frontend-url
NODE_ENV=production
```

### Deployment Steps
1. Run `npm run build:lambda`
2. Upload `dist/lambda.js` to AWS Lambda
3. Set handler to `lambda.handler`
4. Configure environment variables
5. Add API Gateway trigger
6. Test the function

### API Gateway Integration
- Create REST API or HTTP API
- Set integration type to Lambda Function
- Enable Lambda Proxy Integration
- Deploy API to stage

The bundled file includes all dependencies except AWS SDK, Sharp, Canvas, and MongoDB native drivers which are available in Lambda runtime or need to be installed separately.
