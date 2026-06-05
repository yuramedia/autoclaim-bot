import pino from "pino";
import { config } from "../config";

const isProduction = config.env === "production";

/**
 * Configure and export the global Pino logger instance.
 * Automatically switches log levels and transport depending on environment settings (production vs. development).
 */
export const logger = pino({
    level: isProduction ? "info" : "debug",
    transport: isProduction
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
