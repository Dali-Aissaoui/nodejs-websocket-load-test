import WebSocket from "ws";
import { Gauge, Registry } from "prom-client";
import { logger } from "../server/logger";
import { createServer } from "http";

const metrics = (() => {
  const labelNames = ["client_id"];
  return {
    messagesSent: new Gauge({
      name: "websocket_client_messages_sent",
      help: "Total number of messages sent by the WebSocket client",
      labelNames,
    }),
    messagesReceived: new Gauge({
      name: "websocket_client_messages_received",
      help: "Total number of messages received by the WebSocket client",
      labelNames,
    }),
    connectionErrors: new Gauge({
      name: "websocket_client_connection_errors",
      help: "Total number of connection errors encountered by the WebSocket client",
      labelNames,
    }),
  };
})();

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000;
  private isConnected = false;
  private messageCount = 0;
  private metricsPort: number;
  private metricsServer: any;
  private static metricsRegistered = false;

  constructor(
    private readonly url: string,
    public readonly clientId: number,
    private readonly messageInterval: number,
    metricsPort: number
  ) {
    this.metricsPort = metricsPort;
    this.setupMetrics();
  }

  public connect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.on("open", () => {
        logger.info(`Client ${this.clientId} connected`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startSendingMessages();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        metrics.messagesReceived.inc({ client_id: this.clientId.toString() });
        logger.debug(`Client ${this.clientId} received: ${data.toString()}`);
      });

      this.ws.on("close", () => {
        logger.info(`Client ${this.clientId} disconnected`);
        this.isConnected = false;
        this.handleReconnect();
      });

      this.ws.on("error", (error: Error) => {
        logger.error(`Client ${this.clientId} error:`, error);
        metrics.connectionErrors.inc({ client_id: this.clientId.toString() });
        this.handleReconnect();
      });
    } catch (error) {
      logger.error(`Client ${this.clientId} connection error:`, error);
      metrics.connectionErrors.inc({ client_id: this.clientId.toString() });
      this.handleReconnect();
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
      logger.info(`Client ${this.clientId} disconnected`);
    }

    if (this.metricsServer) {
      this.metricsServer.close(() => {
        WebSocketClient.metricsRegistered = false;
        logger.info(`Metrics server on port ${this.metricsPort} stopped`);
      });
    }
  }

  private startSendingMessages(): void {
    if (!this.ws || !this.isConnected) return;

    const interval = setInterval(() => {
      if (this.messageCount >= 1000) {
        clearInterval(interval);
        return;
      }

      const message = JSON.stringify({
        type: "echo",
        data: `Message ${this.messageCount + 1} from client ${this.clientId}`,
        timestamp: Date.now(),
      });

      try {
        this.ws?.send(message);
        metrics.messagesSent.inc({ client_id: this.clientId.toString() });
        this.messageCount++;
        logger.debug(`Client ${this.clientId} sent: ${message}`);
      } catch (error) {
        logger.error(`Client ${this.clientId} failed to send message:`, error);
        metrics.connectionErrors.inc({ client_id: this.clientId.toString() });
        clearInterval(interval);
        this.reconnect();
      }
    }, this.messageInterval);
  }

  private reconnect(): void {
    this.disconnect();
    this.connect();
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(`Client ${this.clientId} max reconnection attempts reached`);
      metrics.connectionErrors.inc({ client_id: this.clientId.toString() });
      return;
    }

    this.reconnectAttempts++;
    logger.info(
      `Client ${this.clientId} reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  private setupMetrics(): void {
    if (!WebSocketClient.metricsRegistered) {
      const register = new Registry();
      register.setDefaultLabels({ app: "websocket-client" });

      register.registerMetric(metrics.messagesSent);
      register.registerMetric(metrics.messagesReceived);
      register.registerMetric(metrics.connectionErrors);

      this.metricsServer = createServer(async (req: any, res: any) => {
        if (req.url === "/metrics") {
          res.setHeader("Content-Type", register.contentType);
          res.end(await register.metrics());
        } else {
          res.statusCode = 404;
          res.end("Not Found");
        }
      });

      this.metricsServer.listen(this.metricsPort, () => {
        logger.info(
          `Client ${this.clientId} metrics server running on port ${this.metricsPort}`
        );
      });

      WebSocketClient.metricsRegistered = true;
    } else {
      // Reuse the existing metrics server for subsequent clients
      this.metricsServer = null;
    }
  }
}
