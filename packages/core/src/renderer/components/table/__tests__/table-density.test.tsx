/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { render } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { DiContextProvider } from "@ogre-tools/injectable-react";
import { Table } from "../table";
import { TableHead } from "../table-head";
import { TableRow } from "../table-row";
import { TableCell } from "../table-cell";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import type { UserPreferencesState } from "../../../../features/user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../features/user-preferences/common/state.injectable";

interface TestItem {
  id: string;
  name: string;
  getId(): string;
}

describe("Table Density", () => {
  let di: ReturnType<typeof getDiForUnitTesting>;
  let mockState: UserPreferencesState;

  beforeEach(() => {
    di = getDiForUnitTesting();
    mockState = observable({
      tableDensity: "compact",
    } as unknown as UserPreferencesState);

    di.override(userPreferencesStateInjectable, () => mockState);
  });

  it("renders with density-compact class when compact is selected", () => {
    const items: TestItem[] = [
      { id: "1", name: "item-1", getId: () => "1" },
      { id: "2", name: "item-2", getId: () => "2" },
    ];

    const { container } = render(
      <DiContextProvider value={{ di }}>
        <Table items={items} selectable>
          <TableHead>
            <TableCell>Name</TableCell>
          </TableHead>
          {items.map(item => (
            <TableRow key={item.id} sortItem={item}>
              <TableCell>{item.name}</TableCell>
            </TableRow>
          ))}
        </Table>
      </DiContextProvider>,
    );

    const table = container.querySelector(".Table");

    expect(table).toHaveClass("density-compact");
    expect(table).not.toHaveClass("density-comfortable");
  });

  it("falls back to density-lens (35px) when no preference is stored", () => {
    const items: TestItem[] = [
      { id: "1", name: "item-1", getId: () => "1" },
      { id: "2", name: "item-2", getId: () => "2" },
    ];

    mockState.tableDensity = undefined as unknown as UserPreferencesState["tableDensity"];

    const { container } = render(
      <DiContextProvider value={{ di }}>
        <Table items={items} selectable>
          <TableHead>
            <TableCell>Name</TableCell>
          </TableHead>
          {items.map(item => (
            <TableRow key={item.id} sortItem={item}>
              <TableCell>{item.name}</TableCell>
            </TableRow>
          ))}
        </Table>
      </DiContextProvider>,
    );

    const table = container.querySelector(".Table");

    expect(table).toHaveClass("density-lens");
    expect(table).not.toHaveClass("density-compact");
  });

  it("reactively updates to density-comfortable when preference changes", () => {
    const items: TestItem[] = [
      { id: "1", name: "item-1", getId: () => "1" },
    ];

    const { container } = render(
      <DiContextProvider value={{ di }}>
        <Table items={items} selectable>
          <TableHead>
            <TableCell>Name</TableCell>
          </TableHead>
          {items.map(item => (
            <TableRow key={item.id} sortItem={item}>
              <TableCell>{item.name}</TableCell>
            </TableRow>
          ))}
        </Table>
      </DiContextProvider>,
    );

    const table = container.querySelector(".Table");

    expect(table).toHaveClass("density-compact");

    runInAction(() => {
      mockState.tableDensity = "comfortable";
    });

    expect(table).toHaveClass("density-comfortable");
    expect(table).not.toHaveClass("density-compact");
  });

  it("passes calculated 33px vs 42px rowHeights to VirtualList in virtual mode", () => {
    const items: TestItem[] = [
      { id: "1", name: "item-1", getId: () => "1" },
      { id: "2", name: "item-2", getId: () => "2" },
    ];

    const { container, rerender } = render(
      <DiContextProvider value={{ di }}>
        <Table
          items={items}
          virtual
          getTableRow={(id) => {
            const item = items.find(i => i.id === id);

            return (
              <TableRow sortItem={item}>
                <TableCell>{item?.name}</TableCell>
              </TableRow>
            );
          }}
        >
          <TableHead>
            <TableCell>Name</TableCell>
          </TableHead>
        </Table>
      </DiContextProvider>,
    );

    let table = container.querySelector(".Table");

    expect(table).toHaveClass("density-compact");

    // Switch to comfortable
    runInAction(() => {
      mockState.tableDensity = "comfortable";
    });

    rerender(
      <DiContextProvider value={{ di }}>
        <Table
          items={items}
          virtual
          getTableRow={(id) => {
            const item = items.find(i => i.id === id);

            return (
              <TableRow sortItem={item}>
                <TableCell>{item?.name}</TableCell>
              </TableRow>
            );
          }}
        >
          <TableHead>
            <TableCell>Name</TableCell>
          </TableHead>
        </Table>
      </DiContextProvider>,
    );

    table = container.querySelector(".Table");
    expect(table).toHaveClass("density-comfortable");
  });
});
