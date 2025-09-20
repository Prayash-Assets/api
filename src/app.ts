import dotenv from "dotenv";
import Fastify, { FastifyInstance } from "fastify";
import connectDB from "./config/db";
import userRoutes from "./routes/userRoutes";
import levelRoutes from "./routes/levelRoutes";
import roleRoutes from "./routes/roleRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import subjectRoutes from "./routes/subjectRoutes";
import { questionRoutes } from "./routes/questionRoutes";
import { mockTestRoutes } from "./routes/mockTestRoutes";
import authRoutes from "./routes/authRoutes";
import packageRoutes from "./routes/packageRoutes";
import purchaseRoutes from "./routes/purchaseRoutes";
import { resultRoutes } from "./routes/resultRoutes";
import settingsRoutes from "./routes/settings.routes";
import studentRoutes from "./routes/studentRoutes";
import mediaRoutes from "./routes/mediaRoutes";
import dashboardRoutes from "./routes/dashboardRoutes";
import testRoutes from "./routes/testRoutes";
import webhookRoutes from "./routes/webhookRoutes";

import cors from "@fastify/cors";

// Load environment variables
dotenv.config();

export const createApp = async (): Promise<FastifyInstance> => {
  const app: FastifyInstance = Fastify({
    logger: process.env.NODE_ENV !== "production",
  });



  // Register multipart plugin for file uploads
  await app.register(require("@fastify/multipart"), {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
      files: 1, // Allow only 1 file per request
    },
  });


  await app.register(cors, {
    origin: [
      'https://main.d29juw0qooqw8k.amplifyapp.com',
      'http://localhost:3000', // For local development
      'https://api.prayashassets.com' // Allow API domain for preflight
    ],
    methods: ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Origin", "Accept", "X-Requested-With"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 200
  });

  // Handle AWS API Gateway stage prefix
  app.addHook("onRequest", async (request, reply) => {
    const originalUrl = request.url;
    if (request.url.startsWith('/prod/')) {
      request.raw.url = request.url.substring(5);
    } else if (request.url === '/prod') {
      request.raw.url = '/';
    }
    console.log(`URL: ${originalUrl} -> ${request.raw.url}`);
  });

  // Connect to Database (ensure connection is established)
  await connectDB();

  // Root endpoint - register first
  app.get("/", async (request, reply) => {
    return { message: "Prayash API is running!" };
  });

  // Health check endpoint
  app.get("/health", async (request, reply) => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Register routes
  await app.register(userRoutes, { prefix: "/api" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(levelRoutes, { prefix: "/api/levels" });
  await app.register(roleRoutes, { prefix: "/api/roles" });
  await app.register(categoryRoutes, { prefix: "/api/categories" });
  await app.register(subjectRoutes, { prefix: "/api/subjects" });
  await app.register(questionRoutes, { prefix: "/api/questions" });
  await app.register(mockTestRoutes, { prefix: "/api/mocktests" });
  await app.register(packageRoutes, { prefix: "/api/packages" });
  await app.register(purchaseRoutes, { prefix: "/api/purchases" });
  await app.register(resultRoutes, { prefix: "/api" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(studentRoutes, { prefix: "/api/students" });
  await app.register(mediaRoutes, { prefix: "/api/media" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  await app.register(testRoutes, { prefix: "/api/test" });
  await app.register(webhookRoutes, { prefix: "/api/webhooks" });

  return app;
};
