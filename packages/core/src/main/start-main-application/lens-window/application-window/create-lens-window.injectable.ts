/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { loggerInjectionToken } from "@openlens/logger";
import type { ContentSource, ElectronWindowTitleBarStyle } from "./create-electron-window.injectable";
import createElectronWindowInjectable from "./create-electron-window.injectable";
import type { ClusterFrameInfo } from "../../../../common/cluster-frames.injectable";

export interface ElectronWindow {
  show: () => void;
  close: () => void;
  send: (args: SendToViewArgs) => void;
  loadFile: (filePath: string) => Promise<void>;
  loadUrl: (url: string) => Promise<void>;
  reload: () => void;
}

export interface SendToViewArgs {
  channel: string;
  frameInfo?: ClusterFrameInfo;
  data?: unknown;
}

export interface LensWindow {
  id: string;
  start: () => Promise<void>;
  close: () => void;
  show: () => void;
  send: (args: SendToViewArgs) => void;
  isVisible: boolean;
  isStarting: boolean;
  reload: () => void;
}

export interface LensWindowConfiguration {
  id: string;
  title: string;
  defaultHeight: number;
  defaultWidth: number;
  getContentSource: () => ContentSource;
  resizable: boolean;
  windowFrameUtilitiesAreShown: boolean;
  centered: boolean;
  titleBarStyle?: ElectronWindowTitleBarStyle;

  /**
   * This function is called before the ContentSource is used and then awaited after
   * the open call resolves
   */
  beforeOpen?: () => Promise<void>;
  onFocus?: () => void;
  onBlur?: () => void;
  onDomReady?: () => void;
  onClose?: () => void;
}

const createLensWindowInjectable = getInjectable({
  id: "create-lens-window",

  instantiate: (di) => {
    const createElectronWindow = di.inject(createElectronWindowInjectable);
    const logger = di.inject(loggerInjectionToken);

    return (configuration: LensWindowConfiguration): LensWindow => {
      let browserWindow: ElectronWindow | undefined;

      let windowIsShown = false;
      let windowIsStarting = false;

      const showWindow = () => {
        if (!browserWindow) {
          throw new Error("Cannot show browserWindow, does not exist");
        }

        browserWindow.show();
        windowIsShown = true;
      };

      return {
        id: configuration.id,

        get isVisible() {
          return windowIsShown;
        },

        get isStarting() {
          return windowIsStarting;
        },

        start: async () => {
          if (!browserWindow) {
            windowIsStarting = true;

            browserWindow = createElectronWindow({
              ...configuration,
              onClose: () => {
                browserWindow = undefined;
                windowIsShown = false;
              },
            });

            const {
              file: filePathForContent,
              url: urlForContent,
            } = configuration.getContentSource();

            const beforeOpen = configuration.beforeOpen?.();

            if (filePathForContent) {
              await browserWindow.loadFile(filePathForContent);
              await beforeOpen;
            } else if (urlForContent) {
              const url = urlForContent;
              const target = browserWindow;

              // Show first. lens.app and cluster connection continue after the window is visible.
              showWindow();
              windowIsStarting = false;

              void beforeOpen?.catch((error: unknown) => {
                logger.error(
                  `[CREATE-LENS-WINDOW]: beforeOpen failed for "${configuration.id}"`,
                  { error },
                );
              });

              try {
                await target.loadUrl(url);
                logger.info(
                  `[CREATE-LENS-WINDOW]: window "${configuration.id}" finished loading ${url}`,
                );
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);

                logger.error(
                  `[CREATE-LENS-WINDOW]: window "${configuration.id}" failed to load ${url}: ${message}`,
                );

                void target.loadUrl(startupFailureDocument(url, message)).catch((fallbackError: unknown) => {
                  logger.error(
                    `[CREATE-LENS-WINDOW]: failed to show startup error in "${configuration.id}"`,
                    { error: fallbackError },
                  );
                });
              }

              return;
            }
          }

          showWindow();

          windowIsStarting = false;
        },

        show: showWindow,

        close: () => {
          browserWindow?.close();
          browserWindow = undefined;
          windowIsShown = false;
          configuration.onClose?.();
        },

        send: (args: SendToViewArgs) => {
          if (!browserWindow) {
            throw new Error(`Tried to send message to window "${configuration.id}" but the window was closed`);
          }

          return browserWindow.send(args);
        },

        reload: () => {
          if (!browserWindow) {
            throw new Error(`Tried to reload window "${configuration.id}" but the window was closed`);
          }

          return browserWindow.reload();
        },
      };
    };
  },
});

function startupFailureDocument(url: string, message: string): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      default: return "&#39;";
    }
  });

  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>OpenLens</title></head>
<body style="margin:0;background:#141414;color:#C8C8C8;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
  <main style="max-width:640px;margin:72px auto;padding:0 24px;">
    <h1 style="font-size:22px;font-weight:600;">OpenLens could not load the interface</h1>
    <p>The window is open. Loading the interface did not finish, so startup was not blocked.</p>
    <p style="opacity:.8;word-break:break-all;">${escape(url)}</p>
    <pre style="white-space:pre-wrap;background:#1C1C1C;padding:16px;border-radius:8px;">${escape(message)}</pre>
  </main>
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export default createLensWindowInjectable;
