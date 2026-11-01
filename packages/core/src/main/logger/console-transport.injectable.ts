/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { format, transports } from "winston";
import { ConsoleFormat } from "./console-format";
import { loggerTransportInjectionToken } from "@openlens/logger";
import logLevelInjectable from "./level.injectable";

const ignoreClosedPipe = (error: NodeJS.ErrnoException) => {
  if (error?.code === "EPIPE") {
    return;
  }
};

const consoleLoggerTransportInjectable = getInjectable({
  id: "console-logger-transport",
  instantiate: (di) => {
    // A closed stdout pipe makes Console.log throw EPIPE. Electron shows that
    // as an uncaught main-process exception unless something handles it.
    process.stdout.on("error", ignoreClosedPipe);
    process.stderr.on("error", ignoreClosedPipe);

    const transport = new transports.Console({
      handleExceptions: false,
      level: di.inject(logLevelInjectable),
      format: format.combine(
        format.colorize({ level: true, message: false }),
        format.padLevels(),
        format.ms(),
        new ConsoleFormat({
          showMeta: true,
          inspectOptions: {
            depth: 4,
            colors: true,
            maxArrayLength: 10,
            breakLength: 120,
            compact: Infinity,
          },
        }),
      ),
    });

    const log = transport.log.bind(transport);

    transport.log = (info, callback) => {
      try {
        log(info, callback);
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === "EPIPE") {
          callback?.();

          return;
        }

        throw error;
      }
    };

    return transport;
  },
  injectionToken: loggerTransportInjectionToken,
  decorable: false,
});

export default consoleLoggerTransportInjectable;
