/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import focusApplicationInjectable from "../../electron-app/features/focus-application.injectable";
import getCurrentApplicationWindowInjectable from "./application-window/get-current-application-window.injectable";
import createFirstApplicationWindowInjectable from "./application-window/create-first-application-window.injectable";

const showApplicationWindowInjectable = getInjectable({
  id: "show-application-window",

  instantiate: (di) => {
    const getApplicationWindow = di.inject(getCurrentApplicationWindowInjectable);
    const createFirstApplicationWindow = di.inject(createFirstApplicationWindowInjectable);
    const focusApplication = di.inject(focusApplicationInjectable);

    return async () => {
      focusApplication();

      const applicationWindow = getApplicationWindow() ?? createFirstApplicationWindow();

      if (applicationWindow.isStarting || applicationWindow.isVisible) {
        applicationWindow.show();

        return;
      }

      await applicationWindow.start();
    };
  },
});

export default showApplicationWindowInjectable;
