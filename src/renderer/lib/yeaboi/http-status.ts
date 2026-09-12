// Whether a sidecar answer is a success. The proxy forwards the status as
// the route set it, and a create answers 201, so "ok" is the 2xx range, not
// one number.

export function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}
