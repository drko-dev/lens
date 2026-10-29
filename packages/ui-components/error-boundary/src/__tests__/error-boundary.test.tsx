/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { createContainer, getInjectable } from "@ogre-tools/injectable";
import {
  DiContextProvider,
  registerInjectableReact,
} from "@ogre-tools/injectable-react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { observableHistoryInjectionToken } from "@openlens/routing";
import { ErrorBoundary } from "../error-boundary";

jest.mock("@openlens/button", () => ({
  Button: ({ label, onClick }: any) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

const ThrowingView = () => {
  throw new Error("Expected test failure");
};

const HealthyView = ({ label }: { label: string }) => (
  <div data-testid="healthy-view">{label}</div>
);

describe("ErrorBoundary route recovery", () => {
  const routePath = observable.box("/a");
  const history = {
    get location() {
      return { pathname: routePath.get() };
    },
    goBack: jest.fn(() => runInAction(() => routePath.set("/previous"))),
  };
  const di = createContainer("error-boundary-route-recovery");
  const RouteFromHistory = observer(() =>
    routePath.get() === "/a" ? (
      <ThrowingView />
    ) : (
      <HealthyView label="Previous route" />
    )
  );

  beforeAll(() => {
    registerInjectableReact(di);
    di.register(
      getInjectable({
        id: "test-observable-history",
        instantiate: () => history as any,
        injectionToken: observableHistoryInjectionToken,
      })
    );
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    runInAction(() => routePath.set("/a"));
    history.goBack.mockClear();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  const boundary = (children: React.ReactNode) => (
    <DiContextProvider value={{ di }}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </DiContextProvider>
  );

  it("recovers to a healthy next route after a child throws", async () => {
    const view = render(boundary(<ThrowingView />));

    expect(await screen.findByText(/App crash at/)).toBeInTheDocument();

    act(() => runInAction(() => routePath.set("/b")));
    view.rerender(boundary(<HealthyView label="Route B" />));

    expect(await screen.findByTestId("healthy-view")).toHaveTextContent(
      "Route B"
    );
  });

  it("clears a prior route error so A to B to A stays healthy", async () => {
    const view = render(boundary(<ThrowingView />));

    expect(await screen.findByText(/App crash at/)).toBeInTheDocument();

    act(() => runInAction(() => routePath.set("/b")));
    view.rerender(boundary(<HealthyView label="Route B" />));
    expect(await screen.findByTestId("healthy-view")).toHaveTextContent(
      "Route B"
    );

    act(() => runInAction(() => routePath.set("/a")));
    view.rerender(boundary(<HealthyView label="Route A" />));

    expect(await screen.findByTestId("healthy-view")).toHaveTextContent(
      "Route A"
    );
  });

  it("uses Back from the fallback and does not retain the error on the previous route", async () => {
    render(boundary(<RouteFromHistory />));

    expect(await screen.findByText(/App crash at/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(history.goBack).toHaveBeenCalledTimes(1);

    expect(await screen.findByTestId("healthy-view")).toHaveTextContent(
      "Previous route"
    );
    expect(screen.queryByText(/App crash at/)).not.toBeInTheDocument();
  });
});
