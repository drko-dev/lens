/** Approved runtime Dock icons; no changes to signed application resources. */
import { getInjectable } from "@ogre-tools/injectable";
import { onLoadOfApplicationInjectionToken } from "@openlens/application";
import { app, ipcMain, nativeImage } from "electron";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { applicationIconChannel, isApplicationIconId, type ApplicationIconId } from "../../common/application-icon-channels";

const selectionFile = () => join(app.getPath("userData"), "openlens-appearance-icon.json");
const iconFile = (id: ApplicationIconId) => join(app.getAppPath(), "static", "branding", "app-icons", id + ".png");
const apply = (id: ApplicationIconId): boolean => {
  if (process.platform !== "darwin" || !app.dock) return false;
  const file = iconFile(id);
  if (!existsSync(file)) return false;
  const icon = nativeImage.createFromPath(file);
  if (icon.isEmpty()) return false;
  app.dock.setIcon(icon);
  return true;
};
const setupApplicationIconIpcInjectable = getInjectable({
  id: "setup-application-icon-ipc",
  instantiate: () => ({
    run: () => {
      try {
        const saved: unknown = JSON.parse(readFileSync(selectionFile(), "utf8"));
        if (saved && typeof saved === "object" && "id" in saved && isApplicationIconId((saved as { id: unknown }).id)) {
          apply((saved as { id: ApplicationIconId }).id);
        }
      } catch { /* No stored selection. */ }

      ipcMain.handle(applicationIconChannel, (event, value: unknown) => {
        const sender = event.senderFrame?.url ?? "";
        let validSender = false;
        try {
          const origin = new URL(sender);
          validSender = origin.protocol === "https:" && origin.hostname === "lens.app";
        } catch { /* Reject malformed origins. */ }
        if (!validSender) return false;
        if (!isApplicationIconId(value)) return false;
        if (!apply(value)) return false;
        writeFileSync(selectionFile(), JSON.stringify({ id: value }), { mode: 0o600 });
        return true;
      });
    },
  }),
  injectionToken: onLoadOfApplicationInjectionToken,
  causesSideEffects: true,
});
export default setupApplicationIconIpcInjectable;
