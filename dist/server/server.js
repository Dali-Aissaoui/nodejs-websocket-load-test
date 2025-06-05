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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketServer = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = __importDefault(require("ws"));
const prom_client_1 = require("prom-client");
class WebSocketServer {
    constructor(port = 3000, metricsPort = 9090) {
        this.clients = new Set();
        this.port = port;
        this.metricsPort = metricsPort;
        this.registry = new prom_client_1.Registry();
        this.wss = new ws_1.default.Server({ noServer: true });
        // Initialize metrics
        (0, prom_client_1.collectDefaultMetrics)({ register: this.registry });
        this.activeConnections = new prom_client_1.Gauge({
            name: "websocket_active_connections",
            help: "Number of active WebSocket connections",
            registers: [this.registry],
        });
        this.messagesReceived = new prom_client_1.Gauge({
            name: "websocket_messages_received",
            help: "Total number of messages received",
            registers: [this.registry],
        });
        this.messagesSent = new prom_client_1.Gauge({
            name: "websocket_messages_sent",
            help: "Total number of messages sent",
            registers: [this.registry],
        });
        this.connectionErrors = new prom_client_1.Gauge({
            name: "websocket_connection_errors",
            help: "Number of connection errors",
            registers: [this.registry],
        });
        this.app = (0, express_1.default)();
        this.setupMetricsServer();
        this.server = http_1.default.createServer(this.app);
        this.setupWebSocketServer();
    }
    setupWebSocketServer() {
        this.wss = new ws_1.default.Server({ server: this.server });
        this.wss.on("connection", (ws) => {
            this.clients.add(ws);
            this.activeConnections.set(this.clients.size);
            console.log(`New connection. Total: ${this.clients.size}`);
            ws.on("message", (message) => {
                this.messagesReceived.inc();
                // Echo the message back to the client
                ws.send(message);
                this.messagesSent.inc();
            });
            ws.on("close", () => {
                this.clients.delete(ws);
                this.activeConnections.set(this.clients.size);
                console.log(`Connection closed. Total: ${this.clients.size}`);
            });
            ws.on("error", (error) => {
                console.error("WebSocket error:", error);
                this.connectionErrors.inc();
            });
        });
    }
    setupMetricsServer() {
        const metricsApp = (0, express_1.default)();
        metricsApp.get("/metrics", (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.set("Content-Type", this.registry.contentType);
                res.end(yield this.registry.metrics());
            }
            catch (error) {
                console.error("Error generating metrics:", error);
                res.status(500).end("Error generating metrics");
            }
        }));
        metricsApp.listen(this.metricsPort, "0.0.0.0", () => {
            console.log(`Metrics server running on port ${this.metricsPort}`);
        });
    }
    start() {
        return new Promise((resolve, reject) => {
            this.server = http_1.default.createServer(this.app);
            this.setupWebSocketServer();
            this.setupMetricsServer();
            this.server.listen(this.port, "0.0.0.0", () => {
                console.log(`WebSocket server running on port ${this.port}`);
                console.log(`WebSocket endpoint: ws://0.0.0.0:${this.port}`);
                console.log(`Metrics endpoint: http://0.0.0.0:${this.metricsPort}/metrics`);
                resolve();
            }).on('error', (error) => {
                console.error('Failed to start server:', error);
                reject(error);
            });
        });
    }
    stop() {
        return new Promise((resolve) => {
            // Close WebSocket server
            this.wss.close(() => {
                // Close HTTP server
                this.server.close(() => {
                    // Close all client connections
                    this.clients.forEach((client) => {
                        if (client.readyState === ws_1.default.OPEN) {
                            client.terminate();
                        }
                    });
                    this.clients.clear();
                    console.log('Server stopped');
                    resolve();
                });
            });
        });
    }
}
exports.WebSocketServer = WebSocketServer;
// Start server if this file is run directly
if (require.main === module) {
    const port = parseInt(process.env.PORT || "3000", 10);
    const metricsPort = parseInt(process.env.METRICS_PORT || "9090", 10);
    const server = new WebSocketServer(port, metricsPort);
    server.start();
    // Handle graceful shutdown
    process.on("SIGINT", () => {
        console.log("Shutting down server...");
        server.stop();
        process.exit(0);
    });
}
//# sourceMappingURL=server.js.map