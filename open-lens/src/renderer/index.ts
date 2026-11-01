import "@openlens/core/styles";
// Dev watch: these source styles are outside the prebuilt core CSS bundle.
// style-loader hot-replaces them without restarting Electron.
import "../../../packages/core/src/renderer/components/cursor.scss";
import "../../../packages/core/src/renderer/components/hotbar/hotbar-menu.scss";
import "@openlens/button/styles";
import "@openlens/error-boundary/styles";
import "@openlens/tooltip/styles";
import "@openlens/resizing-anchor/styles";

import React from "react";
import ReactDOM from "react-dom";
import { runInAction } from "mobx";
import {
  rendererExtensionApi as Renderer,
  commonExtensionApi as Common,
  registerLensCore,
  metricsFeature,
} from "@openlens/core/renderer";
import { autoRegister } from "@ogre-tools/injectable-extension-for-auto-registration";
import { registerFeature } from "@openlens/feature-core";
import {
  applicationFeature,
  startApplicationInjectionToken
} from "@openlens/application";
import { createContainer } from "@ogre-tools/injectable";
import { registerMobX } from "@ogre-tools/injectable-extension-for-mobx";
import { registerInjectableReact, DiContextProvider } from "@ogre-tools/injectable-react";
import { messagingFeatureForRenderer } from "@openlens/messaging-for-renderer";
import { keyboardShortcutsFeature } from "@openlens/keyboard-shortcuts";
import { reactApplicationFeature } from "@openlens/react-application";
import { routingFeature } from "@openlens/routing";
import { loggerFeature } from "@openlens/logger";

const environment = "renderer";

const di = createContainer(environment, {
  detectCycles: false,
});

const injectableMap = new Map<string, any>();
const originalRegister = di.register.bind(di);

di.register = (...injectables: any[]) => {
  for (const item of injectables) {
    if (item && item.id) {
      injectableMap.set(item.id, item);
    }
  }
  return originalRegister(...injectables);
};

(di as any).injectById = (id: string, instantiationParameter?: any) => {
  const inj = injectableMap.get(id);
  if (!inj) {
    throw new Error(`Injectable with id "${id}" was not registered in renderer di.`);
  }
  return di.inject(inj, instantiationParameter);
};

(di as any).getInjectable = (id: string) => injectableMap.get(id);

(di as any).mockInjectable = (id: string, instantiateStub: any) => {
  const inj = injectableMap.get(id);
  if (!inj) {
    throw new Error(`Injectable with id "${id}" was not registered in renderer di.`);
  }
  const stubFn = typeof instantiateStub === "function" ? instantiateStub : () => instantiateStub;
  try {
    di.override(inj, stubFn);
  } catch {
    di.purge(inj);
    (di as any).decorate(inj, () => stubFn);
  }
};

if (typeof window !== "undefined") {
  (window as any).__LENS_RENDERER_DI__ = di;
  (window as any).__LENS_REACT__ = React;
  (window as any).__LENS_REACT_DOM__ = ReactDOM;
  (window as any).__LENS_DI_PROVIDER__ = DiContextProvider;
}

runInAction(() => {
  registerMobX(di);
  registerInjectableReact(di);
  registerLensCore(di, environment);

  registerFeature(
    di,
    loggerFeature,
  );

  registerFeature(
    di,
    applicationFeature,
    messagingFeatureForRenderer,
    keyboardShortcutsFeature,
    reactApplicationFeature,
    routingFeature,
    metricsFeature,
  );

  autoRegister({
    di,
    targetModule: module,
    getRequireContexts: () => [
      require.context("./", true, CONTEXT_MATCHER_FOR_NON_FEATURES),
      require.context("../common", true, CONTEXT_MATCHER_FOR_NON_FEATURES),
    ],
  });
});

const startApplication = di.inject(startApplicationInjectionToken);

startApplication();

export {
  React,
  ReactDOM,
  ReactRouter,
  ReactRouterDom,
  Mobx,
  MobxReact,
} from "@openlens/core/renderer";

export const LensExtensions = {
  Renderer,
  Common,
};
