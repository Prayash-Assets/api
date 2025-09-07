import { createApp } from "./app";

// Local server start (for development)
const startLocal = async () => {
  try {
    const app = await createApp();

    await app.listen({
      port: Number(process.env.PORT) || 3000,
      host: "0.0.0.0",
    });

    console.log(`Server listening on port ${Number(process.env.PORT) || 3000}`);
  } catch (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
};

// Only start the server if this file is being run directly (not imported)
if (require.main === module) {
  startLocal();
}
