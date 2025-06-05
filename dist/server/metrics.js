"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metrics = void 0;
const prom_client_1 = require("prom-client");
class Metrics {
    constructor() {
        this.register = new prom_client_1.Registry();
        this.contentType = this.register.contentType;
        this.lastCpuUsage = process.cpuUsage();
        this.lastMemoryUsage = process.memoryUsage();
        this.lastMeasurementTime = Date.now();
        // Register default metrics with custom prefix and configuration
        (0, prom_client_1.collectDefaultMetrics)({
            register: this.register,
            prefix: "node_",
            gcDurationBuckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
            eventLoopMonitoringPrecision: 10,
        });
        // Connection metrics
        this.activeConnections = new prom_client_1.Gauge({
            name: "websocket_connections_active",
            help: "Number of active WebSocket connections",
            labelNames: ["status"],
            registers: [this.register],
        });
        this.connectionErrors = new prom_client_1.Counter({
            name: "websocket_connection_errors_total",
            help: "Total number of WebSocket connection errors",
            labelNames: ["type"],
            registers: [this.register],
        });
        this.connectionDuration = new prom_client_1.Histogram({
            name: "websocket_connection_duration_seconds",
            help: "Duration of WebSocket connections in seconds",
            buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600],
            labelNames: ["status"],
            registers: [this.register],
        });
        // Message metrics
        this.messagesReceived = new prom_client_1.Counter({
            name: "websocket_messages_received_total",
            help: "Total number of messages received",
            labelNames: ["type"],
            registers: [this.register],
        });
        this.messagesBroadcasted = new prom_client_1.Counter({
            name: "websocket_messages_broadcasted_total",
            help: "Total number of messages broadcasted",
            registers: [this.register],
        });
        this.messageProcessingTime = new prom_client_1.Histogram({
            name: "websocket_message_processing_seconds",
            help: "Time spent processing WebSocket messages",
            buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
            labelNames: ["message_type"],
            registers: [this.register],
        });
        this.messageSize = new prom_client_1.Histogram({
            name: "websocket_message_size_bytes",
            help: "Size of WebSocket messages in bytes",
            buckets: [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768],
            labelNames: ["message_type"],
            registers: [this.register],
        });
        // System metrics
        this.memoryUsage = new prom_client_1.Gauge({
            name: "node_memory_usage_bytes",
            help: "Memory usage in bytes",
            labelNames: ["type"],
            registers: [this.register],
        });
        this.eventLoopLag = new prom_client_1.Gauge({
            name: "node_eventloop_lag_seconds",
            help: "Event loop lag in seconds",
            registers: [this.register],
        });
        this.cpuUsage = new prom_client_1.Gauge({
            name: "node_cpu_usage_percent",
            help: "CPU usage percentage",
            labelNames: ["mode"],
            registers: [this.register],
        });
        this.httpRequestDuration = new prom_client_1.Histogram({
            name: "http_request_duration_seconds",
            help: "HTTP request duration in seconds",
            labelNames: ["method", "route", "status_code"],
            buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
            registers: [this.register],
        });
        // Error metrics
        this.errors = new prom_client_1.Counter({
            name: "node_errors_total",
            help: "Total number of errors",
            labelNames: ["type"],
            registers: [this.register],
        });
        // Start periodic updates
        this.startPeriodicUpdates();
        // Track process events
        this.setupProcessEventHandlers();
    }
    startPeriodicUpdates() {
        // Monitor memory usage
        setInterval(() => {
            const memory = process.memoryUsage();
            this.memoryUsage.labels('rss').set(memory.rss);
            this.memoryUsage.labels('heapTotal').set(memory.heapTotal);
            this.memoryUsage.labels('heapUsed').set(memory.heapUsed);
            this.memoryUsage.labels('external').set(memory.external || 0);
            if ('arrayBuffers' in memory) {
                this.memoryUsage.labels('arrayBuffers').set(memory.arrayBuffers);
            }
        }, 5000);
        // Monitor event loop lag
        const start = process.hrtime();
        setInterval(() => {
            const delta = process.hrtime(start);
            const nanosec = delta[0] * 1e9 + delta[1];
            const seconds = nanosec / 1e9;
            this.eventLoopLag.set(seconds - Math.floor(seconds));
        }, 1000);
        // Monitor CPU usage
        let lastCPUUsage = process.cpuUsage();
        let lastTime = Date.now();
        setInterval(() => {
            const currentCPUUsage = process.cpuUsage();
            const currentTime = Date.now();
            const userUsageMicros = currentCPUUsage.user - lastCPUUsage.user;
            const systemUsageMicros = currentCPUUsage.system - lastCPUUsage.system;
            const timeElapsed = (currentTime - lastTime) * 1000; // in microseconds
            const totalUsage = userUsageMicros + systemUsageMicros;
            const cpuPercent = (totalUsage / timeElapsed) * 100;
            this.cpuUsage.set(cpuPercent);
            lastCPUUsage = currentCPUUsage;
            lastTime = currentTime;
        }, 5000);
    }
    setupProcessEventHandlers() {
        process.on("exit", () => this.cleanup());
        process.on("SIGINT", () => this.cleanup());
        process.on("SIGTERM", () => this.cleanup());
        process.on("uncaughtException", (err) => {
            this.errors.inc({ type: "uncaught_exception" });
            console.error("Uncaught exception:", err);
        });
        process.on("unhandledRejection", (reason) => {
            this.errors.inc({ type: "unhandled_rejection" });
            console.error("Unhandled rejection:", reason);
        });
    }
    getMetrics() {
        return this.register.metrics();
    }
    getRegister() {
        return this.register;
    }
    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.register.clear();
    }
}
// Create a singleton instance
exports.metrics = new Metrics();
//# sourceMappingURL=metrics.js.map