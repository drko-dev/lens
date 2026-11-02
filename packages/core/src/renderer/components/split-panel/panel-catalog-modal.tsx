/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import styles from "./split-panel.module.scss";
import React, { useState } from "react";
import { observer } from "mobx-react";
import { Icon } from "../icon";
import { PANEL_CATALOG } from "./panel-catalog";
import type { PanelKind } from "./split-panel-types";

export interface PanelCatalogModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSelectPanel: (kind: PanelKind, orientation: "horizontal" | "vertical") => void;
  /** Hides kinds the hosting store refuses (global host); omitted = whole catalog (Kubetail). */
  readonly isKindAllowed?: (kind: PanelKind) => boolean;
}

export const PanelCatalogModal = observer((props: PanelCatalogModalProps) => {
  const { isOpen, onClose, onSelectPanel, isKindAllowed = () => true } = props;
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("vertical");

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!isOpen) return null;

  const categories = [
    { id: "all", label: "Todos" },
    { id: "workloads", label: "Workloads" },
    { id: "observability", label: "Observabilidad" },
    { id: "details", label: "Detalles" },
    { id: "tools", label: "Herramientas" },
  ];

  const filteredItems = PANEL_CATALOG
    .filter(item => isKindAllowed(item.kind))
    .filter(item => selectedCategory === "all" || item.category === selectedCategory);

  return (
    <div className={styles.catalogModalOverlay} data-testid="catalog-modal-overlay" onClick={onClose}>
      <div
        className={styles.catalogModal}
        data-testid="catalog-modal"
        onClick={e => e.stopPropagation()}
      >
        <div className={styles.catalogHeader}>
          <div className={styles.catalogHeaderTitle}>
            <Icon material="widgets" />
            <h3>Catálogo de Paneles y Componentes</h3>
          </div>
          <button
            type="button"
            className={styles.catalogCloseButton}
            onClick={onClose}
            data-testid="catalog-close-button"
            title="Cerrar catálogo"
          >
            <Icon material="close" />
          </button>
        </div>

        <div className={styles.catalogControls}>
          <div className={styles.categoryFilters}>
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                className={`${styles.categoryButton} ${selectedCategory === cat.id ? styles.activeCategory : ""}`}
                onClick={() => setSelectedCategory(cat.id)}
                data-testid={`catalog-cat-${cat.id}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className={styles.orientationSelect}>
            <span>Dividir zona como:</span>
            <button
              type="button"
              className={`${styles.orientationBtn} ${orientation === "horizontal" ? styles.active : ""}`}
              onClick={() => setOrientation("horizontal")}
              title="Lado a lado (Split Horizontal)"
              data-testid="catalog-split-horizontal-btn"
            >
              <Icon material="splitscreen" small />
              Horizontal
            </button>
            <button
              type="button"
              className={`${styles.orientationBtn} ${orientation === "vertical" ? styles.active : ""}`}
              onClick={() => setOrientation("vertical")}
              title="Apilado arriba / abajo (Split Vertical)"
              data-testid="catalog-split-vertical-btn"
            >
              <Icon material="vertical_split" small />
              Vertical
            </button>
          </div>
        </div>

        <div className={styles.catalogGrid}>
          {filteredItems.map(item => (
            <div
              key={item.kind}
              className={`${styles.catalogCard} ${!item.available ? styles.catalogCardDisabled : ""}`}
              data-testid={`catalog-card-${item.kind}`}
            >
              <div className={styles.cardHeader}>
                <Icon material={item.icon} className={styles.cardIcon} />
                <div className={styles.cardTitleSection}>
                  <h4>{item.name}</h4>
                  <span className={styles.categoryBadge}>{item.category}</span>
                </div>
              </div>

              <p className={styles.cardDescription}>{item.description}</p>

              <div className={styles.cardFooter}>
                {item.available ? (
                  <button
                    type="button"
                    className={styles.addPanelButton}
                    onClick={() => onSelectPanel(item.kind, orientation)}
                    data-testid={`catalog-add-${item.kind}`}
                  >
                    <Icon material="add" small />
                    Agregar Panel
                  </button>
                ) : (
                  <div className={styles.unavailableInfo} title={item.unavailableReason}>
                    <Icon material="lock" small />
                    <span>{item.unavailableReason || "No disponible"}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
