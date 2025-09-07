# Prayash API Postman Collection

This directory contains the Postman collection and environments for testing the Prayash API.

## Files

- `Complete_API_Collection.postman_collection.json` - Main API collection with all endpoints
- `Local.postman_environment.json` - Local development environment
- `Production.postman_environment.json` - Production environment

## How to Use

### 1. Import Collection and Environments

1. Open Postman
2. Import the collection: `Complete_API_Collection.postman_collection.json`
3. Import both environment files:
   - `Local.postman_environment.json`
   - `Production.postman_environment.json`

### 2. Select Environment

Before testing, select the appropriate environment:

- **Local** - For testing against local development server
  - Base URL: `http://localhost:4000/api`
  - Use when running the server locally with `npm run dev`

- **Production** - For testing against live production server
  - Base URL: `https://api.prayashassets.com/api`
  - Use when testing the deployed server

### 3. Environment Variables

The collection uses the following environment variable:
- `{{base_url}}` - Automatically set based on selected environment

The collection also maintains these variables for state management:
- `accessToken` - JWT access token (auto-populated after login)
- `refreshToken` - JWT refresh token (auto-populated after login)
- `userId` - User ID (auto-populated after registration/login)
- `resetToken` - Password reset token (auto-populated after reset request)

### 4. Authentication Flow

1. Register a new user or login with existing credentials
2. The collection will automatically extract and store the access token
3. Subsequent requests will use the stored token for authentication

### 5. Testing Different Endpoints

The collection includes endpoints for:
- Authentication (register, login, logout)
- User management (profile, update, password change)
- Password reset flow
- Token verification and refresh
- Email verification

## Switching Between Environments

Simply select the desired environment from the environment dropdown in Postman:
- Select "Local" when developing/testing locally
- Select "Production" when testing the deployed API

All API calls will automatically use the correct base URL based on your selection.
