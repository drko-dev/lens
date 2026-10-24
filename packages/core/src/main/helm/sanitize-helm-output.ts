/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Removes credentials from a message before it is shown or logged.
 *
 * Helm errors regularly embed the repository URL, which may contain user information
 * (`https://user:token@charts.example.com`). Those values must never reach the UI, the logs,
 * the tests or the screenshots.
 */
export function sanitizeHelmOutput(output: string): string {
  return output
    // https://user:password@host -> https://***@host
    .replace(/(\w+:\/\/)[^/\s@]*@/g, "$1***@")
    // Authorization: Bearer <token> -> Authorization: Bearer ***
    .replace(/(authorization\s*[:=]\s*)(bearer\s+)?\S+/gi, "$1$2***")
    // token=... / password=... / apikey=... -> ***
    .replace(/((?:token|password|passwd|apikey|api_key|secret)\s*[=:]\s*)("?)[^\s"',}]+\2/gi, "$1***");
}
