// First-paint theme boot. The ThemeProvider persists the resolved theme
// (id, scheme, full token map) into the `theme` cookie; painting it here —
// before the app bundle loads — is what the Next server render used to do.
// A real file rather than an inline script so the CSP keeps script-src 'self'.
try {
  const row = document.cookie.split('; ').find((r) => r.startsWith('theme='));
  if (row) {
    const parsed = JSON.parse(decodeURIComponent(row.slice('theme='.length)));
    const el = document.documentElement;
    if (parsed && (parsed.color_scheme === 'light' || parsed.color_scheme === 'dark')) {
      el.dataset.theme = String(parsed.id ?? '');
      el.dataset.colorScheme = parsed.color_scheme;
      if (parsed.tokens && typeof parsed.tokens === 'object') {
        for (const [key, value] of Object.entries(parsed.tokens)) {
          if (typeof value === 'string') el.style.setProperty(`--${key}`, value);
        }
      }
    }
  }
} catch {
  /* fall through to the provider's default */
}
