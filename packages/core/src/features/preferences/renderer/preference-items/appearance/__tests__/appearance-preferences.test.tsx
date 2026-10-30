/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { observable } from "mobx";
import type { UserPreferencesState } from "../../../../../user-preferences/common/state.injectable";
import { TableDensity } from "../table-density/table-density";
import { EnvironmentColors } from "../environment-colors/environment-colors";
import { ApplicationIconPreferences } from "../application-icon/application-icon-preferences";
import appearancePreferenceTabInjectable from "../appearance-preference-tab.injectable";
import appearancePreferencePageInjectable from "../appearance-preference-page.injectable";
import { getDiForUnitTesting } from "../../../../../../renderer/getDiForUnitTesting";
import userPreferencesStateInjectable from "../../../../../user-preferences/common/state.injectable";
import { DiContextProvider } from "@ogre-tools/injectable-react";

describe("Preferences > Appearance", () => {
  let di: ReturnType<typeof getDiForUnitTesting>;
  let mockState: UserPreferencesState;

  beforeEach(() => {
    di = getDiForUnitTesting();
    mockState = observable({
      tableDensity: "compact",
      environmentColors: {},
    } as unknown as UserPreferencesState);

    di.override(userPreferencesStateInjectable, () => mockState);
  });

  describe("Appearance tab & page metadata", () => {
    it("has correct tab metadata in general-tab-group", () => {
      const tab = di.inject(appearancePreferenceTabInjectable);

      expect(tab.id).toBe("appearance-tab");
      expect(tab.parentId).toBe("general-tab-group");
      expect(tab.pathId).toBe("appearance");
      expect(tab.label).toBe("Appearance");
      expect(tab.orderNumber).toBe(15);
    });

    it("has correct page metadata linked to appearance-tab", () => {
      const page = di.inject(appearancePreferencePageInjectable);

      expect(page.id).toBe("appearance-page");
      expect(page.parentId).toBe("appearance-tab");
    });
  });

  describe("<TableDensity />", () => {
    it("renders compact mode by default with preview table", () => {
      render(
        <DiContextProvider value={{ di }}>
          <TableDensity />
        </DiContextProvider>,
      );

      expect(screen.getByText("Table Density")).toBeInTheDocument();
      const preview = screen.getByTestId("table-density-preview");

      expect(preview).toHaveClass("density-compact");
    });

    it("switches to comfortable mode reactively when selected", () => {
      render(
        <DiContextProvider value={{ di }}>
          <TableDensity />
        </DiContextProvider>,
      );

      const comfortableRadio = screen.getByText("Spacious (43px)");

      fireEvent.click(comfortableRadio);

      expect(mockState.tableDensity).toBe("comfortable");
      const preview = screen.getByTestId("table-density-preview");

      expect(preview).toHaveClass("density-comfortable");
    });
  });

  describe("<ApplicationIconPreferences />", () => {
    it("renders every preset with an absolute branding asset which survives nested routes", () => {
      mockState.applicationIconId = "azul";

      render(
        <DiContextProvider value={{ di }}>
          <ApplicationIconPreferences />
        </DiContextProvider>,
      );

      const thumbs = screen.getAllByRole("img");

      expect(thumbs.length).toBe(11);

      for (const thumb of thumbs) {
        const src = thumb.getAttribute("src");

        expect(src).toMatch(/^\/branding\/app-icons\/[a-z]+\.png$/);
        expect(src?.startsWith("./branding")).toBe(false);
      }
    });
  });

  describe("<EnvironmentColors />", () => {
    it("renders all cluster environments with locked production guard", () => {
      render(
        <DiContextProvider value={{ di }}>
          <EnvironmentColors />
        </DiContextProvider>,
      );

      expect(screen.getByText("Cluster Environment Colors")).toBeInTheDocument();

      // PROD must be strictly locked
      const prodIndicator = screen.getByTestId("prod-locked-indicator");

      expect(prodIndicator).toBeInTheDocument();
      expect(prodIndicator).toHaveTextContent("Locked (Safety Guard)");
      expect(screen.queryByTestId("env-color-picker-production")).not.toBeInTheDocument();

      // Other environments are customizable
      expect(screen.getByTestId("env-color-picker-staging")).toBeInTheDocument();
      expect(screen.getByTestId("env-color-picker-development")).toBeInTheDocument();
      expect(screen.getByTestId("env-color-picker-testing")).toBeInTheDocument();
      expect(screen.getByTestId("env-color-picker-local")).toBeInTheDocument();
    });

    it("allows updating colors and restoring defaults", () => {
      render(
        <DiContextProvider value={{ di }}>
          <EnvironmentColors />
        </DiContextProvider>,
      );

      const devInput = screen.getByTestId("env-color-input-development");

      fireEvent.change(devInput, { target: { value: "#22C55E" }});

      expect(mockState.environmentColors?.development).toBe("#22C55E");

      const restoreBtn = screen.getByTestId("restore-default-colors-btn");

      expect(restoreBtn).not.toBeDisabled();

      fireEvent.click(restoreBtn);
      expect(mockState.environmentColors).toEqual({});
    });

    it("does not update state when an incomplete hex color is typed, and preserves previous color", () => {
      render(
        <DiContextProvider value={{ di }}>
          <EnvironmentColors />
        </DiContextProvider>,
      );

      const devInput = screen.getByTestId("env-color-input-development");

      // Type incomplete hex values: state should not be updated
      fireEvent.change(devInput, { target: { value: "#" }});
      expect(mockState.environmentColors?.development).toBeUndefined();

      fireEvent.change(devInput, { target: { value: "#1" }});
      expect(mockState.environmentColors?.development).toBeUndefined();

      fireEvent.change(devInput, { target: { value: "#123" }});
      expect(mockState.environmentColors?.development).toBeUndefined();

      fireEvent.change(devInput, { target: { value: "#12345" }});
      expect(mockState.environmentColors?.development).toBeUndefined();

      // Type complete valid hex: state updates
      fireEvent.change(devInput, { target: { value: "#123456" }});
      expect(mockState.environmentColors?.development).toBe("#123456");

      // Now type an incomplete draft: state retains previous valid color
      fireEvent.change(devInput, { target: { value: "#ABC" }});
      expect(mockState.environmentColors?.development).toBe("#123456");

      // On blur, draft is discarded and reverts to current valid color
      fireEvent.blur(devInput);
      expect((devInput as HTMLInputElement).value).toBe("#123456");
    });
  });
});
