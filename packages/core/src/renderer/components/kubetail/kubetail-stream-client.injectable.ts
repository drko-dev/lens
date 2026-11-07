/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import byline from "byline";
import { StringDecoder } from "string_decoder";
import { Transform } from "stream";
import podApiInjectable from "../../../common/k8s-api/endpoints/pod.api.injectable";
import type { PodApi } from "../../../common/k8s-api/endpoints/pod.api";
import { loggerInjectionToken } from "@openlens/logger";
import type { Logger } from "@openlens/logger";

/**
 * Node transform stream using StringDecoder to correctly preserve
 * multibyte UTF-8 sequences that span across chunk boundaries.
 */
class Utf8ChunkDecoderStream extends Transform {
  private decoder = new StringDecoder("utf8");

  constructor() {
    super({ decodeStrings: true, objectMode: false });
  }

  _transform(chunk: any, _encoding: string, callback: () => void): void {
    const text = this.decoder.write(chunk);

    if (text.length > 0) {
      this.push(text);
    }

    callback();
  }

  _flush(callback: () => void): void {
    const text = this.decoder.end();

    if (text.length > 0) {
      this.push(text);
    }

    callback();
  }
}

export interface StreamCallbacks {
  onLine: (line: string) => void;
  onError: (error: Error, statusCode?: number) => void;
  onEnd: () => void;
}

export interface StreamParams {
  namespace: string;
  podName: string;
  containerName: string;
  tailLines?: number;
  sinceTime?: string;
}

export interface ActiveStreamHandle {
  abort: () => void;
}

export type KubetailStreamClient = {
  startStream: (params: StreamParams, callbacks: StreamCallbacks) => ActiveStreamHandle;
};

interface Dependencies {
  podApi: PodApi;
  logger: Logger;
}

export function createKubetailStreamClient({ podApi, logger }: Dependencies): KubetailStreamClient {
  return {
    startStream: (params: StreamParams, callbacks: StreamCallbacks): ActiveStreamHandle => {
      const abortController = new AbortController();
      let isAborted = false;
      let isEnded = false;
      let activeLineStream: any = null;
      let activeResponseBody: any = null;

      const triggerEnd = () => {
        if (isEnded || isAborted) return;
        isEnded = true;
        callbacks.onEnd();
      };

      const run = async () => {
        try {
          const queryParams: Record<string, any> = {
            container: params.containerName,
            follow: true,
            timestamps: true,
          };

          if (params.sinceTime) {
            queryParams.sinceTime = params.sinceTime;
          } else if (typeof params.tailLines === "number") {
            queryParams.tailLines = params.tailLines;
          } else {
            queryParams.tailLines = 150;
          }

          const response = await podApi.getLogsStream(
            { namespace: params.namespace, name: params.podName },
            queryParams,
            { signal: abortController.signal },
          );

          if (isAborted) {
            const body = response.body as (ReadableStream<Uint8Array> & { destroy?: () => void }) | null;
            body?.cancel?.();
            body?.destroy?.();

            return;
          }

          if (!response.ok) {
            const errorText = await response.text().catch(() => "");
            const error: any = new Error(`HTTP ${response.status} ${response.statusText || ""}: ${errorText}`.trim());

            error.statusCode = response.status;
            logger.warn(`[KUBETAIL-STREAM]: HTTP ${response.status} for ${params.podName}/${params.containerName}`, error);
            callbacks.onError(error, response.status);

            return;
          }

          if (!response.body) {
            const error = new Error("Response body is empty or unavailable for streaming");

            callbacks.onError(error);

            return;
          }

          activeResponseBody = response.body;

          // UTF-8 incremental line streaming with multibyte chunk preservation
          const utf8Decoder = new Utf8ChunkDecoderStream();
          const decodedStream = typeof response.body.pipe === "function" ? response.body.pipe(utf8Decoder) : response.body;
          const lineStream = byline(decodedStream, { encoding: "utf8" });

          activeLineStream = lineStream;

          lineStream.on("data", (data: Buffer | string) => {
            if (isAborted) return;
            const line = typeof data === "string" ? data : data.toString("utf8");

            if (line && line.trim().length > 0) {
              callbacks.onLine(line);
            }
          });

          lineStream.on("error", (err: Error) => {
            if (isAborted) return;
            logger.warn(`[KUBETAIL-STREAM]: stream error for ${params.podName}/${params.containerName}`, err);
            callbacks.onError(err);
          });

          // Single invocation guarantee for end/close
          lineStream.on("end", triggerEnd);
          lineStream.on("close", triggerEnd);
        } catch (error: any) {
          if (isAborted || error?.name === "AbortError" || abortController.signal.aborted) {
            return;
          }

          logger.warn(`[KUBETAIL-STREAM]: failed to start stream for ${params.podName}/${params.containerName}`, error);
          const errObj = error instanceof Error ? error : new Error(String(error));

          callbacks.onError(errObj, (error as any)?.statusCode);
        }
      };

      run();

      return {
        abort: () => {
          if (isAborted) return;
          isAborted = true;

          try {
            abortController.abort();
          } catch {
            // Ignore abort error
          }

          try {
            if (activeLineStream) {
              activeLineStream.removeAllListeners();
              activeLineStream.destroy?.();
            }
          } catch {
            // Ignore stream destroy error
          }

          try {
            if (activeResponseBody) {
              activeResponseBody.destroy?.();
            }
          } catch {
            // Ignore response body destroy error
          }
        },
      };
    },
  };
}

const kubetailStreamClientInjectable = getInjectable({
  id: "kubetail-stream-client",
  instantiate: (di) => createKubetailStreamClient({
    podApi: di.inject(podApiInjectable),
    logger: di.inject(loggerInjectionToken),
  }),
});

export default kubetailStreamClientInjectable;
