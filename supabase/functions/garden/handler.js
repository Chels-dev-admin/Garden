// Garden Guide backend: one Supabase Edge Function.
//   GET  ?feed=<token>                 calendar feed (.ics) for one garden
//   POST {action: "add", name, group}  write a new plant guide with Claude
//   POST {action: "rewrite", slug}     rewrite a plant for the garden's location
//   POST {action: "overview"}          write local tips for the garden's location
//   POST {action: "import", plants}    copy ready-made guides (no Claude)
//   POST {action: "delete_account"}    delete the signed-in account and its garden
//   POST {action: "status"}            whether Claude guide-writing is switched on
// POSTs need the user's access token: "Authorization: Bearer <token>".
import { buildCalendar } from "./calendar.js";
import { cleanImported, fieldSets, guideFields, localToday, normalise, OTHER, overviewPrompt, parseJson, plantPrompt, slugify, str } from "./guide.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function secretKey(env) {
  try {
    const keys = JSON.parse(env.SUPABASE_SECRET_KEYS || "{}");
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (first) return first;
  } catch { /* fall through to legacy key */ }
  return env.SUPABASE_SERVICE_ROLE_KEY;
}

export function makeDb(env, fetchImpl) {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const key = secretKey(env);
  if (!key) throw new HttpError(500, "Backend is missing its Supabase secret key.");
  const headers = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`; // legacy service-role JWT

  async function call(url, { method = "GET", body, prefer } = {}) {
    const res = await fetchImpl(url, { method, headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) throw new HttpError(502, `Database error ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  const rest = (path, opts) => call(`${base}/rest/v1/${path}`, opts);

  return {
    rest,
    async user(token) {
      const res = await fetchImpl(`${base}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new HttpError(401, "Please sign in again.");
      return res.json();
    },
    deleteUser: (id) => call(`${base}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}

async function callClaude(env, fetchImpl, content, maxTokens = 5000) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, "Automatic guide writing isn't switched on for this site. You can still fill in guides yourself with Edit guide.");
  const url = env.CLAUDE_API_URL || "https://api.anthropic.com/v1/messages";
  for (let attempt = 1; ; attempt++) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, messages: [{ role: "user", content }] }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 3000));
      continue;
    }
    const detail = await res.text();
    console.error("Claude API error", res.status, detail.slice(0, 500));
    throw new HttpError(502, res.status === 401 ? "The Claude API key was rejected." : "Claude couldn't write the guide right now. Please try again shortly.");
  }
}

async function useQuota(db, env, userId) {
  const ok = await db.rest("rpc/bump_usage", {
    method: "POST",
    body: { p_user: userId, p_user_cap: Number(env.DAILY_LIMIT) || 30, p_global_cap: Number(env.GLOBAL_DAILY_LIMIT) || 300 },
  });
  if (ok !== true) throw new HttpError(429, "Daily limit for new guides reached. Please try again tomorrow.");
}

async function loadGarden(db, userId) {
  const [garden] = await db.rest(`gardens?user_id=eq.${userId}&select=*`);
  if (!garden || !garden.location) throw new HttpError(400, "Set your garden's location first.");
  const rows = await db.rest(`plants?user_id=eq.${userId}&select=slug,data`);
  return { garden, plants: rows.map((r) => ({ ...r.data, slug: r.slug })) };
}

async function writeGuide(env, fetchImpl, name, garden, plants, hint = "") {
  const today = localToday(garden.timezone);
  const text = await callClaude(env, fetchImpl, plantPrompt(name, garden.location, today, hint, fieldSets(plants)));
  let g;
  try { g = parseJson(text); } catch { throw new HttpError(502, "The guide came back in an unexpected format. Please try again."); }
  if (g.error) throw new HttpError(422, `Couldn't write a guide for "${name}": ${str(g.error, 200)}`);
  return { g, today };
}

async function addPlant(db, env, fetchImpl, userId, body) {
  const name = str(body.name, 80);
  if (!name) throw new HttpError(400, "Type a plant name.");
  const { garden, plants } = await loadGarden(db, userId);
  if (plants.some((p) => p.slug === slugify(name) || p.name.toLowerCase() === name.toLowerCase())) throw new HttpError(409, `${name} is already in your garden.`);
  await useQuota(db, env, userId);
  const { g, today } = await writeGuide(env, fetchImpl, name, garden, plants);
  const finalName = str(g.name, 60) || name;
  const slug = slugify(finalName);
  if (!slug) throw new HttpError(422, "Couldn't make a page name for that plant.");
  if (plants.some((p) => p.slug === slug)) throw new HttpError(409, `${finalName} is already in your garden.`);
  const plant = { slug, name: finalName, group: str(body.group, 40) || OTHER, ...guideFields(g, today), added: today };
  const [stored] = normalise([...plants, plant]).slice(-1);
  await db.rest("plants", { method: "POST", body: { user_id: userId, slug, data: stored }, prefer: "return=minimal" });
  return { plant: stored };
}

async function rewritePlant(db, env, fetchImpl, userId, body) {
  const slug = slugify(body.slug || "");
  const { garden, plants } = await loadGarden(db, userId);
  const old = plants.find((p) => p.slug === slug);
  if (!old) throw new HttpError(404, "That plant isn't in your garden.");
  await useQuota(db, env, userId);
  const hint = old.botanical && old.botanical !== "N/A" ? ` (${old.botanical})` : "";
  const { g, today } = await writeGuide(env, fetchImpl, old.name, garden, plants, hint);
  const plant = { slug, name: old.name, group: old.group || OTHER, ...guideFields(g, today), added: old.added || today, updated: today };
  const stored = normalise(plants.map((p) => (p.slug === slug ? plant : p))).find((p) => p.slug === slug);
  await db.rest(`plants?user_id=eq.${userId}&slug=eq.${encodeURIComponent(slug)}`, { method: "PATCH", body: { data: stored, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
  return { plant: stored };
}

async function writeOverview(db, env, fetchImpl, userId) {
  const [garden] = await db.rest(`gardens?user_id=eq.${userId}&select=location`);
  if (!garden?.location) throw new HttpError(400, "Set your garden's location first.");
  await useQuota(db, env, userId);
  const text = (await callClaude(env, fetchImpl, overviewPrompt(garden.location), 3000)).replace(/^```\w*\n?|```\s*$/g, "").trim();
  if (!text.includes("## ")) throw new HttpError(502, "Couldn't write tips for that location. Try a more specific place name.");
  await db.rest(`gardens?user_id=eq.${userId}`, { method: "PATCH", body: { overview: text.slice(0, 20000), updated_at: new Date().toISOString() }, prefer: "return=minimal" });
  return { overview: text };
}

async function importPlants(db, userId, body) {
  const list = Array.isArray(body.plants) ? body.plants.slice(0, 100) : [];
  const [garden] = await db.rest(`gardens?user_id=eq.${userId}&select=timezone`);
  const today = localToday(garden?.timezone);
  const existing = new Set((await db.rest(`plants?user_id=eq.${userId}&select=slug`)).map((r) => r.slug));
  const fresh = list.map((p) => cleanImported(p, today)).filter((p) => p && !existing.has(p.slug));
  const unique = [...new Map(fresh.map((p) => [p.slug, p])).values()];
  if (unique.length) {
    await db.rest("plants", { method: "POST", body: unique.map((p) => ({ user_id: userId, slug: p.slug, data: p })), prefer: "return=minimal" });
  }
  return { imported: unique.map((p) => p.slug) };
}

async function feed(db, token) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404, headers: CORS });
  const [garden] = await db.rest(`gardens?feed_token=eq.${token}&select=user_id,label,location,timezone`);
  if (!garden) return new Response("Not found", { status: 404, headers: CORS });
  const rows = await db.rest(`plants?user_id=eq.${garden.user_id}&select=data`);
  const ics = buildCalendar(rows.map((r) => r.data), { name: `Garden reminders${garden.label ? ` (${garden.label})` : ""}`, timezone: garden.timezone || "UTC" });
  return new Response(ics, { headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "max-age=900" } });
}

export async function handle(req, env, fetchImpl = fetch) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const db = makeDb(env, fetchImpl);
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.has("feed")) return await feed(db, url.searchParams.get("feed"));
    if (req.method !== "POST") throw new HttpError(405, "Use POST.");
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "Please sign in.");
    const user = await db.user(token);
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case "add": return json(await addPlant(db, env, fetchImpl, user.id, body));
      case "rewrite": return json(await rewritePlant(db, env, fetchImpl, user.id, body));
      case "overview": return json(await writeOverview(db, env, fetchImpl, user.id));
      case "import": return json(await importPlants(db, user.id, body));
      case "status": return json({ ai: Boolean(env.ANTHROPIC_API_KEY), dailyLimit: Number(env.DAILY_LIMIT) || 30 });
      case "delete_account":
        await db.deleteUser(user.id);
        return json({ deleted: true });
      default: throw new HttpError(400, "Unknown action.");
    }
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    return json({ error: e instanceof HttpError ? e.message : "Something went wrong. Please try again." }, e.status || 500);
  }
}
