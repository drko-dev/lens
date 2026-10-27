/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */
import React from "react";
import { SubTitle } from "../../../../../../renderer/components/layout/sub-title";
import { withInjectables } from "@ogre-tools/injectable-react";
import { observer } from "mobx-react";
import { Radio, RadioGroup } from "../../../../../../renderer/components/radio";
import type { UserPreferencesState } from "../../../../../user-preferences/common/state.injectable";
import userPreferencesStateInjectable from "../../../../../user-preferences/common/state.injectable";

interface Dependencies {
  state: UserPreferencesState;
}

const NonInjectedTableDensity = observer(({ state }: Dependencies) => {
  const density = state.tableDensity ?? "lens";

  return (
    <section id="table-density-preferences">
      <SubTitle title="Table Density" />
      <p className="text-secondary" style={{ marginBottom: "1rem" }}>
        Configure the visual row height and density for tables and resource lists across OpenLens.
      </p>
      <RadioGroup
        asButtons
        value={density}
        onChange={(value) => {
          state.tableDensity = value;
        }}
      >
        <Radio
          value="compact"
          label="Compact (29px)"
          data-testid="density-compact-radio"
        />
        <Radio
          value="lens"
          label="Lens (35px)"
          data-testid="density-lens-radio"
        />
        <Radio
          value="comfortable"
          label="Spacious (43px)"
          data-testid="density-comfortable-radio"
        />
      </RadioGroup>
      <div
        className={`preview-table-box Table density-${density}`}
        data-testid="table-density-preview"
        style={{
          marginTop: "1.25rem",
          maxWidth: "520px",
          border: "1px solid var(--border-1)",
          borderRadius: "var(--radius-sm)",
          overflow: "hidden",
        }}
      >
        <div
          className="TableHead"
          style={{
            display: "flex",
            backgroundColor: "var(--tableHeaderBackground)",
            borderBottom: "1px solid var(--border-1)",
            fontWeight: 600,
            fontSize: "var(--fs-sm)",
          }}
        >
          <div className="TableCell" style={{ flex: 2 }}>Sample Resource</div>
          <div className="TableCell" style={{ flex: 1 }}>Status</div>
          <div className="TableCell" style={{ flex: 1 }}>Age</div>
        </div>
        <div
          className="TableRow"
          style={{
            display: "flex",
            boxShadow: "inset 0 -1px 0 var(--border-1)",
          }}
        >
          <div className="TableCell" style={{ flex: 2 }}>production-api-deployment-789f</div>
          <div className="TableCell" style={{ flex: 1, color: "var(--colorSuccess)" }}>Running</div>
          <div className="TableCell" style={{ flex: 1 }}>24d</div>
        </div>
        <div
          className="TableRow"
          style={{
            display: "flex",
          }}
        >
          <div className="TableCell" style={{ flex: 2 }}>ingress-controller-nginx-4b2c</div>
          <div className="TableCell" style={{ flex: 1, color: "var(--colorSuccess)" }}>Running</div>
          <div className="TableCell" style={{ flex: 1 }}>52d</div>
        </div>
      </div>
    </section>
  );
});

export const TableDensity = withInjectables<Dependencies>(NonInjectedTableDensity, {
  getProps: (di) => ({
    state: di.inject(userPreferencesStateInjectable),
  }),
});
