import { format, createLogger, transports } from "winston";

const { combine, timestamp, printf, colorize } = format;

const consoleFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length
    ? ` ${JSON.stringify(meta, null, 2)}`
    : "";
  return `[${timestamp}] ${level}: ${message}${metaString}`;
});

export const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    colorize(),
    consoleFormat
  ),
  transports: [new transports.Console()],
});

export const createChildLogger = (context: string) => {
  return logger.child({ context });
};
