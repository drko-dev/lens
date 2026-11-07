/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { StringDecoder } from "node:string_decoder";
import type { BoundedResponseStream } from "./ai-transport-types";
import {
  TransportAbortError,
  TransportResponseSizeError,
} from "./ai-transport-errors";

/**
 * Reads an async iterable stream up to maxBytes with backpressure and immediate cancellation.
 * Uses StringDecoder to safely handle multi-byte UTF-8 sequences split across chunks.
 * Enforces SEC-06 and R2-05.
 */
export async function readBoundedStream(
  stream: BoundedResponseStream,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ body: string; totalBytes: number }> {
  if (signal?.aborted) {
    await stream.cancel("Client aborted before reading stream");
    throw new TransportAbortError();
  }

  const decoder = new StringDecoder("utf8");
  let totalBytes = 0;
  let body = "";

  try {
    for await (const chunk of stream.chunks) {
      if (signal?.aborted) {
        await stream.cancel("Client aborted during stream read");
        throw new TransportAbortError();
      }

      const chunkBytes = chunk.byteLength;
      totalBytes += chunkBytes;

      if (totalBytes > maxBytes) {
        // Immediately cancel stream consumption before buffering more memory
        await stream.cancel(`Response exceeded maximum size limit of ${maxBytes} bytes`);
        throw new TransportResponseSizeError(maxBytes, totalBytes);
      }

      body += decoder.write(Buffer.from(chunk));
    }

    body += decoder.end();

    return {
      body,
      totalBytes,
    };
  } catch (err) {
    // If an error or abort occurred, ensure stream is cancelled
    try {
      await stream.cancel(err instanceof Error ? err.message : String(err));
    } catch {
      // Ignore secondary cancel errors
    }
    throw err;
  }
}

/**
 * Creates a mock BoundedResponseStream for testing asynchronous chunk delivery,
 * chunk-spanning UTF-8 decoding, backpressure, and cancellation tracking.
 */
export function createMockAsyncStream(
  chunks: Array<string | Uint8Array | Buffer>,
  options?: {
    chunkDelayMs?: number;
    signal?: AbortSignal;
    onCancel?: (reason?: string) => void;
  },
): BoundedResponseStream & { wasCancelled: boolean; cancelReason?: string } {
  let wasCancelled = false;
  let cancelReason: string | undefined;

  const asyncIterable: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]() {
      let index = 0;

      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          if (wasCancelled || options?.signal?.aborted) {
            return { done: true, value: undefined };
          }

          if (index >= chunks.length) {
            return { done: true, value: undefined };
          }

          if (options?.chunkDelayMs && options.chunkDelayMs > 0) {
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(resolve, options.chunkDelayMs);
              if (options?.signal) {
                options.signal.addEventListener(
                  "abort",
                  () => {
                    clearTimeout(timer);
                    reject(new TransportAbortError());
                  },
                  { once: true },
                );
              }
            });
          }

          const rawChunk = chunks[index++];
          const uint8 = typeof rawChunk === "string"
            ? new TextEncoder().encode(rawChunk)
            : new Uint8Array(rawChunk.buffer, rawChunk.byteOffset, rawChunk.byteLength);

          return { done: false, value: uint8 };
        },
      };
    },
  };

  return {
    chunks: asyncIterable,
    get wasCancelled() {
      return wasCancelled;
    },
    get cancelReason() {
      return cancelReason;
    },
    async cancel(reason?: string): Promise<void> {
      wasCancelled = true;
      cancelReason = reason;
      if (options?.onCancel) {
        options.onCancel(reason);
      }
    },
  };
}
