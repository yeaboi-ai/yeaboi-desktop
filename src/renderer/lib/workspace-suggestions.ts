/**
 * Onboarding helpers — derive a friendly workspace name from signals the user
 * already gave us, so they don't have to type their company name by hand.
 */

const PERSONAL_PROVIDERS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "duck.com",
  "fastmail.com",
  "fastmail.fm",
  "tutanota.com",
  "tuta.io",
  "mail.com",
  "gmx.com",
  "gmx.de",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
]);

function titleCase(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Return the second-to-last label of a domain (`team.acme.com` → `acme`),
 * or the first label if the domain has only one segment.
 */
function rootLabel(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return parts[parts.length - 2];
}

/**
 * Suggest a workspace name for a freshly-signed-in user.
 *
 * - Custom domain (e.g. `omar@acme.com`) → "Acme".
 * - Personal provider (gmail, outlook, icloud, …) or no email → fall back
 *   to "<DisplayName>'s workspace", or "Personal workspace" if no name yet.
 */
export function suggestWorkspaceName(
  email?: string | null,
  displayName?: string | null,
): string {
  const domain = email?.toLowerCase().split("@")[1]?.trim();
  if (domain && !PERSONAL_PROVIDERS.has(domain)) {
    const base = rootLabel(domain);
    if (base) return titleCase(base);
  }
  const name = displayName?.trim();
  return name ? `${name}'s workspace` : "Personal workspace";
}
