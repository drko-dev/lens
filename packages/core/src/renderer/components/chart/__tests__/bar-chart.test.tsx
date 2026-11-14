/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { getDiForUnitTesting } from "../../../getDiForUnitTesting";
import { renderFor } from "../../test-utils/renderFor";

let capturedOptions: any;

jest.mock("../chart", () => {
  const actual = jest.requireActual("../chart");

  return {
    ...actual,
    Chart: (props: any) => {
      capturedOptions = props.options;

      return <div data-testid="mock-chart" />;
    },
  };
});

import { BarChart } from "../bar-chart";

describe("<BarChart /> responsive time labels (F11)", () => {
  const renderChart = () => {
    const di = getDiForUnitTesting();
    const render = renderFor(di);
    const data = {
      datasets: [{
        label: "cpu",
        borderColor: "#00a7a0",
        data: Array.from({ length: 61 }, (_, i) => ({ x: 1700000000 + i * 60, y: i })),
      }],
    };

    render(<BarChart data={data} timeLabelStep={5} />);

    return capturedOptions.scales.xAxes[0].ticks.callback as (ts: string, idx: number) => string;
  };

  it("keeps 5-minute tick step on wide charts (1440px parity)", () => {
    const callback = renderChart();
    const wideScale = { width: 600 };

    expect(callback.call(wideScale, "1700000300000", 5)).not.toBe("");
    expect(callback.call(wideScale, "1700000600000", 10)).not.toBe("");
    expect(callback.call(wideScale, "1700000900000", 15)).not.toBe("");
  });

  it("widens tick step to 15 minutes on narrow charts (< 420px / 960px window) to avoid label overlap", () => {
    const callback = renderChart();
    const narrowScale = { width: 240 };

    expect(callback.call(narrowScale, "1700000300000", 5)).toBe("");
    expect(callback.call(narrowScale, "1700000600000", 10)).toBe("");
    expect(callback.call(narrowScale, "1700000900000", 15)).not.toBe("");
    expect(callback.call(narrowScale, "1700001800000", 30)).not.toBe("");
  });
});
