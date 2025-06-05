import express from "express";
import http from "http";
import WebSocket from "ws";
import { collectDefaultMetrics, Gauge, Registry } from "prom-client";

export class WebSocketServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocket.Server;
  private port: number;
  private metricsPort: number;
  private clients: Set<WebSocket> = new Set();
  private registry: Registry;

  private activeConnections: Gauge;
  private messagesReceived: Gauge;
  private messagesSent: Gauge;
  private connectionErrors: Gauge;

  constructor(
    port: number = 3000,
    metricsPort: number = parseInt(process.env.METRICS_PORT || "9100", 10)
  ) {
    this.port = port;
    this.metricsPort = metricsPort;
    this.registry = new Registry();
    this.wss = new WebSocket.Server({ noServer: true });

    collectDefaultMetrics({ register: this.registry });

    this.activeConnections = new Gauge({
      name: "websocket_active_connections",
      help: "Number of active WebSocket connections",
      registers: [this.registry],
    });

    this.messagesReceived = new Gauge({
      name: "websocket_messages_received",
      help: "Total number of messages received",
      registers: [this.registry],
    });

    this.messagesSent = new Gauge({
      name: "websocket_messages_sent",
      help: "Total number of messages sent",
      registers: [this.registry],
    });

    this.connectionErrors = new Gauge({
      name: "websocket_connection_errors",
      help: "Number of connection errors",
      registers: [this.registry],
    });

    this.app = express();
    this.server = http.createServer(this.app);
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss = new WebSocket.Server({ server: this.server });

    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      this.activeConnections.set(this.clients.size);
      console.log(`New connection. Total: ${this.clients.size}`);

      ws.on("message", (message: string) => {
        this.messagesReceived.inc();
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

  private setupMetricsServer() {
    const metricsApp = express();

    metricsApp.get("/metrics", async (req, res) => {
      try {
        res.set("Content-Type", this.registry.contentType);
        res.end(await this.registry.metrics());
      } catch (error) {
        console.error("Error generating metrics:", error);
        res.status(500).end("Error generating metrics");
      }
    });

    metricsApp.listen(this.metricsPort, "0.0.0.0", () => {
      console.log(`Metrics server running on port ${this.metricsPort}`);
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.app);
      this.setupWebSocketServer();
      this.setupMetricsServer();

      this.server
        .listen(this.port, "0.0.0.0", () => {
          console.log(`WebSocket server running on port ${this.port}`);
          console.log(`WebSocket endpoint: ws://0.0.0.0:${this.port}`);
          console.log(
            `Metrics endpoint: http://0.0.0.0:${this.metricsPort}/metrics`
          );
          resolve();
        })
        .on("error", (error) => {
          console.error("Failed to start server:", error);
          reject(error);
        });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.terminate();
            }
          });
          this.clients.clear();
          console.log("Server stopped");
          resolve();
        });
      });
    });
  }
}

if (require.main === module) {
  const port = parseInt(process.env.PORT || "3000", 10);
  const metricsPort = parseInt(process.env.METRICS_PORT || "9100", 10);

  const server = new WebSocketServer(port, metricsPort);
  server.start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

  process.on("SIGINT", () => {
    console.log("Shutting down server...");
    server.stop();
    process.exit(0);
  });
}
