#!/bin/bash

echo "🚀 Building Lambda bundle..."

# Build single file with all dependencies
npm run build:lambda

# Create deployment package with just the bundled file
echo "📦 Creating deployment package..."
cd dist
zip -r ../lambda-bundle.zip lambda.js
cd ..

echo "✅ Bundle deployment package created: lambda-bundle.zip"
echo ""
echo "📋 Next steps:"
echo "1. Upload lambda-bundle.zip to AWS Lambda"
echo "2. Set handler to: lambda.handler"
echo "3. Set environment variables in Lambda console"
