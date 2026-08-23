import pino from "pino";
import { config } from "../config";

const isProduction = config.env === "production";
const isTest = config.env === "test";

/**
 * Configure and export the global Pino logger instance.
 * Automatically switches log levels and transport depending on environment settings (production vs. development vs. test).
 */
export const logger = pino({
    level: process.env.LOG_LEVEL || (isTest ? "silent" : isProduction ? "info" : "debug"),
    transport:
        isProduction || isTest
            ? undefined
            : {
                  target: "pino-pretty",
                  options: {
                      colorize: true,
                      translateTime: "SYS:standard",
                      ignore: "pid,hostname"
                  }
              }
});
