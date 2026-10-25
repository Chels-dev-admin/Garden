import { buildCalendar } from "./calendar.js";
import { createApi } from "./api.js";
import { fieldSets, localToday, normalise, slugify } from "./supabase/functions/garden/guide.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const OTHER = "Other plants";
const STARTER_PLACE = /woy woy|umina|ettalong|pearl beach|booker bay|blackwall|ettalong|peninsula/i;
const STARTER_LABEL = "Woy Woy peninsula";

const state = {
  api: null,
  screen: "loading",
  garden: null,
  plants: [],
  busy: null, // { label } while a long job runs
  ai: true, // whether the backend can write guides with Claude
  starter: null, // { plants, overview }
  setup: null,
};

/* ---------- helpers ---------- */
let toastTimer;
function toast(html, { busy = false, sticky = false } = {}) {
  const el = $("#status");
  clearTimeout(toastTimer);
  el.innerHTML = `${busy ? '<span class="spinner"></span>' : ""}<span>${html}</span>${!busy ? '<button class="toast-x" aria-label="Dismiss">×</button>' : ""}`;
  el.hidden = false;
  const x = el.querySelector(".toast-x");
  if (x) x.onclick = () => (el.hidden = true);
  if (!busy && !sticky) toastTimer = setTimeout(() => (el.hidden = true), 6000);
}
const hideToast = () => ($("#status").hidden = true);
const icon = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const labelFor = (loc) => String(loc).split(",")[0].trim().slice(0, 40);
const timezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

async function loadStarter() {
  if (state.starter) return state.starter;
  const [plants, overview] = await Promise.all([
    fetch("starter/plants.json").then((r) => r.json()).catch(() => []),
    fetch("starter/overview.md").then((r) => (r.ok ? r.text() : "")).catch(() => ""),
  ]);
  return (state.starter = { plants, overview });
}

async function reverseGeocode(btn, input) {
  if (!navigator.geolocation) return toast("Location isn't available in this browser. Type your town instead.");
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(async ({ coords }) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&lat=${coords.latitude.toFixed(3)}&lon=${coords.longitude.toFixed(3)}`;
      const { address: a = {} } = await (await fetch(url, { headers: { "Accept-Language": "en" } })).json();
      const town = a.suburb || a.town || a.village || a.city || a.hamlet || a.county || "";
      input.value = [town, a.state, a.country].filter(Boolean).join(", ") || `${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`;
    } catch {
      input.value = `${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`;
    } finally {
      btn.disabled = false;
      input.dispatchEvent(new Event("input"));
    }
  }, () => {
    btn.disabled = false;
    toast("Couldn't get your location. Type your town instead.");
  }, { timeout: 15000, maximumAge: 600000 });
}

function setScreen(screen) {
  state.screen = screen;
  document.body.dataset.screen = screen;
  render();
}

/* ---------- boot ---------- */
async function boot() {
  let config;
  try {
    config = await (await fetch(`config.json?t=${Date.now()}`, { cache: "no-store" })).json();
    if (!config.supabaseUrl || !config.supabaseKey) throw new Error();
  } catch {
    return setScreen("nobackend");
  }
  state.api = createApi(config);
  state.api.onChange((s) => { if (!s && state.screen !== "auth") { state.garden = null; state.plants = []; setScreen("auth"); } });
  const fromUrl = state.api.takeSessionFromUrl();
  if (fromUrl?.error) toast(esc(fromUrl.error), { sticky: true });
  if (!state.api.session) return setScreen("auth");
  try {
    await state.api.loadUser();
    await enterGarden();
    if (fromUrl?.type === "recovery") openAccount("Choose a new password below.");
  } catch (e) {
    if (fromUrl?.type === "recovery") toast("That reset link has expired or was already used. Tap Forgot password to get a new one.", { sticky: true });
    else if (state.api.session) toast(esc(e.message), { sticky: true });
    state.authMode = "signin";
    setScreen("auth");
  }
}

async function enterGarden() {
  const [garden, plants, status] = await Promise.all([state.api.garden(), state.api.plants(), state.api.fn("status").catch(() => null)]);
  state.ai = status ? status.ai : true;
  state.garden = garden;
  state.plants = normalise(plants);
  if (garden?.setup_done) setScreen("app");
  else startSetup();
}

async function reloadGarden() {
  const [garden, plants] = await Promise.all([state.api.garden(), state.api.plants()]);
  state.garden = garden;
  state.plants = normalise(plants);
  render();
}

/* ---------- rendering ---------- */
function route() {
  const m = location.hash.match(/^#\/plant\/([\w-]+)(\/edit)?/);
  return m ? { view: m[2] ? "edit" : "plant", slug: m[1] } : { view: "overview" };
}

function render() {
  const main = $("#main");
  $("#brandSub").textContent = state.garden?.label || (state.screen === "app" ? "" : "Your garden, your climate");
  $("#sidebar").innerHTML = "";
  if (state.screen === "loading") { main.innerHTML = `<p class="loading">Loading your garden…</p>`; return; }
  if (state.screen === "nobackend") { main.innerHTML = noBackendView(); return; }
  if (state.screen === "auth") { main.innerHTML = authView(); bindAuth(); return; }
  if (state.screen === "setup") { main.innerHTML = setupView(); bindSetup(); return; }
  const r = route();
  renderSidebar(r);
  if (r.view === "edit") {
    const p = state.plants.find((x) => x.slug === r.slug);
    main.innerHTML = p ? editView(p) : `<h1>Not found</h1><p><a href="#/">Back to overview</a></p>`;
    if (p) bindEdit(p);
    document.title = p ? `Edit ${p.name} · Garden Guide` : "Garden Guide";
  } else if (r.view === "plant") {
    const p = state.plants.find((x) => x.slug === r.slug);
    main.innerHTML = p ? plantView(p) : `<h1>Not found</h1><p class="muted">That plant isn't in your garden. It may have been removed.</p><p><a href="#/">Back to overview</a></p>`;
    if (p) bindPlant(p);
    document.title = p ? `${p.name} · Garden Guide` : "Garden Guide";
  } else {
    main.innerHTML = overviewView();
    bindOverview();
    document.title = "Garden Guide";
  }
  $("#groupList").innerHTML = groupNames().map((g) => `<option value="${esc(g)}">`).join("");
}

function noBackendView() {
  return `<div class="narrow">
    <h1>Almost there</h1>
    <p class="lead">This Garden Guide hasn't been connected to its account server yet.</p>
    <p>If you look after this site, follow the <b>Set up the backend</b> steps in the README, then run the <b>Deploy backend</b> action on GitHub. This page will then show a sign-in screen.</p>
  </div>`;
}

/* ---------- auth ---------- */
function authView() {
  const mode = state.authMode || "signup";
  return `<div class="narrow">
    <div class="hero-mark">${'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 52V28" stroke-width="4"/><path d="M32 34c-10 0-16-6-16-16 10 0 16 6 16 16zM32 30c0-9 5-15 15-15 0 9-5 15-15 15z"/></svg>'}</div>
    <h1>${mode === "signup" ? "Grow with a guide made for your garden" : mode === "forgot" ? "Reset your password" : "Welcome back"}</h1>
    <p class="lead">${mode === "signup"
      ? "Growing guides, uses, safety notes and calendar reminders for your plants, tailored to where you live. Your garden syncs to every device you sign in on."
      : mode === "forgot" ? "Enter your email and we'll send a link to choose a new password." : "Sign in to see your garden on this device."}</p>
    ${mode !== "forgot" ? `<div class="tabs" role="tablist">
      <button role="tab" class="tab" aria-selected="${mode === "signup"}" data-mode="signup">Create account</button>
      <button role="tab" class="tab" aria-selected="${mode === "signin"}" data-mode="signin">Sign in</button>
    </div>` : ""}
    <form id="authForm" class="card form" novalidate>
      <label>Email<input name="email" type="email" autocomplete="email" required value="${esc(state.authEmail || "")}"></label>
      ${mode !== "forgot" ? `<label>Password
        <span class="pw"><input name="password" type="password" minlength="8" required autocomplete="${mode === "signup" ? "new-password" : "current-password"}"><button type="button" class="pw-toggle" aria-label="Show password">Show</button></span>
      </label>${mode === "signup" ? '<p class="hint">At least 8 characters.</p>' : ""}` : ""}
      <p class="form-error" id="authError" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit">${mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}</button>
      ${mode === "signin" ? '<button type="button" class="link-btn" data-mode="forgot">Forgot password?</button>' : ""}
      ${mode === "forgot" ? '<button type="button" class="link-btn" data-mode="signin">Back to sign in</button>' : ""}
    </form>
  </div>`;
}

function bindAuth() {
  document.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => {
    state.authEmail = $("#authForm").email.value;
    state.authMode = b.dataset.mode;
    render();
  }));
  const t = $(".pw-toggle");
  if (t) t.onclick = () => {
    const i = $("#authForm").password;
    i.type = i.type === "password" ? "text" : "password";
    t.textContent = i.type === "password" ? "Show" : "Hide";
  };
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = $("#authError");
    const mode = state.authMode || "signup";
    const email = f.email.value.trim();
    const password = f.password?.value || "";
    err.hidden = true;
    if (!/^\S+@\S+\.\S+$/.test(email)) return showErr("Enter your email address.");
    if (mode !== "forgot" && password.length < 8) return showErr(mode === "signup" ? "Use at least 8 characters for your password." : "Enter your password.");
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      if (mode === "forgot") {
        await state.api.recover(email, location.href.split("#")[0]);
        state.authMode = "signin";
        render();
        toast("If that email has an account, a reset link is on its way. Check your inbox.", { sticky: true });
        return;
      }
      if (mode === "signup") {
        const { confirmed } = await state.api.signUp(email, password);
        if (!confirmed) {
          state.authMode = "signin";
          state.authEmail = email;
          render();
          toast("Check your email and tap the confirmation link, then sign in.", { sticky: true });
          return;
        }
      } else {
        await state.api.signIn(email, password);
      }
      hideToast();
      await enterGarden();
    } catch (ex) {
      showErr(ex.message);
    } finally {
      btn.disabled = false;
    }
    function showErr(m) { err.textContent = m; err.hidden = false; }
  };
}

/* ---------- setup walkthrough ---------- */
function startSetup() {
  state.setup = {
    step: 1,
    location: state.garden?.location || "",
    picks: new Set(),
    custom: [],
    asIs: true,
    jobs: [],
    running: false,
  };
  loadStarter().then(() => state.screen === "setup" && render());
  setScreen("setup");
}

const STEPS = ["Location", "Plants", "Build", "Calendar"];

function setupView() {
  const s = state.setup;
  const steps = `<ol class="stepper" aria-label="Setup progress">${STEPS.map((n, i) => `<li class="${i + 1 < s.step ? "done" : i + 1 === s.step ? "current" : ""}" ${i + 1 === s.step ? 'aria-current="step"' : ""}><span>${i + 1 < s.step ? icon.check : i + 1}</span>${n}</li>`).join("")}</ol>`;
  return `<div class="narrow setup">${steps}${[stepLocation, stepPlants, stepBuild, stepCalendar][s.step - 1]()}</div>`;
}

function stepLocation() {
  const s = state.setup;
  return `<h1>Where is your garden?</h1>
    <p class="lead">Guides, local tips and reminder dates are written for your climate, frosts, soil and seasons.</p>
    <form id="locForm" class="card form">
      <label>Town or suburb, state and country
        <input name="location" required maxlength="120" autocomplete="off" value="${esc(s.location)}" placeholder="e.g. Umina Beach, NSW, Australia">
      </label>
      <button type="button" class="btn btn-sm" id="geoBtn">${icon.pin}Use my current location</button>
      <div class="wizard-nav"><span></span><button class="btn btn-primary" type="submit">Next</button></div>
    </form>
    <p class="hint">Signed in as ${esc(state.api.user?.email || "")}. <button type="button" class="link-btn inline" id="setupSignOut">Not you? Sign out</button></p>`;
}

function stepPlants() {
  const s = state.setup;
  const starter = state.starter?.plants || [];
  const groups = [...new Set(starter.map((p) => p.group || OTHER))];
  const near = STARTER_PLACE.test(s.location);
  const picked = starter.filter((p) => s.picks.has(p.slug));
  const toWrite = state.ai ? (s.asIs && near ? 0 : picked.length) + s.custom.length : 0;
  return `<h1>What are you growing?</h1>
    <p class="lead">Tick plants from the starter list and add any others by name. You can add, remove and group plants any time later.</p>
    <div class="card">
      <div class="row-between"><h3>Starter plants</h3><button type="button" class="link-btn" id="pickAll">${picked.length === starter.length && starter.length ? "Clear all" : "Select all"}</button></div>
      ${starter.length ? groups.map((g) => `
        <fieldset class="pick-group"><legend>${esc(g)}</legend>
          ${starter.filter((p) => (p.group || OTHER) === g).map((p) => `
            <label class="check pick"><input type="checkbox" value="${esc(p.slug)}" ${s.picks.has(p.slug) ? "checked" : ""}><span>${esc(p.name)}</span></label>`).join("")}
        </fieldset>`).join("") : '<p class="muted">Loading…</p>'}
      ${!state.ai && picked.length ? `<p class="hint">${near ? "These ready-made guides were written for your area." : `These ready-made guides were written for the ${STARTER_LABEL}. Open a plant and tap Edit guide to adjust it for ${esc(labelFor(s.location))}.`}</p>` : ""}
      ${state.ai && picked.length && near ? `<label class="check asis"><input type="checkbox" id="asIs" ${s.asIs ? "checked" : ""}><span>Use the ready-made ${STARTER_LABEL} guides as they are <span class="muted">(instant, no cost)</span></span></label>` : ""}
      ${state.ai && picked.length && !near ? `<p class="hint">Starter guides were written for the ${STARTER_LABEL}, so these will be rewritten for ${esc(labelFor(s.location))}.</p>` : ""}
    </div>
    <div class="card">
      <h3>Add your own</h3>
      ${state.ai ? "" : '<p class="hint">Each one starts as a blank guide that you can fill in or paste into with Edit guide.</p>'}
      <form id="customForm" class="add-row">
        <input name="name" maxlength="80" autocomplete="off" placeholder="e.g. Cherry tomato" aria-label="Plant name">
        <button class="btn" type="submit">Add</button>
      </form>
      <ul class="chips">${s.custom.map((n, i) => `<li class="chip-item">${esc(n)}<button type="button" data-rm="${i}" aria-label="Remove ${esc(n)}">${icon.x}</button></li>`).join("")}</ul>
    </div>
    <p class="summary">${picked.length + s.custom.length} plant${picked.length + s.custom.length === 1 ? "" : "s"} selected${toWrite ? ` · ${toWrite} guide${toWrite === 1 ? "" : "s"} for Claude to write, about ${Math.max(1, Math.round(toWrite * 0.5))} min` : !state.ai && s.custom.length ? ` · ${s.custom.length} blank guide${s.custom.length === 1 ? "" : "s"} for you to fill in` : ""}</p>
    <div class="wizard-nav"><button class="btn" id="back">Back</button><button class="btn btn-primary" id="next">${picked.length + s.custom.length ? "Build my garden" : "Skip for now"}</button></div>`;
}

function stepBuild() {
  const s = state.setup;
  const done = !s.running;
  const failed = s.jobs.filter((j) => j.status === "failed").length;
  const statusIcon = (j) => j.status === "done" ? `<span class="st ok">${icon.check}</span>` : j.status === "failed" ? `<span class="st bad">${icon.x}</span>` : j.status === "working" ? '<span class="st"><span class="spinner"></span></span>' : '<span class="st wait"></span>';
  return `<h1>${done ? (failed ? "Nearly done" : "Your garden is ready") : "Building your garden…"}</h1>
    <p class="lead">${done ? (failed ? "Some guides couldn't be written. You can try them again now, or add them later with Add plant." : "Every guide is in place.") : "Keep this page open. Each new guide takes about half a minute."}</p>
    <ul class="jobs card">${s.jobs.map((j) => `<li>${statusIcon(j)}<span><b>${esc(j.label)}</b>${j.note ? `<span class="muted"> · ${esc(j.note)}</span>` : ""}</span></li>`).join("")}</ul>
    <div class="wizard-nav"><span>${done && failed ? '<button class="btn" id="retry">Try failed again</button>' : ""}</span><button class="btn btn-primary" id="next" ${done ? "" : "disabled"}>Next</button></div>`;
}

function stepCalendar() {
  const feed = state.api.feedUrl(state.garden.feed_token);
  const webcal = feed.replace(/^https?:/, "webcal:");
  return `<h1>Get reminders in your calendar</h1>
    <p class="lead">Each plant's care jobs (pruning, feeding, pollinating, harvest) go into one calendar feed at 6pm local time. Subscribe once; plants you add or remove later update it automatically.</p>
    <div class="card">
      <a class="btn btn-primary btn-block" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">${icon.cal}Subscribe in Google Calendar</a>
      <a class="btn btn-block" href="${esc(webcal)}">Open in my calendar app</a>
      <div class="feed-url"><input readonly value="${esc(feed)}" aria-label="Calendar feed address"><button class="btn btn-sm" id="copyFeed">Copy</button></div>
      <p class="hint">On Android, subscribe in Google Calendar and it appears in your phone's calendar. New reminders can take a few hours to show up.</p>
    </div>
    <div class="wizard-nav"><button class="btn" id="back">Back</button><button class="btn btn-primary" id="finish">Finish</button></div>`;
}

function bindSetup() {
  const s = state.setup;
  const back = $("#back");
  if (back) back.onclick = () => { s.step = s.step === 4 ? (s.jobs.length ? 3 : 2) : s.step - 1; render(); };
  if (s.step === 1) {
    const f = $("#locForm");
    $("#geoBtn").onclick = () => reverseGeocode($("#geoBtn"), f.location);
    $("#setupSignOut").onclick = () => state.api.signOut();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const loc = f.location.value.trim();
      if (!loc) return f.location.focus();
      const btn = f.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        state.garden = await state.api.saveGarden({ location: loc, label: labelFor(loc), timezone: timezone() });
        s.location = loc;
        s.asIs = STARTER_PLACE.test(loc);
        s.step = 2;
        render();
      } catch (ex) { toast(esc(ex.message), { sticky: true }); } finally { btn.disabled = false; }
    };
  }
  if (s.step === 2) {
    document.querySelectorAll(".pick input").forEach((c) => (c.onchange = () => { c.checked ? s.picks.add(c.value) : s.picks.delete(c.value); render(); }));
    $("#pickAll").onclick = () => {
      const all = state.starter.plants.map((p) => p.slug);
      if (s.picks.size === all.length) s.picks.clear(); else all.forEach((x) => s.picks.add(x));
      render();
    };
    const asIs = $("#asIs");
    if (asIs) asIs.onchange = () => { s.asIs = asIs.checked; render(); };
    $("#customForm").onsubmit = (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim().slice(0, 80);
      if (name && !s.custom.some((n) => n.toLowerCase() === name.toLowerCase())) s.custom.push(name);
      render();
      $("#customForm").name.focus();
    };
    document.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { s.custom.splice(Number(b.dataset.rm), 1); render(); }));
    $("#next").onclick = () => {
      if (!s.picks.size && !s.custom.length) { s.jobs = []; s.step = 4; render(); return; }
      s.step = 3;
      buildGarden();
    };
  }
  if (s.step === 3) {
    $("#next").onclick = () => { s.step = 4; render(); };
    const retry = $("#retry");
    if (retry) retry.onclick = () => buildGarden(true);
  }
  if (s.step === 4) {
    $("#copyFeed").onclick = () => copyFeed();
    $("#finish").onclick = async () => {
      try {
        state.garden = await state.api.saveGarden({ setup_done: true });
        location.hash = "#/";
        setScreen("app");
        toast("Welcome to your garden.");
      } catch (ex) { toast(esc(ex.message), { sticky: true }); }
    };
  }
}

// Runs the setup jobs: local tips, ready-made imports, then one Claude guide at a time.
async function buildGarden(retryOnly = false) {
  const s = state.setup;
  const near = STARTER_PLACE.test(s.location);
  const picked = state.starter.plants.filter((p) => s.picks.has(p.slug));
  const existing = new Set(state.plants.map((p) => p.slug));
  if (!retryOnly) {
    const asIs = !state.ai || (near && s.asIs);
    const tips = near ? "overview-copy" : state.ai ? "overview" : null;
    s.jobs = [
      ...(tips ? [{ kind: tips, label: `Local tips for ${labelFor(s.location)}` }] : []),
      ...(asIs && picked.length ? [{ kind: "import", label: `${picked.length} ready-made guide${picked.length === 1 ? "" : "s"}`, plants: picked }] : []),
      ...(asIs ? [] : picked.map((p) => ({ kind: "add", label: p.name, name: p.name, group: p.group }))),
      ...s.custom.map((n) => ({ kind: state.ai ? "add" : "blank", label: n, name: n, group: OTHER })),
    ].filter((j) => !["add", "blank"].includes(j.kind) || !existing.has(slugify(j.name)));
    s.jobs.forEach((j) => (j.status = "waiting"));
  }
  s.running = true;
  render();
  let limitHit = false;
  for (const j of s.jobs) {
    if (j.status === "done" || (retryOnly && j.status !== "failed")) continue;
    if (limitHit && j.kind !== "import" && j.kind !== "overview-copy") { j.status = "failed"; j.note = "daily limit reached"; continue; }
    j.status = "working";
    j.note = "";
    render();
    try {
      if (j.kind === "overview-copy") state.garden = await state.api.saveGarden({ overview: state.starter.overview });
      else if (j.kind === "overview") await state.api.fn("overview");
      else if (j.kind === "import") await state.api.fn("import", { plants: j.plants });
      else if (j.kind === "blank") await state.api.insertPlant(blankPlant(j.name, j.group));
      else await state.api.fn("add", { name: j.name, group: j.group });
      j.status = "done";
    } catch (ex) {
      j.status = "failed";
      j.note = ex.status === 409 ? "already in your garden" : ex.message;
      if (ex.status === 409) j.status = "done";
      if (ex.status === 429) limitHit = true;
      if (ex.status === 401) { s.running = false; return; }
    }
    render();
  }
  s.running = false;
  await reloadGarden().catch(() => {});
  render();
}

/* ---------- main app ---------- */
function groups() {
  const map = new Map();
  for (const p of state.plants) {
    const g = p.group || OTHER;
    if (!map.has(g)) map.set(g, []);
    map.get(g).push(p);
  }
  if (state.busy?.adding) {
    const g = state.busy.group || OTHER;
    if (!map.has(g)) map.set(g, []);
    map.get(g).push({ slug: null, name: state.busy.adding, pending: true });
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === OTHER) - (b === OTHER) || a.localeCompare(b))
    .map(([name, items]) => [name, items.sort((a, b) => a.name.localeCompare(b.name))]);
}
const groupNames = () => [...new Set([...state.plants.map((p) => p.group || OTHER), "Chillies", "Kitchen herbs", "Medicinal herbs", "Vegetables", "Fruit", "Flowers", OTHER])].sort();

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
  if (!state.plants.length && !state.busy?.adding) html += `<p class="muted nav-empty">No plants yet. Tap Add plant.</p>`;
  $("#sidebar").innerHTML = html;
}

const kv = (pairs) =>
  `<ul class="kv">${pairs.map(([k, v]) => `<li class="${/^n\/?a$/i.test(String(v).trim()) ? "na" : /caution/i.test(k) ? "caution" : ""}"><b>${esc(k)}</b><span>${esc(v)}</span></li>`).join("")}</ul>`;

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
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, opts);
}

// Pet and people safety notes for the top of a plant page.
function cautionsFor(p) {
  if (Array.isArray(p.cautions) && p.cautions.length) return p.cautions.filter((c) => c && c.text);
  return [...(p.growing || []), ...(p.uses || [])]
    .filter(([k, v]) => /^(caution|pets?|warning|safety)$/i.test(k) && !/^n\/?a$/i.test(String(v).trim()))
    .map(([k, v]) => ({ who: /pet/i.test(k) ? "Pets" : "Caution", text: v }));
}

function cautionBox(list) {
  if (!list.length) return `<aside class="cautions none" aria-label="Safety"><h2>Safety</h2><p>N/A</p></aside>`;
  const ic = (who) => /pet/i.test(who)
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="10" r="2"/><circle cx="9.5" cy="5.5" r="2"/><circle cx="14.5" cy="5.5" r="2"/><circle cx="18.5" cy="10" r="2"/><path d="M12 12c-3 0-5.5 3.5-5.5 6 0 1.5 1.2 2 2.5 2 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.3 0 2.5-.5 2.5-2 0-2.5-2.5-6-5.5-6z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>';
  return `<aside class="cautions" aria-label="Safety">
    <h2>Safety</h2>
    <ul>${list.map((c) => `<li>${ic(c.who)}<span><b>${esc(c.who || "Caution")}:</b> ${esc(c.text)}</span></li>`).join("")}</ul>
  </aside>`;
}

function plantView(p) {
  const g = p.glance || {};
  const glance = [["Sun", g.sun], ["Water", g.water], ["Spacing", g.spacing], ["Pot size", g.pot], ["Indoors", g.indoors]]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v || "N/A")}</dd></div>`).join("");
  const tasks = (p.tasks || []).slice().sort((a, b) => a.start.localeCompare(b.start));
  const busyHere = state.busy?.slug === p.slug;
  return `
    ${busyHere ? `<div class="pending-banner">${esc(state.busy.label)}…</div>` : ""}
    <div class="eyebrow">
      <button class="chip" id="groupChip" title="Change group">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h7l2 2h9v10H3z"/></svg>${esc(p.group || OTHER)}
      </button>
      ${p.calendar !== false && tasks.length ? `<span class="chip">In calendar feed</span>` : ""}
    </div>
    <h1>${esc(p.name)}</h1>
    <p class="botanical">${esc(p.botanical || "N/A")}</p>
    ${cautionBox(cautionsFor(p))}
    <p class="lead">${esc(p.summary || "N/A")}</p>
    <dl class="glance">${glance}</dl>
    <h2>Growing</h2>${kv(p.growing || [])}
    <h2>Harvest</h2><p>${esc(p.harvest || "N/A")}</p>
    <h2>Uses</h2>${kv(p.uses || [])}
    <h2>Calendar reminders</h2>
    ${tasks.length ? `
      <div class="card">
        <ul class="tasks">${tasks.map((t) => `
          <li><span class="task-date">${esc(fmtDate(t.start, { day: "numeric", month: "short" }))}</span>
          <span><b>${esc(t.title)}</b>${t.rrule ? `<div class="task-repeat">${esc(describeRrule(t.rrule))}</div>` : ""}${t.notes ? `<div class="muted">${esc(t.notes)}</div>` : ""}</span></li>`).join("")}
        </ul>
      </div>` : `<p class="muted">N/A${p.calendar === false ? ". This plant's reminders were added straight to your phone calendar; see Care schedule below." : (state.ai ? ". Tap Rewrite guide, or add reminders with Edit guide." : ". Add reminders with Edit guide.")}</p>`}
    <h2>Care schedule</h2><p>${esc(p.reminders || "N/A")}</p>
    <div class="page-actions">
      ${tasks.length ? `<button class="btn" id="icsBtn">${icon.cal}Download reminders</button>` : ""}
      <button class="btn" id="regroupBtn">Change group</button>
      <a class="btn" href="#/plant/${p.slug}/edit">Edit guide</a>
      ${state.ai ? `<button class="btn" id="rewriteBtn" ${state.busy ? "disabled" : ""}>Rewrite guide</button>` : ""}
      <button class="btn btn-danger" id="removeBtn">Remove plant</button>
    </div>
    ${p.updated || p.added ? `<p class="hint">Written for ${esc(state.garden?.label || "your location")}${p.updated ? `, updated ${esc(fmtDate(p.updated))}` : ""}.</p>` : ""}`;
}

/* ---------- blank guides and the edit form ---------- */
function blankPlant(name, group = OTHER) {
  return {
    slug: slugify(name), name: name.slice(0, 60), group: group || OTHER, botanical: "", summary: "", cautions: [],
    glance: {}, growing: [], harvest: "", uses: [], reminders: "", calendar: true, tasks: [],
    added: localToday(state.garden?.timezone), manual: true,
  };
}

const isNA = (v) => /^\s*(n\/?a)?\s*$/i.test(String(v ?? ""));
const val = (v) => (isNA(v) ? "" : String(v));
const REPEATS = [["", "Once"], ["FREQ=WEEKLY", "Every week"], ["FREQ=WEEKLY;INTERVAL=2", "Every 2 weeks"], ["FREQ=MONTHLY", "Every month"], ["FREQ=YEARLY", "Every year"]];

function repeatOf(rrule) {
  if (!rrule) return { base: "", until: "", custom: "" };
  const o = Object.fromEntries(rrule.split(";").map((x) => x.split("=")));
  const base = o.FREQ === "WEEKLY" ? (Number(o.INTERVAL) === 2 ? "FREQ=WEEKLY;INTERVAL=2" : "FREQ=WEEKLY") : `FREQ=${o.FREQ}`;
  const known = REPEATS.some(([v]) => v === base) && !o.COUNT && (!o.INTERVAL || base.includes("INTERVAL")) && Object.keys(o).every((k) => ["FREQ", "INTERVAL", "BYDAY", "UNTIL"].includes(k));
  const u = o.UNTIL || "";
  return known ? { base, until: u ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : "", custom: "" } : { base: "custom", until: "", custom: rrule };
}

function taskRow(t = {}, i) {
  const r = repeatOf(t.rrule);
  return `<fieldset class="task-edit" data-i="${i}">
    <div class="task-edit-head"><input name="t-title" maxlength="80" placeholder="e.g. Feed with tomato food" value="${esc(t.title || "")}" aria-label="Reminder"><button type="button" class="icon-btn small" data-rm-task aria-label="Remove reminder">${icon.x}</button></div>
    <div class="task-edit-grid">
      <label>Date<input type="date" name="t-start" value="${esc(t.start || "")}"></label>
      <label>Repeat<select name="t-repeat">${REPEATS.map(([v, l]) => `<option value="${v}" ${r.base === v ? "selected" : ""}>${l}</option>`).join("")}${r.custom ? `<option value="custom" selected>As written by Claude</option>` : ""}</select></label>
      <label>Until<input type="date" name="t-until" value="${esc(r.until)}"></label>
    </div>
    <input type="hidden" name="t-custom" value="${esc(r.custom)}">
    <label>Notes<input name="t-notes" maxlength="500" value="${esc(t.notes || "")}" placeholder="What to do"></label>
  </fieldset>`;
}

function editView(p) {
  const sets = fieldSets(state.plants);
  const g = p.glance || {};
  const pet = (p.cautions || []).find((c) => c.who === "Pets")?.text || "";
  const ppl = (p.cautions || []).filter((c) => c.who !== "Pets").map((c) => c.text).join(" ");
  const map = (list) => new Map((list || []).map(([k, v]) => [k.toLowerCase(), v]));
  const gm = map(p.growing);
  const um = map(p.uses);
  const area = (name, label, v, rows = 2) => `<label>${esc(label)}<textarea name="${name}" rows="${rows}" placeholder="N/A">${esc(val(v))}</textarea></label>`;
  return `<form id="editForm" class="edit">
    <h1>Edit ${esc(p.name)}</h1>
    <p class="hint">Fill in what you know or paste text into any section. Anything left blank shows N/A.</p>
    <label>Plant name<input name="name" required maxlength="60" value="${esc(p.name)}"></label>
    <label>Botanical name<input name="botanical" maxlength="80" value="${esc(val(p.botanical))}" placeholder="N/A"></label>
    ${area("summary", "Summary", p.summary, 3)}
    <h2>Safety</h2>
    ${area("pets", "Pets", pet)}
    ${area("people", "People", ppl)}
    <h2>At a glance</h2>
    <div class="glance-edit">${[["sun", "Sun"], ["water", "Water"], ["spacing", "Spacing"], ["pot", "Pot size"], ["indoors", "Indoors"]].map(([k, l]) => `<label>${l}<input name="glance-${k}" maxlength="80" value="${esc(val(g[k]))}" placeholder="N/A"></label>`).join("")}</div>
    <h2>Growing</h2>
    ${sets.growing.map((h) => area(`growing-${h}`, h, gm.get(h.toLowerCase()))).join("")}
    <h2>Harvest</h2>
    ${area("harvest", "Harvest", p.harvest, 3)}
    <h2>Uses</h2>
    ${sets.uses.map((h) => area(`uses-${h}`, h, um.get(h.toLowerCase()))).join("")}
    <h2>Care schedule</h2>
    ${area("reminders", "Summary of care", p.reminders)}
    <h2>Calendar reminders</h2>
    <p class="hint">Reminders appear in your calendar feed at 6pm on the day.</p>
    <div id="taskList">${(p.tasks || []).map(taskRow).join("")}</div>
    <button type="button" class="btn btn-sm" id="addTask">+ Add reminder</button>
    <div class="edit-actions"><a class="btn" href="#/plant/${p.slug}">Cancel</a><button class="btn btn-primary" type="submit">Save guide</button></div>
  </form>`;
}

function bindEdit(p) {
  const f = $("#editForm");
  let dirty = false;
  f.oninput = () => (dirty = true);
  const bindRows = () => document.querySelectorAll("[data-rm-task]").forEach((b) => (b.onclick = () => { b.closest(".task-edit").remove(); dirty = true; }));
  bindRows();
  $("#addTask").onclick = () => {
    $("#taskList").insertAdjacentHTML("beforeend", taskRow({ start: localToday(state.garden?.timezone) }, Date.now()));
    bindRows();
    $("#taskList").lastElementChild.querySelector("input").focus();
  };
  f.querySelectorAll('a[href^="#/plant/"]').forEach((a) => (a.onclick = (e) => { if (dirty && !confirm("Leave without saving your changes?")) e.preventDefault(); }));
  f.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const get = (k) => String(fd.get(k) ?? "").trim();
    const sets = fieldSets(state.plants);
    const tasks = [...f.querySelectorAll(".task-edit")].map((row) => {
      const q = (n) => row.querySelector(`[name="${n}"]`).value.trim();
      const start = q("t-start");
      const rep = q("t-repeat");
      let rrule = rep === "custom" ? q("t-custom") : rep;
      if (rrule && rep !== "custom") {
        if (rrule.startsWith("FREQ=WEEKLY") && start) rrule += `;BYDAY=${["SU", "MO", "TU", "WE", "TH", "FR", "SA"][new Date(`${start}T12:00:00`).getDay()]}`;
        if (q("t-until")) rrule += `;UNTIL=${q("t-until").replace(/-/g, "")}`;
      }
      return { title: q("t-title"), notes: q("t-notes"), start, rrule };
    }).filter((t) => t.title && /^\d{4}-\d{2}-\d{2}$/.test(t.start));
    const cautions = [["Pets", get("pets")], ["People", get("people")]].filter(([, t]) => t && !isNA(t)).map(([who, text]) => ({ who, text }));
    const updated = {
      ...p,
      name: get("name") || p.name,
      botanical: get("botanical"),
      summary: get("summary"),
      cautions,
      glance: Object.fromEntries(["sun", "water", "spacing", "pot", "indoors"].map((k) => [k, get(`glance-${k}`)])),
      growing: sets.growing.map((h) => [h, get(`growing-${h}`)]),
      harvest: get("harvest"),
      uses: sets.uses.map((h) => [h, get(`uses-${h}`)]),
      reminders: get("reminders"),
      tasks,
      calendar: tasks.length ? true : p.calendar,
      updated: localToday(state.garden?.timezone),
    };
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await state.api.updatePlant(updated);
      await reloadGarden();
      dirty = false;
      location.hash = `#/plant/${p.slug}`;
      toast(`${esc(updated.name)} saved.`);
    } catch (ex) {
      toast(esc(ex.message), { sticky: true });
    } finally {
      btn.disabled = false;
    }
  };
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
  const rw = $("#rewriteBtn");
  if (rw) rw.onclick = () => runBusy({ slug: p.slug, label: `Rewriting ${p.name} for ${state.garden.label}` }, async () => {
    await state.api.fn("rewrite", { slug: p.slug });
    await reloadGarden();
    toast(`${esc(p.name)} rewritten.`);
  });
  $("#removeBtn").onclick = () => {
    $("#removePlantName").textContent = p.name;
    $("#removeNote").textContent = p.calendar === false
      ? "Its guide will be deleted. Reminders added straight to your phone calendar earlier stay there; delete those in your calendar app."
      : "Its guide and its reminders in your calendar feed will be deleted.";
    $("#removeForm").dataset.slug = p.slug;
    $("#removeDialog").showModal();
  };
  const ics = $("#icsBtn");
  if (ics) ics.onclick = () => download(`${p.slug}-reminders.ics`, buildCalendar([p], { name: `${p.name} reminders`, onlyCalendar: false, timezone: state.garden?.timezone }));
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyFeed() {
  const url = state.api.feedUrl(state.garden.feed_token);
  try { await navigator.clipboard.writeText(url); toast("Calendar address copied."); }
  catch { const i = $(".feed-url input"); i.focus(); i.select(); }
}

function overviewView() {
  const all = state.plants;
  const row = (p) => {
    const g = p.glance || {};
    return `<tr><td><a href="#/plant/${p.slug}">${esc(p.name)}</a></td><td>${esc(g.sun)}</td><td>${esc(g.water)}</td><td>${esc(g.spacing)}</td><td>${esc(g.indoors)}</td></tr>`;
  };
  const feed = state.api.feedUrl(state.garden.feed_token);
  const webcal = feed.replace(/^https?:/, "webcal:");
  const feedCount = all.filter((p) => p.calendar !== false && p.tasks?.length).length;
  const groupCount = new Set(all.map((p) => p.group || OTHER)).size;
  return `
    <h1>Your garden</h1>
    <p class="lead">${all.length} plant${all.length === 1 ? "" : "s"} in ${groupCount} group${groupCount === 1 ? "" : "s"}, with guides written for your conditions.</p>

    <div class="card location-row">
      <p>Guides are written for <b>${esc(state.garden.location)}</b>.</p>
      <button class="btn btn-sm" id="locationBtn" ${state.busy ? "disabled" : ""}>${icon.pin}Change location</button>
    </div>

    <div class="card">
      <h3>Calendar reminders</h3>
      <p>Your plants' care jobs go into one calendar feed; plants you add or remove update it automatically. ${feedCount ? `${feedCount} plant${feedCount > 1 ? "s are" : " is"} in the feed now.` : "It fills as you add plants."}</p>
      <div class="feed-url"><input readonly value="${esc(feed)}" aria-label="Calendar feed address"><button class="btn btn-sm" id="copyFeed">Copy</button></div>
      <p><a href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}" target="_blank" rel="noopener">Subscribe in Google Calendar</a> · <a href="${esc(webcal)}">Open in calendar app</a></p>
      <p class="hint">Subscribed calendars refresh every few hours.${all.some((p) => p.calendar === false) ? " Plants whose reminders were added straight to your phone calendar aren't repeated in the feed." : ""}</p>
    </div>

    ${all.length ? `<h2>At a glance</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Plant</th><th>Sun</th><th>Water</th><th>Spacing</th><th>Indoors</th></tr></thead>
      <tbody>${groups().flatMap(([, items]) => items).filter((p) => !p.pending).map(row).join("")}</tbody>
    </table></div>` : `<div class="card empty"><p>No plants yet.</p><button class="btn btn-primary" id="emptyAdd">Add your first plant</button></div>`}
    <div class="prose">${markdown(state.garden.overview || "")}</div>`;
}

function bindOverview() {
  $("#locationBtn").onclick = openLocation;
  $("#copyFeed").onclick = copyFeed;
  const e = $("#emptyAdd");
  if (e) e.onclick = openAdd;
}

// Small markdown renderer for the overview tips: headings, lists, bold, paragraphs.
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

/* ---------- long jobs ---------- */
async function runBusy(busy, fn) {
  if (state.busy) return toast("Please wait for the current update to finish.");
  state.busy = busy;
  render();
  toast(`${esc(busy.label)}…`, { busy: true });
  try {
    await fn((label) => { state.busy.label = label; toast(`${esc(label)}…`, { busy: true }); });
    if (!$("#status").hidden && $("#status .spinner")) hideToast();
  } catch (ex) {
    toast(esc(ex.message), { sticky: true });
  } finally {
    state.busy = null;
    render();
  }
}

/* ---------- dialogs ---------- */
function openAdd() {
  $("#addForm").reset();
  $("#addIntro").textContent = state.ai
    ? "Type a plant's name. Claude writes a guide for your location, adds it to your garden, and puts its care reminders in your calendar feed. Takes about half a minute."
    : "Type a plant's name. It's added as a blank guide that you can fill in, or paste a guide into, section by section.";
  $("#addDialog").showModal();
}

function openLocation() {
  const f = $("#locationForm");
  f.location.value = state.garden.location;
  f.regenerate.checked = true;
  $("#plantCount").textContent = state.plants.length;
  $("#aiOptions").hidden = !state.ai;
  $("#noAiNote").hidden = state.ai;
  $("#locationDialog").showModal();
}

function openAccount(msg) {
  $("#accountEmail").textContent = state.api.user?.email || "";
  $("#passwordForm").reset();
  $("#accountDialog").showModal();
  if (msg) { toast(esc(msg), { sticky: true }); $("#passwordForm").password.focus(); }
}

document.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => b.closest("dialog").close()));
$("#addBtn").onclick = openAdd;
$("#accountBtn").onclick = () => (state.screen === "app" ? openAccount() : null);
$("#geoBtn2").onclick = () => reverseGeocode($("#geoBtn2"), $("#locationForm").location);

$("#addForm").onsubmit = async (e) => {
  const f = e.target;
  const name = f.plant.value.trim();
  const group = f.group.value.trim() || OTHER;
  if (!name) return;
  if (state.plants.some((p) => p.name.toLowerCase() === name.toLowerCase() || p.slug === slugify(name))) {
    e.preventDefault();
    return toast(`${esc(name)} is already in your garden.`);
  }
  if (!state.ai) {
    try {
      const p = blankPlant(name, group);
      await state.api.insertPlant(p);
      await reloadGarden();
      location.hash = `#/plant/${p.slug}/edit`;
      toast(`${esc(name)} added. Fill in what you know; anything left blank shows N/A.`);
    } catch (ex) { toast(esc(ex.status === 409 ? `${name} is already in your garden.` : ex.message), { sticky: true }); }
    return;
  }
  await runBusy({ adding: name, group, label: `Writing a guide for ${name}` }, async () => {
    const { plant } = await state.api.fn("add", { name, group });
    await reloadGarden();
    const n = plant.tasks?.length || 0;
    toast(`${esc(plant.name)} added${n ? `, with ${n} reminder${n === 1 ? "" : "s"} in your calendar feed` : ""}.`);
    location.hash = `#/plant/${plant.slug}`;
  });
};

$("#groupForm").onsubmit = async (e) => {
  const slug = e.target.dataset.slug;
  const group = e.target.group.value.trim().slice(0, 40);
  const p = state.plants.find((x) => x.slug === slug);
  if (!p || !group || group === p.group) return;
  const old = p.group;
  p.group = group;
  render();
  try {
    await state.api.updatePlant({ ...p });
    toast(`${esc(p.name)} moved to ${esc(group)}.`);
  } catch (ex) {
    p.group = old;
    render();
    toast(esc(ex.message), { sticky: true });
  }
};

$("#removeForm").onsubmit = async (e) => {
  const slug = e.target.dataset.slug;
  const p = state.plants.find((x) => x.slug === slug);
  if (!p) return;
  try {
    await state.api.deletePlant(slug);
    state.plants = state.plants.filter((x) => x !== p);
    location.hash = "#/";
    render();
    toast(`${esc(p.name)} removed.`);
  } catch (ex) { toast(esc(ex.message), { sticky: true }); }
};

$("#locationForm").onsubmit = async (e) => {
  const f = e.target;
  const loc = f.location.value.trim();
  if (!loc || loc === state.garden.location) return;
  const regenerate = state.ai && f.regenerate.checked;
  if (!state.ai) {
    try {
      state.garden = await state.api.saveGarden({ location: loc, label: labelFor(loc), timezone: timezone() });
      render();
      toast(`Your garden is set to ${esc(state.garden.location)}. Guides stay as they are; use Edit guide to adjust them.`, { sticky: true });
    } catch (ex) { toast(esc(ex.message), { sticky: true }); }
    return;
  }
  await runBusy({ label: `Updating tips for ${labelFor(loc)}` }, async (progress) => {
    state.garden = await state.api.saveGarden({ location: loc, label: labelFor(loc), timezone: timezone() });
    await state.api.fn("overview");
    const failed = [];
    if (regenerate) {
      const list = state.plants.slice();
      for (const [i, p] of list.entries()) {
        progress(`Rewriting ${p.name} (${i + 1} of ${list.length})`);
        try { await state.api.fn("rewrite", { slug: p.slug }); } catch (ex) {
          failed.push(p.name);
          if (ex.status === 429) { failed.push(...list.slice(i + 1).map((x) => x.name)); break; }
        }
      }
    }
    await reloadGarden();
    toast(`Your garden is set to ${esc(state.garden.location)}.${failed.length ? ` Not rewritten: ${esc(failed.join(", "))}. Open a plant and tap Rewrite guide to try again.` : regenerate ? " Every guide has been rewritten." : ""}`, { sticky: true });
  });
};

$("#passwordForm").onsubmit = async (e) => {
  e.preventDefault();
  const pw = e.target.password.value;
  if (pw.length < 8) return toast("Use at least 8 characters.");
  try {
    await state.api.setPassword(pw);
    e.target.reset();
    toast("Password changed.");
  } catch (ex) { toast(esc(ex.message), { sticky: true }); }
};
$("#signOutBtn").onclick = async () => {
  $("#accountDialog").close();
  await state.api.signOut();
  state.authMode = "signin";
  setScreen("auth");
};
$("#rerunSetup").onclick = () => { $("#accountDialog").close(); startSetup(); };
$("#deleteAccountBtn").onclick = () => { $("#accountDialog").close(); $("#deleteForm").reset(); $("#deleteDialog").showModal(); };
$("#deleteForm").onsubmit = async (e) => {
  if (e.target.confirm.value.trim().toUpperCase() !== "DELETE") { e.preventDefault(); return toast("Type DELETE to confirm."); }
  try {
    await state.api.fn("delete_account");
    await state.api.signOut();
    state.authMode = "signup";
    setScreen("auth");
    toast("Your account and garden have been deleted.", { sticky: true });
  } catch (ex) { toast(esc(ex.message), { sticky: true }); }
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

window.addEventListener("hashchange", () => {
  if (state.screen !== "app") return;
  render();
  $("#main").focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
window.addEventListener("beforeunload", (e) => {
  if (state.busy || state.setup?.running) { e.preventDefault(); e.returnValue = ""; }
});

document.body.dataset.screen = "loading";
boot().catch((e) => {
  $("#main").innerHTML = `<h1>Couldn't load the garden</h1><p class="muted">${esc(e.message)}</p>`;
});
