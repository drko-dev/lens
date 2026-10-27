/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "./hotbar-menu.scss";

import React, { useRef, useState } from "react";
import { observer } from "mobx-react";
import { HotbarEntityIcon } from "./hotbar-entity-icon";
import type { IClassName, StrictReactNode } from "@openlens/utilities";
import { cssNames } from "@openlens/utilities";
import type { CatalogEntityRegistry } from "../../api/catalog/entity/registry";
import type { CatalogEntity } from "../../api/catalog-entity";
import { DragDropContext, Draggable, Droppable, type DropResult } from "react-beautiful-dnd";
import { HotbarCell } from "./hotbar-cell";
import { HotbarIcon } from "./hotbar-icon";
import type { HotbarItem } from "../../../features/hotbar/storage/common/types";
import type { IComputedValue } from "mobx";
import { withInjectables } from "@ogre-tools/injectable-react";
import catalogEntityRegistryInjectable from "../../api/catalog/entity/registry.injectable";
import type { Hotbar } from "../../../features/hotbar/storage/common/hotbar";
import activeHotbarInjectable from "../../../features/hotbar/storage/common/active.injectable";
import hotbarsInjectable from "../../../features/hotbar/storage/common/hotbars.injectable";
import removeEntityFromAllHotbarsInjectable from "../../../features/hotbar/storage/common/remove-entity-from-all.injectable";
import activeEntityInjectable from "../../api/catalog/entity/active.injectable";
import userPreferencesStateInjectable from "../../../features/user-preferences/common/state.injectable";
import { Icon } from "../icon";
import { getHotbarFavoriteItems, reorderHotbarFavoriteItems } from "./hotbar-menu-items";

export interface HotbarMenuProps {
  className?: IClassName;
}

interface Dependencies {
  hotbars: IComputedValue<Hotbar[]>;
  activeHotbar: IComputedValue<Hotbar | undefined>;
  entityRegistry: CatalogEntityRegistry;
  activeEntity: IComputedValue<CatalogEntity | undefined>;
  removeEntityFromAllHotbars: (entityId: string) => void;
  preferences: { hotbarCollapsed?: boolean };
}

const NonInjectedHotbarMenu = observer((props: Dependencies & HotbarMenuProps) => {
  const {
    hotbars: hotbarsValue,
    activeHotbar,
    entityRegistry,
    activeEntity,
    removeEntityFromAllHotbars,
    preferences,
    className,
  } = props;

  const [draggingOver, setDraggingOver] = useState(false);
  const favoriteIds = useRef(new WeakMap<HotbarItem, string>());
  const nextFavoriteId = useRef(0);
  const hotbars = hotbarsValue.get();
  const favoriteItems = getHotbarFavoriteItems(hotbars);
  const getFavoriteId = (item: HotbarItem) => {
    let id = favoriteIds.current.get(item);

    if (!id) {
      id = `favorite-${nextFavoriteId.current++}`;
      favoriteIds.current.set(item, id);
    }

    return id;
  };

  const getEntity = (item: HotbarItem | null) => {
    if (!item) {
      return undefined;
    }

    return entityRegistry.getById(item.entity.uid);
  };
  const onDragStart = () => setDraggingOver(true);
  const onDragEnd = (result: DropResult) => {
    setDraggingOver(false);

    const { source, destination } = result;

    if (!destination) {  // Dropped outside of the list
      return;
    }

    const from = Number(source.droppableId);
    const to = Number(destination.droppableId);

    reorderHotbarFavoriteItems(hotbars, from, to);
  };
  const removeItem = (entityId: string) => {
    removeEntityFromAllHotbars(entityId);
  };
  const addItem = (entity: CatalogEntity) => {
    activeHotbar.get()?.addEntity(entity);
  };
  const getMoveAwayDirection = (dragId: string | undefined | null, cellIndex: number) => {
    if (!dragId) {
      return "animateDown";
    }

    const draggableItemIndex = favoriteItems.findIndex(item => getFavoriteId(item) === dragId);

    return draggableItemIndex > cellIndex ? "animateDown" : "animateUp";
  };

  const renderGrid = () => [...favoriteItems, null].map((item, index) => {
    const entity = getEntity(item);

    return (
      <Droppable droppableId={`${index}`} key={item ? getFavoriteId(item) : "empty-favorite-drop-target"}>
        {(provided, snapshot) => (
          <HotbarCell
            index={index}
            key={item ? getFavoriteId(item) : "empty-favorite-drop-target"}
            innerRef={provided.innerRef}
            className={cssNames(
              {
                isDraggingOver: snapshot.isDraggingOver,
                isDraggingOwner: snapshot.draggingOverWith === (item && getFavoriteId(item)),
              },
              getMoveAwayDirection(snapshot.draggingOverWith, index),
            )}
            {...provided.droppableProps}
          >
            {item && (
              <Draggable
                draggableId={getFavoriteId(item)}
                key={getFavoriteId(item)}
                index={0}
              >
                {(provided, snapshot) => (
                  <div
                    key={getFavoriteId(item)}
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    style={{
                      zIndex: favoriteItems.length - index,
                      position: "absolute" as const,
                      ...provided.draggableProps.style,
                    }}
                  >
                    {entity ? (
                      <HotbarEntityIcon
                        key={index}
                        index={index}
                        entity={entity}
                        onClick={() => entityRegistry.onRun(entity)}
                        className={cssNames({ isDragging: snapshot.isDragging })}
                        remove={removeItem}
                        add={addItem}
                        size={40} />
                    ) : (
                      <HotbarIcon
                        uid={`hotbar-icon-${item.entity.uid}`}
                        title={item.entity.name}
                        source={item.entity.source ?? "local"}
                        tooltip={`${item.entity.name} (${item.entity.source})`}
                        menuItems={[
                          {
                            title: "Remove from Hotbar",
                            onClick: () => removeItem(item.entity.uid),
                          },
                        ]}
                        disabled
                        size={40} />
                    )}
                  </div>
                )}
              </Draggable>
            )}
            {provided.placeholder as StrictReactNode}
          </HotbarCell>
        )}
      </Droppable>
    );
  });

  if (preferences.hotbarCollapsed) {
    // Thin edge that keeps the active cluster color and expands the bar on click.
    const activeColor = activeEntity.get()?.spec?.icon?.background;

    return (
      <div
        className={cssNames("HotbarMenu collapsed", className)}
        role="button"
        tabIndex={0}
        title="Expand favorites bar"
        data-testid="hotbar-expand"
        onClick={() => { preferences.hotbarCollapsed = false; }}
        onKeyDown={(e) => e.key === "Enter" && (preferences.hotbarCollapsed = false)}
      >
        <div className="edge" style={activeColor ? { background: activeColor } : undefined} />
      </div>
    );
  }

  return (
    <div className={cssNames("HotbarMenu flex column", { draggingOver }, className)}>
      <button
        type="button"
        className="HotbarCollapse"
        title="Collapse favorites bar"
        data-testid="hotbar-collapse"
        onClick={() => { preferences.hotbarCollapsed = true; }}
      >
        <Icon material="chevron_left" />
      </button>
      <div className="HotbarItems flex column gaps">
        <DragDropContext
          onDragStart={() => onDragStart()}
          onDragEnd={(result) => onDragEnd(result)}>
          {renderGrid()}
        </DragDropContext>
      </div>
    </div>
  );
});

export const HotbarMenu = withInjectables<Dependencies, HotbarMenuProps>(NonInjectedHotbarMenu, {
  getProps: (di, props) => ({
    ...props,
    entityRegistry: di.inject(catalogEntityRegistryInjectable),
    hotbars: di.inject(hotbarsInjectable),
    activeHotbar: di.inject(activeHotbarInjectable),
    activeEntity: di.inject(activeEntityInjectable),
    removeEntityFromAllHotbars: di.inject(removeEntityFromAllHotbarsInjectable),
    preferences: di.inject(userPreferencesStateInjectable),
  }),
});
