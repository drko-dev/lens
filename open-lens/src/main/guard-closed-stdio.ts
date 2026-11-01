// Winston's Console transport calls stdout.write. A closed pipe throws EPIPE
// from that write, and Electron shows it as an uncaught main-process dialog.
const swallowClosedPipe = (stream: NodeJS.WriteStream) => {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error?.code === "EPIPE") {
      return;
    }
  });

  const write = stream.write.bind(stream);

  stream.write = ((chunk: unknown, encoding?: unknown, callback?: unknown) => {
    try {
      return write(chunk as never, encoding as never, callback as never);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "EPIPE") {
        throw error;
      }

      const done = typeof callback === "function"
        ? callback
        : typeof encoding === "function"
          ? encoding
          : undefined;

      (done as (() => void) | undefined)?.();

      return true;
    }
  }) as typeof stream.write;
};

swallowClosedPipe(process.stdout);
swallowClosedPipe(process.stderr);

export {};
