/** H8.7: deterministic, bundled, searchable guide; no network or filesystem access at runtime. */
import { packagedUserGuide } from "./user-guide.generated";

export type DocumentationArticle = (typeof packagedUserGuide)[number];

export const documentationArticles: readonly DocumentationArticle[] = packagedUserGuide;

export function getDocumentationArticle(id: string | null | undefined): DocumentationArticle | undefined {
  return documentationArticles.find((article) => article.id === id);
}

export function normalizeDocumentationSearch(value: string): string {
  return value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function searchDocumentation(query: string): DocumentationArticle[] {
  const normalized = normalizeDocumentationSearch(query);

  if (!normalized) {
    return [...documentationArticles];
  }

  const scored = documentationArticles
    .map((article) => {
      let score = 0;
      if (normalizeDocumentationSearch(article.id) === normalized) score += 200;
      else if (normalizeDocumentationSearch(article.id).includes(normalized)) score += 100;

      if (normalizeDocumentationSearch(article.title).includes(normalized)) score += 50;
      if (normalizeDocumentationSearch(article.summary).includes(normalized)) score += 25;
      if (normalizeDocumentationSearch(article.section).includes(normalized)) score += 10;
      if (normalizeDocumentationSearch(article.markdown).includes(normalized)) score += 1;
      return { article, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.article);
}
