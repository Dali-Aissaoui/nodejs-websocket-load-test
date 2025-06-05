"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChildLogger = exports.logger = void 0;
const winston_1 = require("winston");
const { combine, timestamp, printf, colorize } = winston_1.format;
// Custom format for console output
const consoleFormat = printf((_a) => {
    var { level, message, timestamp } = _a, meta = __rest(_a, ["level", "message", "timestamp"]);
    const metaString = Object.keys(meta).length
        ? ` ${JSON.stringify(meta, null, 2)}`
        : "";
    return `[${timestamp}] ${level}: ${message}${metaString}`;
});
// Create logger instance
exports.logger = (0, winston_1.createLogger)({
    level: process.env.LOG_LEVEL || "info",
    format: combine(timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), colorize(), consoleFormat),
    transports: [new winston_1.transports.Console()],
});
// Create a child logger with default metadata
const createChildLogger = (context) => {
    return exports.logger.child({ context });
};
exports.createChildLogger = createChildLogger;
//# sourceMappingURL=logger.js.map