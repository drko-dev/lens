/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

/**
 * Renderer -> main request for a per-operation Node Shell authorization.
 * The renderer only requests; main performs the approval and issues the grant.
 */
export const NODE_SHELL_AUTHORIZATION_CHANNEL = "node-shell:request-authorization";

/** Operation bound to a Node Shell grant. */
export const NODE_SHELL_OPEN_OPERATION = "node-shell.open";
