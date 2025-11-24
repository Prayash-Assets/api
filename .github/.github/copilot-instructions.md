# Prayash Assets - AI Coding Agent Instructions

## Architecture Overview

**Dual Deployment Model**: This is a Fastify REST API designed to run both as a local server (`npm run dev` → `src/index.ts`) and as an AWS Lambda function (`npm run build:lambda` → `dist/index.js`). The shared application logic is in `src/app.ts`, which both entry points use.

**Core Stack**: Fastify + Mongoose + TypeScript. Database is MongoDB, file storage is AWS S3, payment processing via Razorpay.

**Authentication Model**: JWT-based with access/refresh tokens. Single-device login enforcement via `activeSessionId` (see `src/middleware/sessionMiddleware.ts`). Session validation runs on every request except public routes.

## Key Patterns

### Route Structure
Routes use Fastify's plugin system with prefix registration in `src/app.ts`:
```typescript
await app.register(authRoutes, { prefix: "/api/auth" });
```

Controller functions receive `FastifyRequest` and `FastifyReply`. Validation uses Joi schemas directly in controllers (e.g., `authController.ts`).

### RBAC Middleware
Authorization uses `checkRoles(['student', 'admin'])` prehandler in route definitions. User roles are populated from MongoDB refs and checked in `src/middleware/rbacMiddleware.ts`.

### User Model Discriminators
`User` model uses Mongoose discriminators for `Student` and `Admin` subtypes. Both share base schema but have type-specific fields (students: packages/education, admins: address).

### File Uploads
**Two patterns**: 
1. Direct multipart uploads via Fastify multipart plugin (max 20MB, defined in `app.ts`)
2. Presigned S3 URLs for large files (see `PRESIGNED_UPLOAD_README.md`): client gets URL from `/api/upload/presigned-url`, uploads directly to S3, then confirms via `/api/upload/confirm`

### AWS Lambda Adaptations
- Path prefixes (`/prod`, `/dev`) are stripped in `src/app.ts` onRequest hook and `src/lambda.ts`
- Connection pooling configured in `src/config/db.ts` for Lambda cold starts
- Environment variables required: `MONGODB_URI`, `JWT_SECRET`, `AWS_REGION`, `S3_BUCKET_NAME`, `RAZORPAY_KEY_ID`, etc.

### Mock Test & Question System
Questions belong to subjects/categories/levels. `MockTest` model aggregates questions with time limits. Results stored with detailed answer tracking (see `src/models/Result.ts`).

## Development Workflow

**Local Development**: `npm run dev` (nodemon watches `src/**/*.ts`)
**Build Lambda**: `npm run build:lambda` (esbuild bundles to single `dist/index.js`, 4.3MB)
**Database Seeding**: `npm run seed` (runs `src/seeders/index.ts`)

**Testing**: Use Postman collections in `postman/` directory. Import `MockTestCollection.json` with either `Local.postman_environment.json` or `Production.postman_environment.json`. Collections auto-populate tokens after login.

## Integration Points

**Frontend**: Next.js app in `../quizui` workspace. Uses axios with global 401/403 interceptors (`quizui/lib/axios-config.ts`) that auto-logout on unauthorized. API client pattern in `quizui/lib/api/` with `useApi` hook.

**Webhooks**: Razorpay payment webhooks handled at `/api/webhooks` (see `src/controllers/webhookController.ts`). Signature verification required.

**Email**: nodemailer service in `src/utils/emailService.ts`. Templates for verification codes and password resets.

## Code Style

- Use 2-space indentation
- Always use Fastify for HTTP layer (never Express)
- Mongoose for all data models with TypeScript interfaces extending `Document`
- Logger from `src/config/logger.ts` for structured logging (Winston)
- Error responses: `reply.status(4xx).send({ error: "Message" })`
- Success responses: `reply.status(200).send({ data, message })` or `reply.send(data)`

## Critical Security Notes

- Never expose JWT secrets or Razorpay keys in logs
- Session middleware validates `X-Session-ID` header matches `user.activeSessionId`
- CORS configured for specific origins in `src/app.ts`
- File uploads validate type/size before processing
- Admin role checks required for sensitive operations (user management, settings)
