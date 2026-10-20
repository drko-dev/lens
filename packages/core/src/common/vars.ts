/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

// App's common configuration for any process (main, renderer, build pipeline, etc.)
import type { ThemeId } from "../renderer/themes/lens-theme";

export const defaultThemeId: ThemeId = "lens-dark";
export const defaultFontSize = 12;
export const defaultTerminalFontFamily = "RobotoMono";
export const defaultEditorFontFamily = "RobotoMono";

// Apis
export const apiPrefix = "/api"; // local router apis
export const apiKubePrefix = "/api-kube"; // k8s cluster apis

/**
 * Folder in the user's home for extensions and templates.
 * Not `.k8slens`, which belongs to the official Lens app.
 */
export const homeDotDirName = ".openlens-devops";

/**
 * URL scheme for deep links. Not `lens`, which belongs to the official Lens app.
 */
export const protocolScheme = "openlens-devops";

// Links
export const issuesTrackerUrl = "https://github.com/Open-Lens/app/issues" as string;
export const supportUrl = "https://docs.k8slens.dev/support/" as string;
export const docsUrl = "https://docs.k8slens.dev" as string;
export const forumsUrl = "https://forums.k8slens.dev" as string;
