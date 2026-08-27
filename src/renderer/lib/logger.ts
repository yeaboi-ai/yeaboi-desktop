const isDev = process.env.NODE_ENV !== "production";

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) console.debug("[DEBUG]", ...args);
  },
  info: (...args: unknown[]) => {
    if (isDev) console.info("[INFO]", ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn("[WARN]", ...args);
  },
  error: (...args: unknown[]) => {
    console.error("[ERROR]", ...args);
  },
  apiError: (url: string, status: number, context?: string) => {
    console.error(`[API ERROR] ${context || "Request"} failed: ${url} (${status})`);
  },
  /** Log Web Vitals metrics (LCP, FID, CLS, TTFB, INP). */
  perf: (name: string, value: number, rating?: string) => {
    if (isDev) {
      const color = rating === "good" ? "green" : rating === "needs-improvement" ? "orange" : "red";
      console.debug(`[PERF] ${name}: ${Math.round(value)}ms (${rating || "?"})`, `color: ${color}`);
    }
  },
};
