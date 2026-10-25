// Small Supabase client: email/password accounts, this user's garden rows, and
// the backend function. Uses plain fetch, so the site needs no extra libraries.

const SESSION_KEY = "gg.session";

function save(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
function load(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const friendly = (msg = "", status) => {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match. Check them, or tap Forgot password.";
  if (/already registered|already exists/i.test(msg)) return "That email already has an account. Sign in instead.";
  if (/password should be at least|weak password/i.test(msg)) return "Use a longer password: at least 8 characters.";
  if (/email.*invalid|invalid.*email|unable to validate email/i.test(msg)) return "That email address doesn't look right.";
  if (/rate limit|too many/i.test(msg) || status === 429) return msg && status !== 429 ? "Too many attempts. Please wait a few minutes and try again." : msg || "Too many attempts. Please wait and try again.";
  if (/email not confirmed/i.test(msg)) return "Check your email and tap the confirmation link first.";
  return msg || `Something went wrong (${status}).`;
};

export function createApi({ supabaseUrl, supabaseKey, functionsUrl }) {
  const base = supabaseUrl.replace(/\/$/, "");
  const fnBase = (functionsUrl || `${base}/functions/v1`).replace(/\/$/, "");
  let session = load(SESSION_KEY);
  const listeners = new Set();

  const setSession = (s) => {
    session = s && s.access_token
      ? { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), user: s.user }
      : null;
    save(SESSION_KEY, session);
    listeners.forEach((fn) => fn(session));
  };

  async function request(url, { method = "GET", body, auth = true, headers = {} } = {}) {
    const h = { apikey: supabaseKey, "Content-Type": "application/json", ...headers };
    if (auth) {
      const token = await accessToken();
      if (!token) throw new ApiError("Please sign in again.", 401);
      h.Authorization = `Bearer ${token}`;
    }
    let res;
    try {
      res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new ApiError("Can't reach the garden server. Check your connection, or the server may be paused.", 0);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = data?.error_description || data?.msg || data?.message || data?.error || "";
      if (res.status === 401 && auth) setSession(null);
      throw new ApiError(friendly(typeof msg === "string" ? msg : "", res.status), res.status);
    }
    return data;
  }

  let refreshing = null;
  async function accessToken() {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    refreshing ||= request(`${base}/auth/v1/token?grant_type=refresh_token`, { method: "POST", auth: false, body: { refresh_token: session.refresh_token } })
      .then(setSession, () => setSession(null))
      .finally(() => { refreshing = null; });
    await refreshing;
    return session?.access_token || null;
  }

  // Password-recovery links land on the site with tokens in the URL hash.
  function takeSessionFromUrl() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (!h.get("access_token")) {
      const err = h.get("error_description");
      if (err) history.replaceState(null, "", location.pathname + location.search);
      return err ? { error: err.replace(/\+/g, " ") } : null;
    }
    const type = h.get("type");
    setSession({ access_token: h.get("access_token"), refresh_token: h.get("refresh_token"), expires_in: Number(h.get("expires_in")) || 3600 });
    history.replaceState(null, "", location.pathname + location.search);
    return { type };
  }

  const rest = (path, opts) => request(`${base}/rest/v1/${path}`, opts);
  const uid = () => session?.user?.id;

  return {
    get session() { return session; },
    get user() { return session?.user || null; },
    onChange: (fn) => listeners.add(fn),
    takeSessionFromUrl,

    async signUp(email, password) {
      const data = await request(`${base}/auth/v1/signup`, { method: "POST", auth: false, body: { email, password } });
      if (data?.access_token) { setSession(data); return { confirmed: true }; }
      return { confirmed: false }; // email confirmation is switched on
    },
    async signIn(email, password) {
      setSession(await request(`${base}/auth/v1/token?grant_type=password`, { method: "POST", auth: false, body: { email, password } }));
    },
    async loadUser() {
      const user = await request(`${base}/auth/v1/user`);
      setSession({ ...session, user });
      return user;
    },
    async signOut() {
      try { await request(`${base}/auth/v1/logout`, { method: "POST" }); } catch { /* signed out locally anyway */ }
      setSession(null);
    },
    recover: (email, redirectTo) =>
      request(`${base}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: "POST", auth: false, body: { email } }),
    setPassword: (password) => request(`${base}/auth/v1/user`, { method: "PUT", body: { password } }),

    async garden() {
      const [g] = await rest(`gardens?user_id=eq.${uid()}&select=*`);
      return g || null;
    },
    saveGarden: (fields) =>
      rest("gardens?on_conflict=user_id", { method: "POST", body: { user_id: uid(), ...fields, updated_at: new Date().toISOString() }, headers: { Prefer: "resolution=merge-duplicates,return=representation" } }).then((r) => r[0]),
    async plants() {
      const rows = await rest(`plants?user_id=eq.${uid()}&select=slug,data`);
      return rows.map((r) => ({ ...r.data, slug: r.slug }));
    },
    insertPlant: (p) =>
      rest("plants", { method: "POST", body: { user_id: uid(), slug: p.slug, data: p }, headers: { Prefer: "return=minimal" } }),
    updatePlant: (p) =>
      rest(`plants?user_id=eq.${uid()}&slug=eq.${encodeURIComponent(p.slug)}`, { method: "PATCH", body: { data: p, updated_at: new Date().toISOString() }, headers: { Prefer: "return=minimal" } }),
    deletePlant: (slug) =>
      rest(`plants?user_id=eq.${uid()}&slug=eq.${encodeURIComponent(slug)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }),

    fn: (action, body = {}) => request(`${fnBase}/garden`, { method: "POST", body: { action, ...body } }),
    feedUrl: (token) => `${fnBase}/garden?feed=${token}`,
  };
}
