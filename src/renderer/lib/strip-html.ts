// Cheap HTML → plain-text converter for places that need a flat snippet
// (kanban card preview, list view, search index). Uses DOMParser when a
// browser DOM is available; falls back to a regex strip on the server.

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  if (typeof window !== "undefined" && typeof DOMParser !== "undefined") {
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
    } catch {
      // fall through to regex
    }
  }
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
