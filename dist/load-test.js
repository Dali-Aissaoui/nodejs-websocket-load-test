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
const client_1 = require("./client/client");
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_1 = require("./server/logger");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class LoadTest {
    constructor(options) {
        this.options = options;
        this.clients = [];
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info(`Starting load test with ${this.options.numClients} clients...`);
            // Start clients
            for (let i = 1; i <= this.options.numClients; i++) {
                const client = new client_1.WebSocketClient(this.options.wsUrl, i, this.options.messageInterval, this.options.baseMetricsPort + i);
                this.clients.push(client);
                client.connect();
                // Stagger connections to avoid thundering herd
                yield new Promise((resolve) => setTimeout(resolve, 50));
            }
            logger_1.logger.info("All clients started. Press Ctrl+C to stop.");
        });
    }
    stop() {
        logger_1.logger.info("Stopping all clients...");
        this.clients.forEach((client) => client.disconnect());
    }
}
// Parse command line arguments or use environment variables
const options = {
    numClients: parseInt(process.env.NUM_CLIENTS || "10", 10),
    wsUrl: process.env.WS_URL || "ws://localhost:3000",
    messageInterval: parseInt(process.env.MESSAGE_INTERVAL || "1000", 10),
    baseMetricsPort: parseInt(process.env.BASE_METRICS_PORT || "9100", 10),
};
// Start load test
const loadTest = new LoadTest(options);
loadTest.start();
// Handle graceful shutdown
process.on("SIGINT", () => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.logger.info("Shutting down load test...");
    loadTest.stop();
    process.exit(0);
}));
// Log system information
logger_1.logger.info("Load Test Configuration:", JSON.stringify(options, null, 2));
//# sourceMappingURL=load-test.js.map