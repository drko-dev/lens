/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Renderer -> main request to open a NEW local/pod terminal PTY on a PRODUCTION cluster.
 * The renderer only requests; main performs the native approval and keeps the grant.
 */
export const TERMINAL_AUTHORIZATION_CHANNEL = "terminal-shell:request-authorization";

/** Operation bound to a local/pod terminal grant. */
export const TERMINAL_SHELL_OPEN_OPERATION = "terminal-shell.open";
