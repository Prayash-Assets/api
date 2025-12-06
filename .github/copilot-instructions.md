# Prayash API - AI Coding Agent Instructions

## Architecture Overview

**Stack**: Fastify + TypeScript + Mongoose + MongoDB, deployed as AWS Lambda on Node.js 18.

**LMS Backend**: Learning management system API for nursing exam preparation. Manages authentication (JWT), content delivery (packages, tests, questions), payment processing (Razorpay), file uploads (S3 presigned URLs), email notifications, and role-based access control.

**Deployment**: AWS Lambda + API Gateway (routes prefixed with `/api`). Handles multiple deployment stages (`/prod`, `/dev`). Frontend is separate Next.js app (`../quizui`).

## Project Structure

```
src/
  app.ts              # Fastify app factory, route registration, middleware setup
  index.ts            # Local development server entry
  lambda.ts           # AWS Lambda handler for serverless deployment
  config/
    db.ts             # MongoDB connection management
    logger.ts         # Winston logger configuration
  controllers/        # Route handlers (business logic)
  models/             # Mongoose schemas (User, Package, MockTest, Question, Purchase, etc.)
  routes/             # Route definitions
  middleware/         # Authentication, RBAC, session validation
  utils/              # Services (EmailService, S3Service, etc.)
  seeders/            # Database initialization scripts
```

## Authentication & Authorization

**JWT Tokens**: Two-tier system managed in `authController.ts`:
- Access token: 1-hour expiry for API requests
- Refresh token: Longer expiry, can issue new access token without re-login

**Token Structure**: JWT payload includes `id`, `email`, `userType` (Student/Admin), `roles`.

**Session Management** (`sessionMiddleware.ts`): Validates `X-Session-ID` header to enforce single active session per user across devices. Reissuing login creates new session ID.

**RBAC** (`rbacMiddleware.ts`): `checkRoles()` middleware verifies user roles from MongoDB before route execution. User schema references Role documents.

**User Types**: Two schemas using discriminator pattern - `Student` (city, state, school) and `Admin` (address). Both inherit base User schema with email verification fields.

## Core Workflows

### 1. Authentication Flow
```
POST /auth/register → Create user (Student/Admin) + send verification email
POST /auth/verify-email → Confirm email with 6-digit code (stored 10 min)
POST /auth/login → Generate JWT tokens + session ID + validate single session
POST /auth/refresh-token → Issue new access token if refresh token valid
POST /auth/request-password-reset → Send reset link via email
POST /auth/reset-password → Update password with reset token
```

### 2. Payment & Purchase Flow
```
1. Client calls POST /purchases (requires auth) with packageId
   → Creates Purchase doc with status "created" + Razorpay order_id
2. Server validates package is published + user hasn't purchased it
3. Prevents duplicate pending orders with compound index
4. Client opens Razorpay checkout modal with order_id
5. POST /purchases/verify (signature validation via Razorpay utils)
   → Updates Purchase status to "authorized"/"captured"
6. Webhook POST /webhooks/razorpay (no auth, signature verification)
   → Async confirmation, adds package to student via addPackageToStudent()
```

**Key Indexes**: Purchase schema has indexes on `(user, package, status)` and partial index for pending orders to prevent duplicate active purchases.

### 3. Content Hierarchy
- **Category** → **Level** → **Subject** → **Question** → **MockTest** → **Package**
- Questions have options with `isCorrect` boolean, difficulty level, explanation
- MockTests include duration, passing marks, negative marking, test type (Study/Mock)
- Packages bundle MockTests + files + links with pricing (supports discounts)

### 4. File Upload Patterns

**Small Files (<10MB)**: Multipart form upload via `@fastify/multipart`
```javascript
// Client sends: POST /media/upload with form data
// Server: Reads file buffer → uploadToS3() → saves Media doc to MongoDB
```

**Large Files (>10MB)**: Presigned S3 URLs bypass API Gateway 10MB limit
```
1. POST /upload/presigned-url (auth required)
   → generatePresignedUploadUrl() creates signed URL valid 5 minutes
2. Client uploads directly to S3 using presigned URL
3. POST /upload/confirm (auth required)
   → Creates Media doc in MongoDB to track upload
```

**S3 Configuration**: Uses AWS SDK v3 (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`). Region from `AWS_REGION` env, bucket from `AWS_S3_BUCKET_NAME` or `S3_BUCKET_NAME`.

## Data Models

**User**: Base schema with student/admin discriminators. Fields: `fullname`, `email`, `password` (bcrypt hashed), `roles` (array of Role refs), `isVerified`, `activeSessionId`, `userType`.

**Package**: Contains `name`, `price`, `originalPrice`, `discountPercentage`, array of `mockTests`, `files` (name/url), `links`, `duration` (days), `published`, `publicView`.

**MockTest**: `title`, `questions` (array of refs), `duration`, `totalMarks`, `passingMarks`, `marksPerQuestion`, `negativeMarking`, `testType` (enum), `numberOfAttempts`.

**Question**: `text`, `options` (array with optionText/isCorrect), `difficulty`, refs to `category_id`, `subject_id`, `level_id`, `explanation`.

**Purchase**: Tracks payment state. `status`: created|authorized|captured|failed|refunded|cancelled. Includes `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature`, `amount`, `orderDetails` (customer info).

**Result**: Stores test attempts. `user` ref, `mockTest` ref, `answers` (user's responses), `score`, `passingStatus`, `duration` taken, `attemptNumber`.

**Media**: File metadata. `filename` (with UUID prefix), `originalName`, `url` (S3), `size`, `type`, `category`, `uploadDate`.

## Services

**EmailService** (`utils/emailService.ts`): Singleton pattern. Dynamically creates Nodemailer transporter based on active EmailSettings from MongoDB (SMTP host, port, auth, TLS config). Methods: `sendEmail()`, `sendVerificationCode()`, `sendPasswordResetLink()`. Supports Gmail, Outlook, Yahoo with port-specific TLS handling.

**S3Service** (`utils/s3Service.ts`): AWS SDK v3 wrapper.
- `uploadToS3()` - Direct buffer upload
- `generatePresignedUploadUrl()` - Returns signed PUT URL valid 5 minutes
- `deleteFromS3()` - Remove files
- `getSignedUrl()` - Get read-only signed URL for downloads

**Razorpay Integration**: Initialized in `purchaseController.ts` with `key_id` and `key_secret` from env. Uses `validatePaymentVerification()` utility from razorpay package for signature validation.

## Middleware & Hooks

**Session Validation** (`sessionMiddleware.ts`): 
- Runs on all requests via `app.addHook("onRequest", validateSession)`
- Extracts session ID from `X-Session-ID` header
- Validates JWT token exists and session matches user's `activeSessionId`
- Allows missing auth for public routes (login, register)

**RBAC** (`rbacMiddleware.ts`):
- `authenticate()` - Extracts Bearer token, verifies JWT signature, populates `req.user`
- `checkRoles(allowedRoles)` - Higher-order middleware, verifies user has required role

**URL Rewriting** (`app.ts`):
- API Gateway prefixes `/prod` or `/dev` stage to request paths
- `addHook("onRequest")` strips stage prefix if present, logs transformed URL
- Converts `/prod/api/auth/login` → `/api/auth/login`

**CORS** (`app.ts`):
- Whitelist: localhost:3000, https://main.d29juw0qooqw8k.amplifyapp.com, https://prayashassets.com
- Methods: GET, POST, PUT, DELETE
- Headers: Content-Type, Authorization, X-Session-ID required
- Credentials enabled

## Route Organization

**Public Routes** (no auth):
- `POST /auth/login, /auth/register, /auth/verify-email, /auth/reset-password`
- `POST /webhooks/razorpay` (signature verified, not JWT)
- `GET /categories, /levels, /subjects` (read-only content)

**Protected Routes** (require auth via checkRoles):
- `GET /auth/profile, PUT /auth/profile, POST /auth/change-password`
- `GET /packages` (filtered by publicView + user purchases), `POST /packages` (admin only)
- `POST /purchases, POST /purchases/verify` (user can buy, admin can manage)
- `GET /mocktests, POST /results` (student attempts tests)
- `POST /media/upload, POST /upload/presigned-url` (file management)

**Admin-Only Routes**: `checkRoles(["admin"])` on user management, package creation, payment settings.

## Development Workflow

**Local Development**:
```bash
npm run dev          # Runs ts-node with nodemon, watches src/ changes
npm start            # One-time ts-node run
npm run build        # TypeScript compilation to dist/
npm run build:lambda # Esbuild for AWS Lambda (creates dist/index.js, 4.3MB)
npm run seed         # Database seeding script
```

**Lambda Deployment**:
1. `npm run build:lambda` generates `dist/index.js` (bundled, minified)
2. Upload to AWS Lambda, set handler to `lambda.handler`
3. Configure environment variables (MONGODB_URI, JWT_SECRET, S3_BUCKET_NAME, RAZORPAY keys, etc.)
4. Add API Gateway trigger with Lambda Proxy Integration enabled

**Environment Variables**:
```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=prayashassets
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
EMAIL_HOST=smtp.gmail.com (or configured in DB)
NODE_ENV=production|development
```

## Referential Integrity Checking

**Delete Blocking**: All delete operations check for references before allowing deletion. Returns 409 (Conflict) status with error details:

| Model | Checked References | Error Code |
|-------|-------------------|-----------|
| Category | Questions | `CATEGORY_IN_USE` |
| Subject | Questions | `SUBJECT_IN_USE` |
| Level | Questions | `LEVEL_IN_USE` |
| Question | MockTests | `QUESTION_IN_USE` |
| MockTest | Packages, Results | `MOCKTEST_IN_USE_BY_PACKAGE`, `MOCKTEST_IN_USE_BY_RESULT` |
| Package | Purchases, Results, User.packages | `PACKAGE_IN_USE_BY_PURCHASE`, `PACKAGE_IN_USE_BY_RESULT`, `PACKAGE_IN_USE_BY_USER` |

**Response Format (409 Conflict)**:
```json
{
  "message": "Cannot delete category. It is referenced by 5 questions. Please remove or reassign these questions first.",
  "error": "CATEGORY_IN_USE",
  "referencedCount": 5
}
```

**Frontend Integration**: Use `useDeleteWithAlert()` hook or `DeleteConfirmationDialog` component in `../quizui` to automatically handle errors with shadcn alerts.

## Common Patterns

**Request Validation**: Use Joi schemas (e.g., `registerSchema` in authController). Validate in controller before business logic.

**Error Handling**: Return FastifyReply with `.status(code).send({message, error})`. Errors logged via Winston logger. 401 for auth failures, 403 for insufficient permissions, 400 for validation, 409 for referential integrity violations.

**Database Queries**: All models use Mongoose with `.populate()` for refs. Use compound indexes for frequently filtered queries (e.g., Purchase lookups by user + package + status).

**Async Patterns**: Controllers are async. Use try-catch, log errors, return appropriate HTTP status. Webhook processing is fire-and-forget (no await in route, errors logged).

**Password Security**: Use bcryptjs for hashing (at least 10 rounds, already configured in authController).

**PDF Generation**: `pdfkit` used for reports in resultController (generates test result PDFs).

## Key Implementation Notes

1. **Single Session Enforcement**: When user logs in from new device, `activeSessionId` is overwritten. Old session becomes invalid on next request (session validation checks ID match).

2. **Webhook Signature Verification**: Razorpay webhooks must verify HMAC-SHA256 signature before processing. Never trust webhook body without signature validation.

3. **Presigned URL Expiry**: Generated URLs expire in 300 seconds (5 minutes). Client must upload immediately, then confirm via `/upload/confirm` endpoint.

4. **Purchase Status Flow**: created → authorized → captured. Verification endpoint transitions created→authorized. Webhook transitions authorized→captured. Prevents double-charging with status checks.

5. **Email Service Initialization**: Lazy loads SMTP settings from MongoDB on first send. Caches transporter instance. If settings change, service needs restart (hot-reload limitation).

6. **API Gateway Stage Handling**: Both `/prod` and `/dev` prefixes must be stripped. Lambda handler does this before passing to Fastify to avoid double-routing.

7. **No Test Framework Configured**: `npm test` currently returns error. Consider adding Jest or Vitest if tests needed.

## Deployment Checklist

- [ ] All env vars set in Lambda console
- [ ] MongoDB connection tested (connection pool config for Lambda: maxPoolSize=10)
- [ ] S3 IAM role has PutObject, GetObject, DeleteObject permissions
- [ ] Razorpay sandbox/production keys match deployment environment
- [ ] Email settings configured in MongoDB (EmailSettings collection)
- [ ] API Gateway CORS headers match Fastify CORS config
- [ ] Webhook secret configured and matches Razorpay dashboard
- [ ] Frontend CORS origin whitelisted in app.ts
