/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { NonInjectedDocumentation } from "../documentation";
import {
  documentationArticles,
  getDocumentationArticle,
  searchDocumentation,
} from "../documentation-catalog";

describe("Documentation Component & Offline Catalog (H8.7 / DOC-001..DOC-008)", () => {
  let navigateToDocumentationMock: jest.Mock;
  let navigateToWelcomeMock: jest.Mock;
  let openLinkInBrowserMock: jest.Mock;

  beforeEach(() => {
    navigateToDocumentationMock = jest.fn();
    navigateToWelcomeMock = jest.fn();
    openLinkInBrowserMock = jest.fn().mockResolvedValue(undefined);
  });

  describe("Offline Catalog", () => {
    it("contains 10 bundled articles matching manifest", () => {
      expect(documentationArticles).toHaveLength(10);
      const article = getDocumentationArticle("ventanas-flotantes");
      expect(article).toBeDefined();
      expect(article?.title).toBe("Cómo crear una ventana flotante");
      expect(article?.section).toBe("Ventanas y paneles");
    });

    it("searches articles with case-insensitivity and accents normalization", () => {
      const results1 = searchDocumentation("ventana flotante");
      expect(results1.length).toBeGreaterThan(0);
      expect(results1[0].id).toBe("ventanas-flotantes");

      const results2 = searchDocumentation("IA");
      expect(results2.length).toBeGreaterThan(0);
      expect(results2.some((r) => r.id === "diagnostico-ia")).toBe(true);

      const results3 = searchDocumentation("OOMKilled");
      expect(results3.length).toBeGreaterThan(0);
      expect(results3.some((r) => r.id === "escaner-sintetico")).toBe(true);
    });

    it("returns all articles on empty query", () => {
      expect(searchDocumentation("")).toHaveLength(10);
      expect(searchDocumentation("   ")).toHaveLength(10);
    });
  });

  describe("Documentation UI Component", () => {
    function renderDoc() {
      return render(
        <NonInjectedDocumentation
          navigateToDocumentation={navigateToDocumentationMock}
          navigateToWelcome={navigateToWelcomeMock}
          openLinkInBrowser={openLinkInBrowserMock}
        />
      );
    }

    it("renders documentation center layout, search bar, and initial article", () => {
      renderDoc();

      expect(screen.getByTestId("documentation-center")).toBeInTheDocument();
      expect(screen.getByTestId("documentation-search")).toBeInTheDocument();
      expect(screen.getByTestId("documentation-back-welcome")).toBeInTheDocument();
      expect(screen.getByTestId("documentation-article-body")).toBeInTheDocument();
      expect(screen.getByTestId("documentation-article-title")).toHaveTextContent("Bienvenido a OpenLens DevOps");
    });

    it("filters sidebar list when typing in search input", () => {
      renderDoc();

      const searchInput = screen.getByTestId("documentation-search");
      fireEvent.change(searchInput, { target: { value: "ventana flotante" } });

      expect(screen.getByTestId("documentation-article-ventanas-flotantes")).toBeInTheDocument();
      expect(screen.queryByTestId("documentation-article-primeros-pasos")).not.toBeInTheDocument();
    });

    it("switches active article when clicking on an article button", () => {
      renderDoc();

      const articleBtn = screen.getByTestId("documentation-article-ventanas-flotantes");
      fireEvent.click(articleBtn);

      expect(screen.getByTestId("documentation-article-title")).toHaveTextContent("Cómo crear una ventana flotante");
      expect(navigateToDocumentationMock).toHaveBeenCalledWith("ventanas-flotantes");
    });

    it("supports history back navigation", () => {
      renderDoc();

      // Navigate to another article first
      fireEvent.click(screen.getByTestId("documentation-article-diagnostico-ia"));
      expect(screen.getByTestId("documentation-article-title")).toHaveTextContent("Cómo usar el diagnóstico con IA");

      // Back button should now be enabled
      const backBtn = screen.getByTestId("documentation-back");
      expect(backBtn).not.toBeDisabled();

      fireEvent.click(backBtn);
      expect(screen.getByTestId("documentation-article-title")).toHaveTextContent("Bienvenido a OpenLens DevOps");
    });

    it("returns to welcome on Volver a Bienvenida click", () => {
      renderDoc();

      fireEvent.click(screen.getByTestId("documentation-back-welcome"));
      expect(navigateToWelcomeMock).toHaveBeenCalledTimes(1);
    });

    it("handles related article navigation", () => {
      renderDoc();

      // Open article with related links
      fireEvent.click(screen.getByTestId("documentation-article-ventanas-flotantes"));

      const relatedBtn = screen.getByTestId("related-link-workspaces");
      expect(relatedBtn).toBeInTheDocument();

      fireEvent.click(relatedBtn);
      expect(screen.getByTestId("documentation-article-title")).toHaveTextContent("Workspaces y restauración de layouts");
    });

    it("intercepts external links and delegates to openLinkInBrowser", () => {
      renderDoc();

      const bodyArea = screen.getByTestId("documentation-article-body");
      const link = document.createElement("a");
      link.href = "https://k8slens.dev";
      bodyArea.appendChild(link);

      fireEvent.click(link);
      expect(openLinkInBrowserMock).toHaveBeenCalledWith("https://k8slens.dev");
    });
  });
});
