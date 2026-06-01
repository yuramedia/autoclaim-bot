import pino from "pino";
import { config } from "../config";

const isProduction = config.env === "production";

// Configure pino logger
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
