import {
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
  Counter,
} from "prom-client";

class Metrics {
  private register: Registry;


  public activeConnections: Gauge;
  public connectionErrors: Counter;
  public connectionDuration: Histogram;

  public messagesReceived: Counter;
  public messagesBroadcasted: Counter;
  public messageProcessingTime: Histogram;
  public messageSize: Histogram;

  public memoryUsage: Gauge;
  public eventLoopLag: Gauge;
  public cpuUsage: Gauge;
  public httpRequestDuration: Histogram;

  public errors: Counter;

  public readonly contentType: string;

  private lastCpuUsage: NodeJS.CpuUsage;
  private lastMemoryUsage: NodeJS.MemoryUsage;
  private lastMeasurementTime: number;
  private updateInterval?: NodeJS.Timeout;

  constructor() {
    this.register = new Registry();
    this.contentType = this.register.contentType;
    this.lastCpuUsage = process.cpuUsage();
    this.lastMemoryUsage = process.memoryUsage();
    this.lastMeasurementTime = Date.now();

    collectDefaultMetrics({
      register: this.register,  
      prefix: "node_",
      gcDurationBuckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5],
      eventLoopMonitoringPrecision: 10,
    });

    this.activeConnections = new Gauge({
      name: "websocket_connections_active",
      help: "Number of active WebSocket connections",
      labelNames: ["status"],
      registers: [this.register],
    });

    this.connectionErrors = new Counter({
      name: "websocket_connection_errors_total",
      help: "Total number of WebSocket connection errors",
      labelNames: ["type"],
      registers: [this.register],
    });

    this.connectionDuration = new Histogram({
      name: "websocket_connection_duration_seconds",
      help: "Duration of WebSocket connections in seconds",
      buckets: [1, 5, 15, 30, 60, 120, 300, 600, 1800, 3600],
      labelNames: ["status"],
      registers: [this.register],
    });

    this.messagesReceived = new Counter({
      name: "websocket_messages_received_total",
      help: "Total number of messages received",
      labelNames: ["type"],
      registers: [this.register],
    });

    this.messagesBroadcasted = new Counter({
      name: "websocket_messages_broadcasted_total",
      help: "Total number of messages broadcasted",
      registers: [this.register],
    });

    this.messageProcessingTime = new Histogram({
      name: "websocket_message_processing_seconds",
      help: "Time spent processing WebSocket messages",
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
      labelNames: ["message_type"],
      registers: [this.register],
    });

    this.messageSize = new Histogram({
      name: "websocket_message_size_bytes",
      help: "Size of WebSocket messages in bytes",
      buckets: [64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768],
      labelNames: ["message_type"],
      registers: [this.register],
    });

    this.memoryUsage = new Gauge({
      name: "node_memory_usage_bytes",
      help: "Memory usage in bytes",
      labelNames: ["type"],
      registers: [this.register],
    });

    this.eventLoopLag = new Gauge({
      name: "node_eventloop_lag_seconds",
      help: "Event loop lag in seconds",
      registers: [this.register],
    });

    this.cpuUsage = new Gauge({
      name: "node_cpu_usage_percent",
      help: "CPU usage percentage",
      labelNames: ["mode"],
      registers: [this.register],
    });

    this.httpRequestDuration = new Histogram({
      name: "http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
      registers: [this.register],
    });

    this.errors = new Counter({
      name: "node_errors_total",
      help: "Total number of errors",
      labelNames: ["type"],
      registers: [this.register],
    });

    this.startPeriodicUpdates();

    this.setupProcessEventHandlers();
  }

  private startPeriodicUpdates() {
    setInterval(() => {
      const memory = process.memoryUsage();
      this.memoryUsage.labels('rss').set(memory.rss);
      this.memoryUsage.labels('heapTotal').set(memory.heapTotal);
      this.memoryUsage.labels('heapUsed').set(memory.heapUsed);
      this.memoryUsage.labels('external').set(memory.external || 0);
      if ('arrayBuffers' in memory) {
        this.memoryUsage.labels('arrayBuffers').set((memory as any).arrayBuffers);
      }
    }, 5000);

    const start = process.hrtime();
    setInterval(() => {
      const delta = process.hrtime(start);
      const nanosec = delta[0] * 1e9 + delta[1];
      const seconds = nanosec / 1e9;
      this.eventLoopLag.set(seconds - Math.floor(seconds));
    }, 1000);

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

  private setupProcessEventHandlers() {
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

  public getMetrics() {
    return this.register.metrics();
  }

  public getRegister() {
    return this.register;
  }

  public cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.register.clear();
  }
}

export const metrics = new Metrics();
