/**
 * Curated glossary of technical terms surfaced in planning-session chat.
 *
 * Wave 2: clickable terms in AI messages open a popover with plain-English
 * definitions, contextual hints, examples, and learn-more links. Wave 3 will
 * override `contextHint` per-message with project-aware text via a server WS
 * event; the static value here is the fallback when no contextual gloss is
 * available yet.
 *
 * Keep entries short — popovers are 288px wide. One-sentence definitions,
 * 1-2 concrete examples, 1-2 learn-more links. Aliases let the same entry
 * match plurals or common variants without separate definitions.
 */

export interface GlossaryEntry {
  /** Canonical lookup key (lowercase, dash-free). */
  slug: string;
  /** Display label in the popover header. */
  term: string;
  /** Extra strings that should also match this entry. Matched whole-word,
   *  case-insensitive. Use for plurals, dashed/undashed variants, and the
   *  most common spelled-out form ("auth" + "authentication"). */
  aliases?: string[];
  /** Plain-English definition. 1-2 short sentences. No jargon-in-definition. */
  definition: string;
  /** Generic "what the AI usually means by this." Wave 3 overrides per
   *  message with project-aware text from the backend. */
  contextHint: string;
  /** Real-world examples a non-technical user can ground on. */
  examples: string[];
  /** External learn-more links. Open in new tab. */
  learnMore: { label: string; url: string }[];
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    slug: "api",
    term: "API",
    aliases: ["apis"],
    definition:
      "A way for two software systems to talk to each other — one asks for something, the other returns it.",
    contextHint:
      "Usually means the contract between your frontend and backend, or between your app and an outside service.",
    examples: [
      "When your phone weather app fetches today's forecast, it calls an API.",
      "Stripe exposes an API your checkout page uses to charge a card.",
    ],
    learnMore: [
      { label: "MDN: What is an API?", url: "https://developer.mozilla.org/en-US/docs/Glossary/API" },
    ],
  },
  {
    slug: "rest",
    term: "REST",
    aliases: ["rest api", "restful"],
    definition:
      "The most common style of API on the web — predictable URLs and verbs (GET, POST) to read and change data.",
    contextHint: "When the AI says 'REST endpoint', it means a URL your app calls over HTTP.",
    examples: [
      "GET /users/42 to read a user, POST /users to create one.",
    ],
    learnMore: [
      { label: "MDN: REST", url: "https://developer.mozilla.org/en-US/docs/Glossary/REST" },
    ],
  },
  {
    slug: "graphql",
    term: "GraphQL",
    definition:
      "An API style where the client asks for exactly the fields it wants in one query, instead of hitting multiple URLs.",
    contextHint: "Often discussed as an alternative to REST when the frontend needs flexible data shapes.",
    examples: [
      "One request returns 'a user with their last 3 orders and total spend' — no extra round trips.",
    ],
    learnMore: [
      { label: "graphql.org", url: "https://graphql.org/" },
    ],
  },
  {
    slug: "auth",
    term: "Auth",
    aliases: ["authentication", "authn"],
    definition: "How your app knows who someone is — sign-up, login, password reset, sessions.",
    contextHint: "When the AI asks about 'auth', it means how users prove their identity to your app.",
    examples: [
      "Logging in with email + password.",
      "Signing in with Google.",
    ],
    learnMore: [
      { label: "Auth0: What is authentication?", url: "https://auth0.com/intro-to-iam/what-is-authentication" },
    ],
  },
  {
    slug: "authorization",
    term: "Authorization",
    aliases: ["authz", "permissions"],
    definition: "What a logged-in user is allowed to do — separate from how they logged in.",
    contextHint: "Authentication = who you are; authorization = what you can touch.",
    examples: [
      "An 'admin' can delete posts; a 'member' can only read them.",
    ],
    learnMore: [
      { label: "Auth0: Authentication vs Authorization", url: "https://auth0.com/intro-to-iam/authentication-vs-authorization" },
    ],
  },
  {
    slug: "oauth",
    term: "OAuth",
    aliases: ["oauth2", "oauth 2"],
    definition:
      "A standard way to let users log into your app using their account on another service (Google, GitHub, etc.) without sharing the password.",
    contextHint: "The mechanism behind every 'Sign in with X' button.",
    examples: [
      "Clicking 'Sign in with Google' redirects to Google, then back to your app with a token.",
    ],
    learnMore: [
      { label: "oauth.net", url: "https://oauth.net/2/" },
    ],
  },
  {
    slug: "jwt",
    term: "JWT",
    aliases: ["jwts", "json web token"],
    definition:
      "A signed token your app gives a user after login that they include on every subsequent request to prove they're still logged in.",
    contextHint: "Often used in stateless APIs so the server doesn't have to look up sessions in a database.",
    examples: [
      "After logging in, your app stores a JWT and sends it with every API call.",
    ],
    learnMore: [
      { label: "jwt.io intro", url: "https://jwt.io/introduction" },
    ],
  },
  {
    slug: "webhook",
    term: "Webhook",
    aliases: ["webhooks"],
    definition:
      "A URL your app exposes so another service can ping it when something happens — 'reverse API'.",
    contextHint: "Used to react to events from third-party services without constantly polling.",
    examples: [
      "Stripe calls your webhook when a payment succeeds so you can mark the order paid.",
    ],
    learnMore: [
      { label: "What is a webhook?", url: "https://en.wikipedia.org/wiki/Webhook" },
    ],
  },
  {
    slug: "schema",
    term: "Schema",
    aliases: ["schemas"],
    definition: "A blueprint for what data looks like — which fields, what types, what's required.",
    contextHint: "Usually refers to a database schema (table layout) or an API schema (request/response shape).",
    examples: [
      "A 'users' table schema: id (number), email (text), created_at (timestamp).",
    ],
    learnMore: [
      { label: "MDN: Database schema", url: "https://en.wikipedia.org/wiki/Database_schema" },
    ],
  },
  {
    slug: "migration",
    term: "Migration",
    aliases: ["migrations", "db migration"],
    definition:
      "A versioned change to the database structure — add a column, rename a table — that runs once when deployed.",
    contextHint: "Always discussed when adding new fields or changing how data is stored.",
    examples: [
      "Adding a 'phone_number' column to the users table needs a migration.",
    ],
    learnMore: [
      { label: "Wikipedia: Schema migration", url: "https://en.wikipedia.org/wiki/Schema_migration" },
    ],
  },
  {
    slug: "queue",
    term: "Queue",
    aliases: ["queues", "message queue", "job queue"],
    definition:
      "A backlog of tasks the app processes in the background, one at a time — so slow work doesn't block the user.",
    contextHint: "When the AI says 'put it on a queue', it means run it later, not while the user waits.",
    examples: [
      "Sending a welcome email goes on a queue so signup feels instant.",
    ],
    learnMore: [
      { label: "Message queues", url: "https://en.wikipedia.org/wiki/Message_queue" },
    ],
  },
  {
    slug: "cache",
    term: "Cache",
    aliases: ["caching", "cached"],
    definition:
      "A temporary store of frequently-used data, kept close to the user so the app doesn't recompute or refetch it every time.",
    contextHint: "Used to make things faster and cheaper, at the cost of slightly stale data.",
    examples: [
      "Your browser caches images so reload doesn't redownload them.",
    ],
    learnMore: [
      { label: "MDN: HTTP caching", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching" },
    ],
  },
  {
    slug: "cdn",
    term: "CDN",
    definition:
      "A network of servers around the world that holds copies of your static files (images, JS) so users download them from a nearby server.",
    contextHint: "Makes your site feel fast for users far from your main server.",
    examples: [
      "Cloudflare and Fastly are CDNs many sites use.",
    ],
    learnMore: [
      { label: "Cloudflare: What is a CDN?", url: "https://www.cloudflare.com/learning/cdn/what-is-a-cdn/" },
    ],
  },
  {
    slug: "ssr",
    term: "SSR",
    aliases: ["server-side rendering", "server side rendering"],
    definition:
      "Generating the HTML on the server before sending it to the browser — so the page is fully formed when it arrives.",
    contextHint: "Better for SEO and first-paint speed than rendering everything in the browser.",
    examples: [
      "Next.js pages are SSR by default.",
    ],
    learnMore: [
      { label: "Vercel: SSR explained", url: "https://vercel.com/docs/rendering" },
    ],
  },
  {
    slug: "microservice",
    term: "Microservice",
    aliases: ["microservices"],
    definition:
      "A small, independently-deployable piece of your backend that does one thing — versus one giant app that does everything.",
    contextHint: "Trade-off: more flexibility, more operational complexity.",
    examples: [
      "Split a monolith into 'auth service', 'billing service', 'notifications service'.",
    ],
    learnMore: [
      { label: "Martin Fowler on microservices", url: "https://martinfowler.com/articles/microservices.html" },
    ],
  },
  {
    slug: "monolith",
    term: "Monolith",
    aliases: ["monolithic"],
    definition: "A single, all-in-one backend app — the opposite of microservices.",
    contextHint:
      "Often the right starting point — simpler to build and deploy until your team grows past one squad.",
    examples: [
      "Most early-stage apps are monoliths until they hit scale problems.",
    ],
    learnMore: [
      { label: "Monolith first", url: "https://martinfowler.com/bliki/MonolithFirst.html" },
    ],
  },
  {
    slug: "ci-cd",
    term: "CI/CD",
    aliases: ["ci", "cd", "continuous integration", "continuous deployment"],
    definition:
      "Automation that runs tests on every code change (CI) and pushes the result to production automatically (CD).",
    contextHint:
      "When the AI says 'add it to CI', it means make the test or check run automatically on every PR.",
    examples: [
      "GitHub Actions running 'npm test' on every push.",
    ],
    learnMore: [
      { label: "GitLab: CI/CD explained", url: "https://about.gitlab.com/topics/ci-cd/" },
    ],
  },
  {
    slug: "env-var",
    term: "Environment variable",
    aliases: ["env var", "env vars", "environment variables"],
    definition:
      "A configuration value (API key, database URL) set outside the code so the same code can run in dev, staging, and prod with different settings.",
    contextHint: "Where secrets and per-environment config live.",
    examples: [
      "STRIPE_API_KEY=sk_test_... in development, sk_live_... in production.",
    ],
    learnMore: [
      { label: "12-factor config", url: "https://12factor.net/config" },
    ],
  },
  {
    slug: "rate-limit",
    term: "Rate limit",
    aliases: ["rate limiting", "rate-limited"],
    definition:
      "A cap on how often a client can call an API in a given window — protects the service from abuse and runaway costs.",
    contextHint: "Common reason an integration suddenly returns errors after working fine.",
    examples: [
      "Stripe lets you make 100 requests per second per account.",
    ],
    learnMore: [
      { label: "Cloudflare: Rate limiting", url: "https://www.cloudflare.com/learning/bots/what-is-rate-limiting/" },
    ],
  },
  {
    slug: "mvp",
    term: "MVP",
    aliases: ["minimum viable product"],
    definition:
      "The smallest version of a product that delivers real value to users — built to learn, not to be polished.",
    contextHint:
      "When the AI asks 'what's the MVP?', it's pushing you to cut scope down to the one thing that proves the idea.",
    examples: [
      "Airbnb's MVP was a single rented air mattress in a founder's apartment.",
    ],
    learnMore: [
      { label: "Lean Startup: MVP", url: "https://en.wikipedia.org/wiki/Minimum_viable_product" },
    ],
  },
  {
    slug: "regression",
    term: "Regression",
    aliases: ["regressions"],
    definition: "A bug that re-appears in code that used to work — usually caused by an unrelated change.",
    contextHint: "What you guard against by writing tests before changing something risky.",
    examples: [
      "Login broke after a refactor that 'shouldn't have touched auth'.",
    ],
    learnMore: [
      { label: "Wikipedia: Software regression", url: "https://en.wikipedia.org/wiki/Software_regression" },
    ],
  },
  {
    slug: "observability",
    term: "Observability",
    definition:
      "The ability to understand what your running system is doing — through logs, metrics, and traces — when something goes wrong.",
    contextHint: "How you debug production without SSHing into a server.",
    examples: [
      "Sentry for errors, Datadog for metrics, OpenTelemetry for traces.",
    ],
    learnMore: [
      { label: "Honeycomb: Observability 101", url: "https://www.honeycomb.io/what-is-observability" },
    ],
  },
  {
    slug: "e2e",
    term: "End-to-end test",
    aliases: ["e2e test", "e2e tests", "end to end"],
    definition:
      "A test that drives the whole app like a real user — clicking buttons, filling forms — to verify a flow works end-to-end.",
    contextHint: "The slowest tests, but the only kind that catches 'all the parts wired together'.",
    examples: [
      "Playwright clicks 'Sign up', fills the form, and verifies the dashboard loads.",
    ],
    learnMore: [
      { label: "Playwright docs", url: "https://playwright.dev/" },
    ],
  },
  {
    slug: "mock",
    term: "Mock",
    aliases: ["mocks", "mocked", "mocking"],
    definition:
      "A fake version of an external system used in tests so you can control its behavior — never call the real Stripe in CI.",
    contextHint:
      "When the AI says 'mock that out', it means replace the real dependency with a stand-in for the test.",
    examples: [
      "Mock the 'send email' function so tests don't actually send mail.",
    ],
    learnMore: [
      { label: "Martin Fowler on mocks", url: "https://martinfowler.com/articles/mocksArentStubs.html" },
    ],
  },
  {
    slug: "deploy",
    term: "Deploy",
    aliases: ["deployment", "deploys", "deploying"],
    definition: "Ship code so it runs in production where real users hit it.",
    contextHint: "Often discussed alongside CI/CD and rollback strategy.",
    examples: [
      "git push main → CI runs tests → Vercel deploys the new build.",
    ],
    learnMore: [
      { label: "Vercel deployments", url: "https://vercel.com/docs/deployments/overview" },
    ],
  },
];

/** Resolve any matched string (canonical term or alias) to a glossary entry. */
const _BY_KEY: Map<string, GlossaryEntry> = (() => {
  const m = new Map<string, GlossaryEntry>();
  for (const entry of GLOSSARY) {
    m.set(entry.term.toLowerCase(), entry);
    m.set(entry.slug.toLowerCase(), entry);
    for (const alias of entry.aliases ?? []) m.set(alias.toLowerCase(), entry);
  }
  return m;
})();

export function lookupGlossary(token: string): GlossaryEntry | undefined {
  return _BY_KEY.get(token.toLowerCase());
}

/** Compiled regex matching any glossary term/alias as a whole word, case-insensitive.
 *  Longer alternatives first so "rest api" beats "rest", "ci/cd" beats "ci". */
export const GLOSSARY_REGEX: RegExp = (() => {
  const keys = Array.from(_BY_KEY.keys()).sort((a, b) => b.length - a.length);
  // Escape regex metacharacters in each key.
  const escaped = keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Use lookarounds so we match whole words/phrases without consuming punctuation.
  // \b doesn't work for multi-word aliases ("rest api"), so we use a non-word
  // boundary check that allows start-of-string and punctuation on either side.
  return new RegExp(`(?<![A-Za-z0-9])(${escaped.join("|")})(?![A-Za-z0-9])`, "gi");
})();
