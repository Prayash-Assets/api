#!/bin/bash

echo "🚀 Building for Lambda deployment..."

# Build TypeScript
npm run build

# Create deployment package
echo "📦 Creating deployment package..."
zip -r lambda-deployment.zip dist/ node_modules/ lambda.js package.json

echo "✅ Deployment package created: lambda-deployment.zip"
echo ""
echo "📋 Next steps:"
echo "1. Upload lambda-deployment.zip to AWS Lambda"
echo "2. Set handler to: lambda.handler"
echo "3. Set environment variables in Lambda console"
echo "4. Configure API Gateway trigger"
