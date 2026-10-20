/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { observer } from "mobx-react";

import { MenuItem } from "../menu";

import type { CatalogEntity } from "../../api/catalog-entity";
import { withInjectables } from "@ogre-tools/injectable-react";
import type { IComputedValue } from "mobx";
import type { Hotbar } from "../../../features/hotbar/storage/common/hotbar";
import activeHotbarInjectable from "../../../features/hotbar/storage/common/active.injectable";
import type { StrictReactNode } from "@openlens/utilities";

interface Dependencies {
  activeHotbar: IComputedValue<Hotbar | undefined>;
}

interface HotbarToggleMenuItemProps {
  entity: CatalogEntity;
  addContent: StrictReactNode;
  removeContent: StrictReactNode;
}

const NonInjectedHotbarToggleMenuItem = observer(({
  addContent,
  entity,
  activeHotbar,
  removeContent,
}: Dependencies & HotbarToggleMenuItemProps) => {
  const hotbar = activeHotbar.get();
  const isPinned = Boolean(hotbar?.hasEntity(entity.getId()));

  return (
    <MenuItem
      onClick={() => {
        if (!hotbar) {
          return;
        }

        if (isPinned) {
          hotbar.removeEntity(entity.getId());
        } else {
          hotbar.addEntity(entity);
        }
      }}
    >
      {isPinned ? removeContent : addContent}
    </MenuItem>
  );
});

export const HotbarToggleMenuItem = withInjectables<Dependencies, HotbarToggleMenuItemProps>(NonInjectedHotbarToggleMenuItem, {
  getProps: (di, props) => ({
    ...props,
    activeHotbar: di.inject(activeHotbarInjectable),
  }),
});

