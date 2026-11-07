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
 * Safely cancels a stream without allowing a hanging or slow stream.cancel()
 * implementation to block the calling process indefinitely (R3-03).
 */
async function safelyCancelStream(stream: BoundedResponseStream, reason: string): Promise<void> {
  try {
    const cancelPromise = Promise.resolve(stream.cancel(reason));
    const boundedTimeout = new Promise<void>((resolve) => setTimeout(resolve, 50));
    await Promise.race([cancelPromise, boundedTimeout]);
  } catch {
    // Secondary cancel errors ignored
  }
}

/**
 * Reads an async iterable stream up to maxBytes with backpressure, immediate cancellation,
 * and guaranteed global deadline enforcement (SEC-06, R2-05, R3-03).
 * Uses StringDecoder to safely handle multi-byte UTF-8 sequences split across chunks.
 */
export async function readBoundedStream(
  stream: BoundedResponseStream,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<{ body: string; totalBytes: number }> {
  if (signal?.aborted) {
    await safelyCancelStream(stream, "Client aborted before reading stream");
    throw new TransportAbortError();
  }

  const decoder = new StringDecoder("utf8");
  let totalBytes = 0;
  let body = "";
  const iterator = stream.chunks[Symbol.asyncIterator]();

  let signalListener: (() => void) | undefined;

  const abortRacePromise = new Promise<never>((_, reject) => {
    if (signal) {
      if (signal.aborted) {
        reject(new TransportAbortError());
        return;
      }
      signalListener = () => {
        reject(new TransportAbortError());
      };
      signal.addEventListener("abort", signalListener, { once: true });
    }
  });

  try {
    while (true) {
      if (signal?.aborted) {
        await safelyCancelStream(stream, "Client aborted during stream read");
        throw new TransportAbortError();
      }

      // Race iterator.next() against the abort signal to prevent indefinite hang (R3-03)
      const nextPromise = iterator.next();
      const iterationResult = await Promise.race([nextPromise, abortRacePromise]);

      if (iterationResult.done) {
        break;
      }

      const chunk = iterationResult.value;
      const chunkBytes = chunk.byteLength;
      totalBytes += chunkBytes;

      if (totalBytes > maxBytes) {
        // Immediately cancel stream consumption before buffering more memory
        await safelyCancelStream(stream, `Response exceeded maximum allowed size of ${maxBytes} bytes`);
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
    // Ensure stream is cancelled cooperatively without hanging (R3-03)
    await safelyCancelStream(stream, err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    if (signal && signalListener) {
      signal.removeEventListener("abort", signalListener);
    }
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
