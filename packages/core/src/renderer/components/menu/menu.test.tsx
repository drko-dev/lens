/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import "@testing-library/jest-dom/extend-expect";
import React, { useState } from "react";
import { act, fireEvent } from "@testing-library/react";
import { getDiForUnitTesting } from "../../getDiForUnitTesting";
import { renderFor } from "../test-utils/renderFor";
import { Menu, MenuItem } from "./menu";

describe("<Menu /> portal position", () => {
  it("places a portaled context menu on screen after the animated menu mounts", async () => {
    const di = getDiForUnitTesting();
    const opener = document.createElement("button");

    opener.id = "pin-opener";
    opener.getBoundingClientRect = () => ({
      x: 12,
      y: 80,
      left: 12,
      top: 80,
      right: 56,
      bottom: 136,
      width: 44,
      height: 56,
      toJSON: () => ({}),
    });
    document.body.appendChild(opener);

    function Harness() {
      const [isOpen, setIsOpen] = useState(false);

      return (
        <Menu
          usePortal
          htmlFor="pin-opener"
          isOpen={isOpen}
          toggleEvent="contextmenu"
          open={() => setIsOpen(true)}
          close={() => setIsOpen(false)}
        >
          <MenuItem>Remove from Hotbar</MenuItem>
        </Menu>
      );
    }

    renderFor(di)(<Harness />);
    fireEvent.contextMenu(opener);
    await act(async () => {
      await Promise.resolve();
    });

    const menu = document.body.querySelector<HTMLElement>("ul.Menu");

    expect(menu).not.toBeNull();
    expect(menu?.style.left).toBe("12px");
    expect(menu?.style.top).toBe("144px");
    opener.remove();
  });
});
