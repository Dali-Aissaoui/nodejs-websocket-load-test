"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const server_1 = require("./server");
const logger_1 = require("./logger");
// Create WebSocket server
const server = new server_1.WebSocketServer(parseInt(process.env.PORT || "3000", 10), parseInt(process.env.METRICS_PORT || "9090", 10));
// Handle process termination
const shutdown = (signal) => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.logger.info(`${signal} received. Shutting down gracefully...`);
    try {
        yield server.stop();
        logger_1.logger.info('Server stopped');
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Error during shutdown:', error);
        process.exit(1);
    }
});
// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
    logger_1.logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    logger_1.logger.error("Uncaught Exception:", error);
    shutdown('uncaughtException').catch(() => process.exit(1));
});
// Handle process termination signals
process.on("SIGTERM", () => shutdown('SIGTERM'));
process.on("SIGINT", () => shutdown('SIGINT'));
// Log memory usage every 30 seconds
setInterval(() => {
    const memoryUsage = process.memoryUsage();
    logger_1.logger.info("Memory usage:", {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryUsage.external / 1024 / 1024 || 0).toFixed(2)} MB`,
    });
}, 30000);
// Start the server
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield server.start();
            logger_1.logger.info('Server started successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to start server:', error);
            process.exit(1);
        }
    });
}
// Start the application
main().catch((error) => {
    logger_1.logger.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map