import "dotenv/config";
import { WebSocketServer } from "./server";
import { logger } from "./logger";

const server = new WebSocketServer(
  parseInt(process.env.PORT || "3000", 10),
  parseInt(process.env.METRICS_PORT || "9090", 10)
);

const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  try {
    await server.stop();
    logger.info("Server stopped");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  shutdown("uncaughtException").catch(() => process.exit(1));
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

setInterval(() => {
  const memoryUsage = process.memoryUsage();
  logger.info("Memory usage:", {
    rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
    heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
    heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
    external: `${((memoryUsage as any).external / 1024 / 1024 || 0).toFixed(
      2
    )} MB`,
  });
}, 30000);

async function main() {
  try {
    await server.start();
    logger.info("Server started successfully");
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
