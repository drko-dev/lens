/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React from "react";
import { observer } from "mobx-react";
import { Icon } from "../icon";

export const TerminalPanelContent = observer(() => {
  return (
    <div className={styles.terminalPanelContent} data-testid="terminal-panel-content">
      <div className={styles.terminalHeader}>
        <div className={styles.terminalStatus}>
          <Icon material="lock" small />
          <span>Cluster Terminal — Próximamente en H3 (Requiere PTY Multiventana)</span>
        </div>
      </div>
      <div className={styles.terminalUnavailableBody} data-testid="terminal-unavailable-notice">
        <Icon material="terminal" className={styles.unavailableIcon} />
        <h4>Terminal no disponible en paneles H2</h4>
        <p>
          El componente de terminal interactiva acoplable requiere una arquitectura de sesión PTY desacoplada del Dock de pestañas clásicas, programada para el <strong>Hito H3</strong>.
        </p>
        <p className={styles.hint}>
          Para ejecutar comandos en este clúster, utilizá la consola de terminal estándar en la barra inferior o el atajo de teclado global.
        </p>
      </div>
    </div>
  );
});
