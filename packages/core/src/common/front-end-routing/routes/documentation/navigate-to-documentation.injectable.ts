/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import type { DocumentationPathParameters } from "./documentation-route.injectable";
import documentationRouteInjectable from "./documentation-route.injectable";
import { navigateToRouteInjectionToken } from "../../navigate-to-route-injection-token";

export type NavigateToDocumentation = (target?: string | DocumentationPathParameters | { article?: string }) => void;

const navigateToDocumentationInjectable = getInjectable({
  id: "navigate-to-documentation",

  instantiate: (di): NavigateToDocumentation => {
    const navigateToRoute = di.inject(navigateToRouteInjectionToken);
    const documentationRoute = di.inject(documentationRouteInjectable);

    return (target) => {
      let articleId: string | undefined;

      if (typeof target === "string") {
        articleId = target;
      } else if (target && typeof target === "object") {
        articleId = (target as any).articleId || (target as any).article;
      }

      navigateToRoute(documentationRoute, {
        parameters: articleId ? { articleId } : undefined,
        query: articleId ? { article: articleId } : undefined,
      });
    };
  },
});

export default navigateToDocumentationInjectable;
