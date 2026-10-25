import { buildCalendar } from "./calendar.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const OTHER = "Other plants";
const WORKFLOW = "garden.yml";

const state = { plants: [], overview: "", settings: loadSettings(), pending: [] };

/* ---------- settings ---------- */
function store(key, value) {
  try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function guessRepo() {
  const host = location.hostname;
  if (!host.endsWith(".github.io")) return "";
  const owner = host.split(".")[0];
  const first = location.pathname.split("/").filter(Boolean)[0];
  return `${owner}/${first && !first.includes(".") ? first : host}`;
}
function loadSettings() {
  return { repo: read("gg.repo") || guessRepo(), branch: read("gg.branch") || "main", token: read("gg.token") || "" };
}
const canSync = () => state.settings.repo && state.settings.token;

/* ---------- data ---------- */
async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${state.settings.repo}${path}`, {
    ...opts,
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${state.settings.token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(res.status === 401 ? "GitHub token was rejected. Check it in Settings." : res.status === 404 ? "Repository or workflow not found. Check Settings and that the token can access this repo." : body.message || `GitHub error ${res.status}`);
  }
  return res;
}

async function fetchPlants() {
  if (canSync()) {
    try {
      const res = await gh(`/contents/plants.json?ref=${encodeURIComponent(state.settings.branch)}`, { headers: { Accept: "application/vnd.github.raw+json" } });
      return await res.json();
    } catch (e) { console.warn("Falling back to site copy:", e.message); }
  }
  const res = await fetch(`plants.json?t=${Date.now()}`, { cache: "no-store" });
  return res.json();
}

async function init() {
  const [plants, overview] = await Promise.all([
    fetchPlants(),
    fetch(`overview.md?t=${Date.now()}`).then((r) => (r.ok ? r.text() : "")).catch(() => ""),
  ]);
  state.plants = plants;
  state.overview = overview;
  render();
}

/* ---------- grouping ---------- */
function groups() {
  const map = new Map();
  for (const p of state.plants) {
    const g = p.group || OTHER;
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(p);
  }
  for (const add of state.pending.filter((x) => x.action === "add")) {
    const g = add.group || OTHER;
    if (!map.has(g)) map.set(g, []);
    map.get(g).push({ slug: null, name: add.plant, pending: true });
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === OTHER) - (b === OTHER) || a.localeCompare(b))
    .map(([name, items]) => [name, items.sort((a, b) => a.name.localeCompare(b.name))]);
}
const groupNames = () => [...new Set([...state.plants.map((p) => p.group || OTHER), "Chillies", "Kitchen herbs", "Medicinal herbs", OTHER])].sort();

/* ---------- rendering ---------- */
function route() {
  const m = location.hash.match(/^#\/plant\/([\w-]+)/);
  return m ? { view: "plant", slug: m[1] } : { view: "overview" };
}

function render() {
  const r = route();
  renderSidebar(r);
  const main = $("#main");
  if (r.view === "plant") {
    const p = state.plants.find((x) => x.slug === r.slug);
    main.innerHTML = p ? plantView(p) : `<h1>Not found</h1><p class="muted">That plant isn't in the guide. It may have been removed.</p><p><a href="#/">Back to overview</a></p>`;
    if (p) bindPlant(p);
    document.title = p ? `${p.name} · Garden Guide` : "Garden Guide";
  } else {
    main.innerHTML = overviewView();
    bindOverview();
    document.title = "Garden Guide";
  }
  $("#groupList").innerHTML = groupNames().map((g) => `<option value="${esc(g)}">`).join("");
}

function renderSidebar(r) {
  const cur = (slug) => (r.view === "plant" && r.slug === slug ? ' aria-current="page"' : "");
  let html = `<a class="nav-link" href="#/"${r.view === "overview" ? ' aria-current="page"' : ""}>Overview</a>`;
  for (const [g, items] of groups()) {
    html += `<div class="nav-group"><div class="nav-group-title"><span>${esc(g)}</span><span>${items.length}</span></div>`;
    for (const p of items) {
      html += p.pending
        ? `<span class="nav-link muted">${esc(p.name)}<span class="badge">adding</span></span>`
        : `<a class="nav-link" href="#/plant/${p.slug}"${cur(p.slug)}>${esc(p.name)}</a>`;
    }
    html += `</div>`;
  }
  $("#sidebar").innerHTML = html;
}

const kv = (pairs) =>
  `<ul class="kv">${pairs.map(([k, v]) => `<li class="${/caution/i.test(k) ? "caution" : ""}"><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join("")}</ul>`;

const DAYS = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
function describeRrule(rr) {
  if (!rr) return "";
  const o = Object.fromEntries(rr.split(";").map((p) => p.split("=")));
  const n = Number(o.INTERVAL || 1);
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[o.FREQ] || "";
  let s = n > 1 ? `Every ${n} ${unit}s` : `Every ${unit}`;
  if (o.BYDAY) s += ` on ${o.BYDAY.split(",").map((d) => DAYS[d.slice(-2)] || d).join(", ")}`;
  if (o.UNTIL) s += ` until ${fmtDate(`${o.UNTIL.slice(0, 4)}-${o.UNTIL.slice(4, 6)}-${o.UNTIL.slice(6, 8)}`)}`;
  if (o.COUNT) s += `, ${o.COUNT} times`;
  return s;
}
function fmtDate(iso, opts = { day: "numeric", month: "short", year: "numeric" }) {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d) ? iso : d.toLocaleDateString("en-AU", opts);
}

function plantView(p) {
  const g = p.glance || {};
  const glance = [["Sun", g.sun], ["Water", g.water], ["Spacing", g.spacing], ["Pot size", g.pot], ["Indoors", g.indoors]]
    .filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  const pendingHere = state.pending.find((x) => x.plant === p.slug || x.plant === p.name);
  const tasks = (p.tasks || []).slice().sort((a, b) => a.start.localeCompare(b.start));
  return `
    ${pendingHere ? `<div class="pending-banner">Saving your change to ${esc(p.name)}…</div>` : ""}
    <div class="eyebrow">
      <button class="chip" id="groupChip" title="Change group">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h7l2 2h9v10H3z"/></svg>${esc(p.group || OTHER)}
      </button>
      ${p.calendar && tasks.length ? `<span class="chip">In calendar feed</span>` : ""}
    </div>
    <h1>${esc(p.name)}</h1>
    ${p.botanical ? `<p class="botanical">${esc(p.botanical)}</p>` : ""}
    <p class="lead">${esc(p.summary)}</p>
    ${glance ? `<dl class="glance">${glance}</dl>` : ""}
    <h2>Growing</h2>${kv(p.growing || [])}
    ${p.harvest ? `<h2>Harvest</h2><p>${esc(p.harvest)}</p>` : ""}
    <h2>Uses</h2>${kv(p.uses || [])}
    ${tasks.length ? `
      <h2>Calendar reminders</h2>
      <div class="card">
        <ul class="tasks">${tasks.map((t) => `
          <li><span class="task-date">${esc(fmtDate(t.start, { day: "numeric", month: "short" }))}</span>
          <span><b>${esc(t.title)}</b>${t.rrule ? `<div class="task-repeat">${esc(describeRrule(t.rrule))}</div>` : ""}${t.notes ? `<div class="muted">${esc(t.notes)}</div>` : ""}</span></li>`).join("")}
        </ul>
      </div>` : ""}
    ${p.reminders ? `<h2>Care schedule</h2><p>${esc(p.reminders)}</p>` : ""}
    <div class="page-actions">
      ${tasks.length ? `<button class="btn" id="icsBtn"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>Download reminders</button>` : ""}
      <button class="btn" id="regroupBtn">Change group</button>
      <button class="btn btn-danger" id="removeBtn">Remove plant</button>
    </div>`;
}

function bindPlant(p) {
  const openGroup = () => {
    $("#groupPlantName").textContent = p.name;
    $("#groupForm").group.value = p.group || "";
    $("#groupForm").dataset.slug = p.slug;
    $("#groupDialog").showModal();
  };
  $("#groupChip").onclick = openGroup;
  $("#regroupBtn").onclick = openGroup;
  $("#removeBtn").onclick = () => {
    $("#removePlantName").textContent = p.name;
    $("#removeNote").textContent = p.calendar
      ? "Its guide tab and its reminders in the calendar feed will be deleted."
      : "Its guide tab will be deleted. Reminders added straight to your phone calendar earlier stay there; delete those in your calendar app.";
    $("#removeForm").dataset.slug = p.slug;
    $("#removeDialog").showModal();
  };
  const ics = $("#icsBtn");
  if (ics) ics.onclick = () => download(`${p.slug}-reminders.ics`, buildCalendar([p], { name: `${p.name} reminders`, onlyCalendar: false }));
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function feedUrl() {
  const base = location.href.split("#")[0].replace(/[^/]*$/, "");
  return new URL("calendar.ics", base).href;
}

function overviewView() {
  const all = groups().flatMap(([, items]) => items).filter((p) => !p.pending);
  const row = (p) => {
    const g = p.glance || {};
    return `<tr><td><a href="#/plant/${p.slug}">${esc(p.name)}</a></td><td>${esc(g.sun)}</td><td>${esc(g.water)}</td><td>${esc(g.spacing)}</td><td>${esc(g.indoors)}</td></tr>`;
  };
  const feed = feedUrl();
  const webcal = feed.replace(/^https?:/, "webcal:");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const feedCount = state.plants.filter((p) => p.calendar && p.tasks?.length).length;
  return `
    <h1>Your garden</h1>
    <p class="lead">${all.length} plants in ${groups().length} groups, with growing guides tailored to sandy, frost-free, salt-breezy peninsula conditions.</p>

    <div class="card">
      <h3>Automatic calendar reminders</h3>
      <p>Every plant you add here puts its care reminders (pruning, feeding, pollinating, harvest) into one calendar feed. Subscribe once and new plants appear on their own; removed plants disappear. ${feedCount ? `${feedCount} plant${feedCount > 1 ? "s are" : " is"} in the feed now.` : "The feed starts filling when you add your first plant."}</p>
      <div class="feed-url"><input readonly value="${esc(feed)}" aria-label="Calendar feed address"><button class="btn btn-sm" id="copyFeed">Copy</button></div>
      <p><a href="${esc(google)}" target="_blank" rel="noopener">Subscribe in Google Calendar</a> · <a href="${esc(webcal)}">Open in calendar app</a></p>
      <p class="hint">On Android, subscribe in Google Calendar on the web and it appears in your phone's calendar. Subscribed calendars refresh every few hours. The 13 original plants' reminders were added to your phone calendar directly, so they aren't repeated in the feed.</p>
    </div>

    <h2>At a glance</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Plant</th><th>Sun</th><th>Water</th><th>Spacing</th><th>Indoors</th></tr></thead>
      <tbody>${all.map(row).join("")}</tbody>
    </table></div>
    <div class="prose">${markdown(state.overview)}</div>`;
}

function bindOverview() {
  const btn = $("#copyFeed");
  if (btn) btn.onclick = async () => {
    try { await navigator.clipboard.writeText(feedUrl()); btn.textContent = "Copied"; }
    catch { $(".feed-url input").select(); }
  };
}

// Small markdown renderer for the overview: headings, lists, bold, paragraphs.
function markdown(md) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); const l = m[1].length + 1; out.push(`<h${l}>${inline(m[2])}</h${l}>`); }
    else if ((m = line.match(/^[-*]\s+(.*)/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\d+\.\s+(.*)/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (line.trim()) { close(); out.push(`<p>${inline(line)}</p>`); }
    else close();
  }
  close();
  return out.join("");
}

/* ---------- status toast ---------- */
let toastTimer;
function toast(html, { busy = false, sticky = false } = {}) {
  const el = $("#status");
  clearTimeout(toastTimer);
  el.innerHTML = `${busy ? '<span class="spinner"></span>' : ""}<span>${html}</span>`;
  el.hidden = false;
  if (!busy && !sticky) toastTimer = setTimeout(() => (el.hidden = true), 6000);
}

/* ---------- sync via GitHub Actions ---------- */
const claimed = new Set();

async function runAction(action, plant, group, label) {
  if (!canSync()) {
    openSettings("Connect your GitHub repository first.");
    return false;
  }
  const job = { action, plant, group, label, since: Date.now() };
  state.pending.push(job);
  render();
  toast(`${esc(label)}…`, { busy: true });
  try {
    await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: state.settings.branch, inputs: { action, plant: plant || "", group: group || "" } }),
    });
    const run = await waitForRun(job);
    if (run.conclusion !== "success") throw Object.assign(new Error("The update didn't finish."), { url: run.html_url });
    state.plants = await fetchPlants();
    return true;
  } catch (e) {
    toast(`${esc(e.message)}${e.url ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener">See details</a>` : ""}`, { sticky: true });
    state.plants = await fetchPlants().catch(() => state.plants);
    return false;
  } finally {
    state.pending = state.pending.filter((x) => x !== job);
    render();
  }
}

async function waitForRun(job) {
  const deadline = Date.now() + 6 * 60 * 1000;
  let run = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, run ? 6000 : 4000));
    if (!run) {
      const res = await gh(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=10`);
      const { workflow_runs: runs = [] } = await res.json();
      run = runs
        .filter((r) => !claimed.has(r.id) && Date.parse(r.created_at) >= job.since - 60000)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0] || null;
      if (run) claimed.add(run.id);
    } else {
      run = await (await gh(`/actions/runs/${run.id}`)).json();
    }
    if (run && run.status === "completed") return run;
  }
  throw new Error("Still working after 6 minutes. Refresh the page in a bit to see if it finished.");
}

/* ---------- dialogs ---------- */
function openSettings(msg) {
  const f = $("#settingsForm");
  f.repo.value = state.settings.repo;
  f.branch.value = state.settings.branch;
  f.token.value = state.settings.token;
  if (msg) toast(esc(msg));
  $("#settingsDialog").showModal();
}

document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));

$("#addBtn").onclick = () => {
  $("#addForm").reset();
  $("#addDialog").showModal();
};
$("#settingsBtn").onclick = () => openSettings();

$("#addForm").onsubmit = async (e) => {
  const f = e.target;
  const plant = f.plant.value.trim();
  const group = f.group.value.trim();
  if (!plant) return;
  if (state.plants.some((p) => p.name.toLowerCase() === plant.toLowerCase())) {
    e.preventDefault();
    toast(`${esc(plant)} is already in the guide.`);
    return;
  }
  const before = new Set(state.plants.map((p) => p.slug));
  const ok = await runAction("add", plant, group, `Writing a guide for ${plant}`);
  if (ok) {
    const added = state.plants.find((p) => !before.has(p.slug));
    const n = added?.tasks?.length || 0;
    toast(added ? `${esc(added.name)} added, with ${n} reminder${n === 1 ? "" : "s"} in your calendar feed.` : "Plant added.");
    if (added) location.hash = `#/plant/${added.slug}`;
  }
};

$("#groupForm").onsubmit = async (e) => {
  const slug = e.target.dataset.slug;
  const group = e.target.group.value.trim();
  const p = state.plants.find((x) => x.slug === slug);
  if (!p || !group || group === p.group) return;
  p.group = group; // show it straight away
  const ok = await runAction("group", slug, group, `Moving ${p.name} to ${group}`);
  if (ok) toast(`${esc(p.name)} moved to ${esc(group)}.`);
};

$("#removeForm").onsubmit = async (e) => {
  const slug = e.target.dataset.slug;
  const p = state.plants.find((x) => x.slug === slug);
  if (!p) return;
  state.plants = state.plants.filter((x) => x !== p);
  location.hash = "#/";
  const ok = await runAction("remove", slug, "", `Removing ${p.name}`);
  if (ok) toast(`${esc(p.name)} removed.`);
};

$("#settingsForm").onsubmit = async (e) => {
  const f = e.target;
  state.settings = { repo: f.repo.value.trim(), branch: f.branch.value.trim() || "main", token: f.token.value.trim() };
  store("gg.repo", state.settings.repo);
  store("gg.branch", state.settings.branch);
  store("gg.token", state.settings.token || null);
  if (canSync()) {
    try {
      await gh(`/actions/workflows/${WORKFLOW}`);
      toast("Connected to GitHub.");
      state.plants = await fetchPlants();
      render();
    } catch (err) {
      toast(esc(err.message), { sticky: true });
    }
  }
};

/* ---------- mobile menu ---------- */
const sidebar = $("#sidebar");
const menuBtn = $("#menuBtn");
menuBtn.onclick = () => {
  const open = sidebar.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open);
};
sidebar.addEventListener("click", (e) => {
  if (e.target.closest("a")) { sidebar.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }
});

window.addEventListener("hashchange", () => { render(); $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0); });
init().catch((e) => {
  $("#main").innerHTML = `<h1>Couldn't load the garden</h1><p class="muted">${esc(e.message)}</p>`;
});
