// The current Convex Auth token, readable outside React.
//
// The paid API routes need it on every fetch, and the only supported way to
// read it is useAuthToken() — a hook, which a plain fetch helper cannot call.
// Threading it through every call site would mean the three components that
// ask a question each carrying a token they otherwise have no use for, so one
// bridge component publishes it here instead.
//
// Null is a normal value: demo-mode visitors have no token and get the
// smaller anonymous allowance rather than being turned away.

let current: string | null = null;

export function setAuthToken(token: string | null) {
  current = token;
}

export function getAuthToken(): string | null {
  return current;
}

/** Authorization header for a paid endpoint, or nothing when signed out. */
export function authHeaders(): Record<string, string> {
  return current ? { authorization: `Bearer ${current}` } : {};
}
