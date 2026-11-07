/** OpenLens DevOps — H8.7 first-party documentation, bundled and available offline. */
import "./documentation.scss";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { withInjectables } from "@ogre-tools/injectable-react";
import navigateToDocumentationInjectable from "../../../common/front-end-routing/routes/documentation/navigate-to-documentation.injectable";
import type { NavigateToDocumentation } from "../../../common/front-end-routing/routes/documentation/navigate-to-documentation.injectable";
import navigateToWelcomeInjectable from "../../../common/front-end-routing/routes/welcome/navigate-to-welcome.injectable";
import openLinkInBrowserInjectable from "../../../common/utils/open-link-in-browser.injectable";
import { observableHistoryInjectionToken } from "@openlens/routing";
import type { ObservableHistory } from "mobx-observable-history";
import { MarkdownViewer } from "../markdown-viewer";
import {
  documentationArticles,
  getDocumentationArticle,
  searchDocumentation,
} from "./documentation-catalog";

export type DocumentationProps = {
  navigateToDocumentation: NavigateToDocumentation;
  navigateToWelcome: () => void;
  openLinkInBrowser?: (url: string) => Promise<void>;
  observableHistory?: ObservableHistory<unknown>;
};

function resolveCurrentArticleId(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get("article") || params.get("articleId");
    if (queryId && getDocumentationArticle(queryId)) {
      return queryId;
    }

    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const docIdx = pathParts.indexOf("documentation");
    if (docIdx !== -1 && pathParts[docIdx + 1]) {
      const pathId = pathParts[docIdx + 1];
      if (getDocumentationArticle(pathId)) {
        return pathId;
      }
    }
  } catch {}

  return "inicio";
}

export const NonInjectedDocumentation = ({
  navigateToDocumentation,
  navigateToWelcome,
  openLinkInBrowser,
  observableHistory,
}: DocumentationProps) => {
  const [activeId, setActiveId] = useState(resolveCurrentArticleId);
  const [query, setQuery] = useState("");
  const [backStack, setBackStack] = useState<string[]>([]);
  const articles = useMemo(() => searchDocumentation(query), [query]);
  const article = getDocumentationArticle(activeId) ?? documentationArticles[0];
  const sections = useMemo(() => Array.from(new Set(articles.map((item) => item.section))), [articles]);

  useEffect(() => {
    const syncWithLocation = () => {
      const current = resolveCurrentArticleId();
      if (current && getDocumentationArticle(current)) {
        setActiveId(current);
      }
    };

    window.addEventListener("popstate", syncWithLocation);
    syncWithLocation();

    const unlisten = observableHistory?.listen?.(() => {
      syncWithLocation();
    });

    return () => {
      window.removeEventListener("popstate", syncWithLocation);
      unlisten?.();
    };
  }, [observableHistory]);

  const openArticle = useCallback((id: string) => {
    if (!getDocumentationArticle(id) || id === activeId) {
      return;
    }
    setBackStack((stack) => [...stack.slice(-19), activeId]);
    setActiveId(id);
    navigateToDocumentation(id);
    document.getElementById("documentation-article-body")?.scrollTo?.({ top: 0 });
  }, [activeId, navigateToDocumentation]);

  const goBack = useCallback(() => {
    const previous = backStack[backStack.length - 1];

    if (!previous) {
      return;
    }

    setBackStack((stack) => stack.slice(0, -1));
    setActiveId(previous);
    navigateToDocumentation(previous);
    document.getElementById("documentation-article-body")?.scrollTo?.({ top: 0 });
  }, [backStack, navigateToDocumentation]);

  const handleBodyClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest("a");
    if (!target) return;

    const href = target.getAttribute("href");
    if (!href) return;

    e.preventDefault();

    if (href.startsWith("http://") || href.startsWith("https://")) {
      if (openLinkInBrowser) {
        void openLinkInBrowser(href);
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
      return;
    }

    const clean = href
      .replace(/^#\/documentation\//, "")
      .replace(/^\/documentation\//, "")
      .replace(/^#/, "")
      .replace(/\.md$/, "");

    if (getDocumentationArticle(clean)) {
      openArticle(clean);
    }
  }, [openArticle, openLinkInBrowser]);

  return (
    <main className="DocumentationCenter" data-testid="documentation-center">
      <header className="DocumentationCenter__header">
        <div>
          <div className="DocumentationCenter__eyebrow">OPENLENS DEVOPS / GUÍA LOCAL</div>
          <h1 data-testid="documentation-article-title">{article.title}</h1>
          <p>{article.summary}</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: "12px",
              background: "rgba(152, 195, 121, 0.15)",
              color: "#98c379",
              border: "1px solid rgba(152, 195, 121, 0.3)",
            }}
          >
            Offline
          </span>
          <button
            type="button"
            className="DocumentationCenter__welcome"
            data-testid="documentation-back-welcome"
            onClick={() => navigateToWelcome()}
          >
            Volver a Bienvenida
          </button>
        </div>
      </header>
      <div className="DocumentationCenter__layout">
        <nav aria-label="Índice de documentación" className="DocumentationCenter__sidebar">
          <label htmlFor="documentation-search">Buscar en las guías</label>
          <input
            id="documentation-search"
            data-testid="documentation-search"
            data-search-alias="documentation-search-input"
            type="search"
            autoComplete="off"
            value={query}
            placeholder="Ventanas, IA, incidentes..."
            onChange={(event) => setQuery(event.target.value)}
          />
          {articles.length === 0 ? (
            <p className="DocumentationCenter__empty" data-testid="documentation-search-empty">
              No hay resultados para esta búsqueda.
            </p>
          ) : (
            sections.map((section) => (
              <section key={section} className="DocumentationCenter__group">
                <h2>{section}</h2>
                {articles.filter((entry) => entry.section === section).map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={entry.id === activeId ? "DocumentationCenter__item is-active" : "DocumentationCenter__item"}
                    data-testid={"documentation-article-" + entry.id}
                    aria-current={entry.id === activeId ? "page" : undefined}
                    onClick={() => openArticle(entry.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                      <span>{entry.title}</span>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "1px 5px",
                          borderRadius: "3px",
                          marginLeft: "6px",
                          opacity: 0.85,
                          background: entry.status === "Disponible" ? "rgba(152, 195, 121, 0.15)" : "rgba(229, 192, 123, 0.15)",
                          color: entry.status === "Disponible" ? "#98c379" : "#e5c07b",
                          border: entry.status === "Disponible" ? "1px solid rgba(152, 195, 121, 0.3)" : "1px solid rgba(229, 192, 123, 0.3)",
                        }}
                        data-testid={`badge-status-${entry.id}`}
                      >
                        {entry.status}
                      </span>
                    </div>
                  </button>
                ))}
              </section>
            ))
          )}
        </nav>
        <section
          className="DocumentationCenter__article"
          id="documentation-article-body"
          data-testid="documentation-article-body"
          onClick={handleBodyClick}
        >
          <div className="DocumentationCenter__toolbar">
            <button type="button" disabled={backStack.length === 0} data-testid="documentation-back" onClick={goBack}>
              Atrás
            </button>
            <button type="button" disabled={activeId === "inicio"} data-testid="documentation-home" onClick={() => openArticle("inicio")}>
              Inicio
            </button>
            <span className="DocumentationCenter__status" data-testid="documentation-status">{article.status}</span>
          </div>
          <div className="DocumentationCenter__meta">
            <span>{article.section}</span>
            <span>·</span>
            <span>H8.7 · Guía offline</span>
            <span>·</span>
            <span>Revisión: 2026-11-06</span>
          </div>
          <MarkdownViewer markdown={article.markdown} />
          <div className="DocumentationCenter__related">
            <h2>Artículos relacionados</h2>
            <div className="DocumentationCenter__relatedLinks">
              {article.related.map((id) => {
                const related = getDocumentationArticle(id);

                return related ? (
                  <button type="button" key={id} onClick={() => openArticle(id)} data-testid={`related-link-${id}`}>
                    {related.title}
                  </button>
                ) : null;
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export const Documentation = withInjectables<DocumentationProps>(NonInjectedDocumentation, {
  getProps: (di) => ({
    navigateToDocumentation: di.inject(navigateToDocumentationInjectable),
    navigateToWelcome: di.inject(navigateToWelcomeInjectable),
    openLinkInBrowser: di.inject(openLinkInBrowserInjectable),
    observableHistory: di.inject(observableHistoryInjectionToken),
  }),
});
