/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import { getInjectable } from "@ogre-tools/injectable";
import { merge } from "lodash";
import type { ObservableMap } from "mobx";
import { observable } from "mobx";
import homeDirectoryPathInjectable from "../../../common/os/home-directory-path.injectable";
import joinPathsInjectable from "../../../common/path/join-paths.injectable";
import { defaultThemeId } from "../../../common/vars";
import currentTimezoneInjectable from "../../../common/vars/current-timezone.injectable";
import type { EditorConfiguration, ExtensionRegistry, KubeconfigSyncEntry, KubeconfigSyncValue, TerminalConfig } from "./preferences-helpers";
import { defaultExtensionRegistryUrlLocation, defaultEditorConfig, defaultTerminalConfig, defaultPackageMirror, getPreferenceDescriptor, packageMirrors } from "./preferences-helpers";

export type PreferenceDescriptors = ReturnType<typeof userPreferenceDescriptorsInjectable["instantiate"]>;

const userPreferenceDescriptorsInjectable = getInjectable({
  id: "user-preference-descriptors",
  instantiate: (di) => {
    const currentTimezone = di.inject(currentTimezoneInjectable);
    const joinPaths = di.inject(joinPathsInjectable);
    const homeDirectoryPath = di.inject(homeDirectoryPathInjectable);

    const mainKubeFolderPath = joinPaths(homeDirectoryPath, ".kube");

    return ({
      httpsProxy: getPreferenceDescriptor<string | undefined>({
        fromStore: val => val,
        toStore: val => val || undefined,
      }),
      shell: getPreferenceDescriptor<string | undefined>({
        fromStore: val => val,
        toStore: val => val || undefined,
      }),
      colorTheme: getPreferenceDescriptor<string>({
        fromStore: (val) => {
          if (!val) {
            return defaultThemeId;
          }

          if (val === "lens-dark") {
            return "Dark";
          }

          if (val === "lens-light") {
            return "Light";
          }

          return val;
        },
        toStore: val => !val || val === defaultThemeId
          ? undefined
          : val,
      }),
      terminalTheme: getPreferenceDescriptor<string>({
        fromStore: val => val || "",
        toStore: val => val || undefined,
      }),
      localeTimezone: getPreferenceDescriptor<string>({
        fromStore: val => val || currentTimezone,
        toStore: val => !val || val === currentTimezone
          ? undefined
          : val,
      }),
      allowUntrustedCAs: getPreferenceDescriptor<boolean>({
        fromStore: val => val ?? false,
        toStore: val => !val
          ? undefined
          : val,
      }),
      allowErrorReporting: getPreferenceDescriptor<boolean>({
        fromStore: val => val ?? true,
        toStore: val => val
          ? undefined
          : val,
      }),
      downloadMirror: getPreferenceDescriptor<string>({
        fromStore: val => !val || !packageMirrors.has(val)
          ? defaultPackageMirror
          : val,
        toStore: val => val === defaultPackageMirror
          ? undefined
          : val,
      }),
      downloadKubectlBinaries: getPreferenceDescriptor<boolean>({
        fromStore: val => val ?? true,
        toStore: val => val
          ? undefined
          : val,
      }),
      downloadBinariesPath: getPreferenceDescriptor<string | undefined>({
        fromStore: val => val,
        toStore: val => val || undefined,
      }),
      kubectlBinariesPath: getPreferenceDescriptor<string | undefined>({
        fromStore: val => val,
        toStore: val => val || undefined,
      }),
      openAtLogin: getPreferenceDescriptor<boolean>({
        fromStore: val => val ?? false,
        toStore: val => !val
          ? undefined
          : val,
      }),
      terminalCopyOnSelect: getPreferenceDescriptor<boolean>({
        fromStore: val => val ?? false,
        toStore: val => !val
          ? undefined
          : val,
      }),
      hiddenTableColumns: getPreferenceDescriptor<[string, string[]][], Map<string, Set<string>>>({
        fromStore: (val = []) => new Map(
          val.map(([tableId, columnIds]) => [tableId, new Set(columnIds)]),
        ),
        toStore: (val) => {
          const res: [string, string[]][] = [];

          for (const [table, columns] of val) {
            if (columns.size) {
              res.push([table, Array.from(columns)]);
            }
          }

          return res.length ? res : undefined;
        },
      }),
      syncKubeconfigEntries: getPreferenceDescriptor<KubeconfigSyncEntry[], ObservableMap<string, KubeconfigSyncValue>>({
        fromStore: val => observable.map(
          val?.map(({ filePath, ...rest }) => [filePath, rest])
          ?? [[mainKubeFolderPath, {}]],
        ),
        toStore: val => val.size === 1 && val.has(mainKubeFolderPath)
          ? undefined
          : Array.from(val, ([filePath, rest]) => ({ filePath, ...rest })),
      }),
      editorConfiguration: getPreferenceDescriptor<Partial<EditorConfiguration>, EditorConfiguration>({
        fromStore: val => merge(defaultEditorConfig, val),
        toStore: val => val,
      }),
      terminalConfig: getPreferenceDescriptor<Partial<TerminalConfig>, TerminalConfig>({
        fromStore: val => merge(defaultTerminalConfig, val),
        toStore: val => val,
      }),
      extensionRegistryUrl: getPreferenceDescriptor<ExtensionRegistry>({
        fromStore: val => val ?? {
          location: defaultExtensionRegistryUrlLocation,
        },
        toStore: val => val.location === defaultExtensionRegistryUrlLocation
          ? undefined
          : val,
      }),
      tableDensity: getPreferenceDescriptor<"compact" | "comfortable">({
        fromStore: val => val === "comfortable" ? "comfortable" : "compact",
        toStore: val => val === "compact" ? undefined : val,
      }),
      environmentColors: getPreferenceDescriptor<Record<string, string>>({
        fromStore: (val = {}) => ({ ...val }),
        toStore: (val) => {
          const clean: Record<string, string> = {};

          for (const [k, v] of Object.entries(val || {})) {
            if (k !== "production" && v) {
              clean[k] = v;
            }
          }

          return Object.keys(clean).length > 0 ? clean : undefined;
        },
      }),
    }) as const;
  },
});

export default userPreferenceDescriptorsInjectable;
