import { WebSocketClient } from "./client/client";
import { logger } from "./server/logger";
import { Gauge, Registry } from "prom-client";

export const register = new Registry();

const eventLoopLag = new Gauge({
  name: "node_eventloop_lag_seconds",
  help: "Event loop lag in seconds",
  registers: [register],
});

const eventLoopUtilization = new Gauge({
  name: "node_eventloop_utilization",
  help: "Event loop utilization percentage",
  registers: [register],
});

let lastTime = process.hrtime();
let lastCpuUsage = process.cpuUsage();

function updateEventLoopMetrics() {
  const newTime = process.hrtime();
  const diff = process.hrtime(lastTime);
  const diffInMs = diff[0] * 1000 + diff[1] / 1e6;

  const lag = Math.max(0, diffInMs - 1000);
  eventLoopLag.set(lag / 1000);

  const cpuUsage = process.cpuUsage(lastCpuUsage);
  const elapsed =
    (newTime[0] - lastTime[0]) * 1e6 + (newTime[1] - lastTime[1]) / 1e3;
  const utilization = ((cpuUsage.user + cpuUsage.system) / elapsed) * 100;

  eventLoopUtilization.set(utilization);

  lastTime = newTime;
  lastCpuUsage = process.cpuUsage();
}

setInterval(updateEventLoopMetrics, 1000);

interface LoadTestOptions {
  numClients: number;
  wsUrl: string;
  messageInterval: number;
  baseMetricsPort: number;
  rampUpTime: number;
  testDuration: number;
  maxConnectionsPerSecond: number;
}

class LoadTest {
  private clients: WebSocketClient[] = [];

  constructor(private options: LoadTestOptions) {}

  public async start() {
    logger.info(
      `Starting load test with ${this.options.numClients} clients...`
    );

    const startTime = Date.now();
    let connectionsEstablished = 0;
    let lastConnectionBatchTime = 0;

    while (connectionsEstablished < this.options.numClients) {
      const now = Date.now();
      const elapsed = (now - startTime) / 1000;

      const targetConnections = Math.min(
        this.options.numClients,
        Math.floor(
          (elapsed / this.options.rampUpTime) * this.options.numClients
        )
      );

      const batchSize = Math.min(
        this.options.maxConnectionsPerSecond,
        targetConnections - connectionsEstablished
      );

      if (batchSize > 0) {
        logger.info(
          `Establishing ${batchSize} new connections... (${
            connectionsEstablished + batchSize
          }/${this.options.numClients})`
        );

        const batchPromises = [];
        for (let i = 0; i < batchSize; i++) {
          const clientId = connectionsEstablished + i + 1;
          const client = new WebSocketClient(
            this.options.wsUrl,
            clientId,
            this.options.messageInterval,
            this.options.baseMetricsPort + clientId
          );

          this.clients.push(client);
          batchPromises.push(client.connect());
        }

        await Promise.all(batchPromises);
        connectionsEstablished += batchSize;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      if ((Date.now() - startTime) / 1000 > this.options.testDuration) {
        logger.info("Test duration reached. Stopping test...");
        break;
      }
    }

    logger.info(
      `Load test running with ${this.clients.length} active connections.`
    );
  }

  public stop() {
    logger.info("Stopping all clients...");
    this.clients.forEach((client) => client.disconnect());
  }
}

const args = process.argv.slice(2);
const getArg = (name: string, defaultValue: string): string => {
  const prefix = `--${name}=`;
  const arg = args.find((arg) => arg.startsWith(prefix));
  return arg ? arg.substring(prefix.length) : defaultValue;
};

const options: LoadTestOptions = {
  numClients: parseInt(getArg("clients", "1000"), 10),
  wsUrl: process.env.WS_URL || "ws://localhost:3000",
  messageInterval: parseInt(getArg("interval", "100"), 10),
  baseMetricsPort: parseInt(process.env.BASE_METRICS_PORT || "9100", 10),
  rampUpTime: parseInt(getArg("rampUp", "60"), 10),
  testDuration: parseInt(getArg("duration", "300"), 10),
  maxConnectionsPerSecond: parseInt(getArg("rate", "50"), 10),
};

logger.info("🚀 Starting Comprehensive Load Test");
logger.info("================================");
logger.info(`Clients:        ${options.numClients}`);
logger.info(`Message Rate:   ${options.messageInterval}ms`);
logger.info(`Ramp-up Time:   ${options.rampUpTime}s`);
logger.info(`Test Duration:  ${options.testDuration}s`);
logger.info(`Max Rate:       ${options.maxConnectionsPerSecond} conn/s`);
logger.info("================================");

const http = require("http");
const metricsServer = http.createServer(async (req: any, res: any) => {
  if (req.url === "/metrics") {
    res.setHeader("Content-Type", register.contentType);
    res.end(await register.metrics());
  } else {
    res.statusCode = 404;
    res.end("Not Found");
  }
});

const METRICS_PORT = 9090;
metricsServer.listen(METRICS_PORT, () => {
  logger.info(`Metrics server running on port ${METRICS_PORT}`);

  const loadTest = new LoadTest(options);
  loadTest.start().catch((err) => {
    logger.error("Load test failed:", err);
    process.exit(1);
  });

  const shutdown = async () => {
    logger.info("\nShutting down load test...");
    loadTest.stop();
    metricsServer.close(() => {
      logger.info("Metrics server stopped");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  setTimeout(() => {
    logger.info("Test duration complete. Initiating shutdown...");
    shutdown();
  }, (options.testDuration + 10) * 1000);
});

logger.info("Load Test Configuration:", JSON.stringify(options, null, 2));
