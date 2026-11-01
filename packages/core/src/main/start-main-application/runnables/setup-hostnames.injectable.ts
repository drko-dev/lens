/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import electronAppInjectable from "../../electron-app/electron-app.injectable";
import { beforeElectronIsReadyInjectionToken } from "@openlens/application-for-electron-main";

const setupHostnamesInjectable = getInjectable({
  id: "setup-hostnames",

  instantiate: (di) => ({
    run: () => {
      const app = di.inject(electronAppInjectable);

      // Electron 45+: --host-rules is an alias of --host-resolver-rules and cert
      // checks use the mapped destination. Prefer the new switch and ignore local
      // LensProxy TLS mismatches (self-signed for lens.app on 127.0.0.1).
      const hostMaps = [
        "MAP localhost 127.0.0.1",
        "MAP lens.app 127.0.0.1",
        "MAP *.lens.app 127.0.0.1",
      ].join(",");

      app.commandLine.appendSwitch("host-resolver-rules", hostMaps);
      app.commandLine.appendSwitch("host-rules", hostMaps); // back-compat
      app.commandLine.appendSwitch("ignore-certificate-errors");

      return undefined;
    },
  }),

  injectionToken: beforeElectronIsReadyInjectionToken,
});

export default setupHostnamesInjectable;
