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
exports.WebSocketClient = void 0;
// src/client/client.ts
const ws_1 = __importDefault(require("ws"));
const prom_client_1 = require("prom-client");
const logger_1 = require("../server/logger");
class WebSocketClient {
    constructor(url, clientId, messageInterval, metricsPort) {
        this.url = url;
        this.clientId = clientId;
        this.messageInterval = messageInterval;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000; // 5 seconds
        this.isConnected = false;
        this.messageCount = 0;
        this.metricsPort = metricsPort;
        this.metrics = {
            messagesSent: new prom_client_1.Gauge({ name: "default", help: "" }),
            messagesReceived: new prom_client_1.Gauge({ name: "default", help: "" }),
            connectionErrors: new prom_client_1.Gauge({ name: "default", help: "" }),
        };
        this.setupMetrics();
    }
    connect() {
        try {
            this.ws = new ws_1.default(this.url);
            this.ws.on("open", () => {
                logger_1.logger.info(`Client ${this.clientId} connected`);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.startSendingMessages();
            });
            this.ws.on("message", (data) => {
                this.metrics.messagesReceived.inc();
                logger_1.logger.debug(`Client ${this.clientId} received: ${data.toString()}`);
            });
            this.ws.on("close", () => {
                logger_1.logger.info(`Client ${this.clientId} disconnected`);
                this.isConnected = false;
                this.handleReconnect();
            });
            this.ws.on("error", (error) => {
                logger_1.logger.error(`Client ${this.clientId} error:`, error);
                this.metrics.connectionErrors.inc();
                this.handleReconnect();
            });
        }
        catch (error) {
            logger_1.logger.error(`Client ${this.clientId} connection error:`, error);
            this.metrics.connectionErrors.inc();
            this.handleReconnect();
        }
    }
    disconnect() {
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
        this.isConnected = false;
    }
    startSendingMessages() {
        if (!this.isConnected)
            return;
        const sendMessage = () => {
            var _a;
            if (!this.isConnected)
                return;
            const message = JSON.stringify({
                clientId: this.clientId,
                message: `Hello from client ${this.clientId}`,
                timestamp: Date.now(),
                count: ++this.messageCount,
            });
            (_a = this.ws) === null || _a === void 0 ? void 0 : _a.send(message, (error) => {
                if (error) {
                    logger_1.logger.error(`Client ${this.clientId} failed to send message:`, error);
                    this.metrics.connectionErrors.inc();
                    return;
                }
                this.metrics.messagesSent.inc();
            });
            if (this.isConnected) {
                setTimeout(sendMessage, this.messageInterval);
            }
        };
        sendMessage();
    }
    handleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger_1.logger.error(`Client ${this.clientId} max reconnection attempts reached`);
            return;
        }
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        logger_1.logger.info(`Client ${this.clientId} reconnecting in ${delay}ms...`);
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, delay);
    }
    setupMetrics() {
        const register = new prom_client_1.Registry();
        register.setDefaultLabels({ clientId: this.clientId.toString() });
        this.metrics = {
            messagesSent: new prom_client_1.Gauge({
                name: "websocket_client_messages_sent",
                help: "Number of messages sent by the client",
                registers: [register],
            }),
            messagesReceived: new prom_client_1.Gauge({
                name: "websocket_client_messages_received",
                help: "Number of messages received by the client",
                registers: [register],
            }),
            connectionErrors: new prom_client_1.Gauge({
                name: "websocket_client_connection_errors",
                help: "Number of connection errors",
                registers: [register],
            }),
        };
        // Start metrics server
        const express = require("express");
        const app = express();
        app.get("/metrics", (req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                res.set("Content-Type", register.contentType);
                res.end(yield register.metrics());
            }
            catch (error) {
                res.status(500).end(error);
            }
        }));
        this.metricsServer = app.listen(this.metricsPort, "0.0.0.0", () => {
            logger_1.logger.info(`Client ${this.clientId} metrics server running on port ${this.metricsPort}`);
        });
    }
}
exports.WebSocketClient = WebSocketClient;
//# sourceMappingURL=client.js.map