/* ui.js - shared interface helpers: icons, topbar, toast, caption/mic dock, sheets, formatting, receipts. */
(function () {
  const App = (window.App = window.App || {});

  const P = {
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    deposit: '<path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/>',
    withdraw: '<path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 20h14"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><path d="M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="13.5" r="1.1"/>',
    transfer: '<path d="M4 8h14m0 0l-3.5-3.5M18 8l-3.5 3.5M20 16H6m0 0l3.5-3.5M6 16l3.5 3.5"/>',
    loan: '<path d="M3 10l9-6 9 6M5 10v8m4-8v8m6-8v8m4-8v8M3 20h18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    alert: '<path d="M12 4l9 16H3L12 4z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4"/>',
    download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/>',
    signout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
    volume: '<path d="M4 10v4h4l5 4V6L8 10H4z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
    brand: '<path d="M5 10v4M9 6v12M13 9v6M17 4v16M21 11v2"/>',
  };
  App.icon = function (name, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || "") + "</svg>";
  };

  const ui = (App.ui = {});
  const $ = (sel, root) => (root || document).querySelector(sel);
  App.$ = $;
  App.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  App.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- formatting ---------- */
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ui.money = (n) => inr.format(Number(n) || 0);
  ui.date = function (iso, lang) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return String(iso);
    try {
      return new Intl.DateTimeFormat((lang || App.getLang()) + "-IN", { dateStyle: "medium", timeStyle: "short" }).format(d);
    } catch (e) { return d.toLocaleString(); }
  };
  ui.dateOnly = function (iso, lang) {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    try { return new Intl.DateTimeFormat((lang || App.getLang()) + "-IN", { dateStyle: "medium" }).format(d); } catch (e) { return d.toLocaleDateString(); }
  };
  ui.loanKey = function (nameOrKey) {
    const s = String(nameOrKey || "").toLowerCase();
    return ["personal", "home", "vehicle", "education", "gold", "business"].find((k) => s.startsWith(k)) || null;
  };
  ui.loanName = (nameOrKey) => { const k = ui.loanKey(nameOrKey); return k ? App.t("loan." + k) : nameOrKey; };

  ui.errMsg = function (err) {
    if (!err) return App.t("err.generic");
    const code = err.code || "generic";
    const d = err.data || {};
    const vars = Object.assign({}, d);
    ["due", "min", "max"].forEach((k) => { if (k in vars && code !== "LOAN_TENURE_RANGE") vars[k] = ui.money(vars[k]); });
    const key = "err." + code;
    const msg = App.t(key, vars);
    return msg === key ? App.t("err.generic") : msg;
  };

  /* ---------- toast ---------- */
  ui.toast = function (msg, kind) {
    let box = $(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast toast--" + (kind || "info");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), 5200);
  };

  /* ---------- caption + mic dock ---------- */
  let dock, capEl, micBtn, chip, capTimer;
  ui.mountMic = function () {
    if (dock) return;
    dock = document.createElement("div");
    dock.className = "mic-dock";
    dock.innerHTML = '<div class="caption" hidden aria-live="polite"></div>' +
      '<button class="chip-voice" type="button" hidden>' + App.icon("volume") + '<span></span></button>' +
      '<button class="mic" type="button" aria-pressed="false" hidden>' + App.icon("mic") + '</button>';
    document.body.appendChild(dock);
    capEl = $(".caption", dock); chip = $(".chip-voice", dock); micBtn = $(".mic", dock);
    $("span", chip).textContent = App.t("voice.tap");
    chip.addEventListener("click", () => { App.Voice.unlock(); chip.hidden = true; });
    if (App.Voice.supported()) {
      micBtn.hidden = false;
      micBtn.setAttribute("aria-label", App.t("voice.tapmic"));
      micBtn.title = App.t("voice.tapmic");
      micBtn.addEventListener("click", () => App.Voice.setMic(!App.Voice.wanted));
    }
    App.Voice.onState = function () {
      if (!micBtn) return;
      micBtn.setAttribute("aria-pressed", App.Voice.wanted ? "true" : "false");
      if (App.Voice.unlocked && chip) chip.hidden = true;
    };
  };
  ui.caption = function (text, kind) {
    const sheetEl = document.querySelector(".sheet");
    if (sheetEl && kind === "say") {            // while a dialog is open, show what is being said inside it
      let say = sheetEl.querySelector(".say");
      if (!say) { say = document.createElement("div"); say.className = "say"; say.setAttribute("aria-live", "polite"); sheetEl.insertBefore(say, sheetEl.firstChild); }
      say.innerHTML = App.icon("volume") + "<span></span>";
      say.lastChild.textContent = text;
      if (capEl) capEl.hidden = true;
      return;
    }
    if (!capEl) return;
    capEl.textContent = text;
    capEl.dataset.kind = kind || "say";
    capEl.hidden = false;
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { capEl.hidden = true; }, kind === "heard" ? 6000 : Math.max(7000, text.length * 90));
  };
  ui.voiceChip = (show) => { if (chip) chip.hidden = !show; };
  let noted = false;
  ui.voiceNote = function (lang) {
    if (noted) return;                          // tell the user once per page, the text is always on screen
    noted = true;
    ui.toast(App.t("voice.unavail", { lang: App.NATIVE[lang] }, lang), "info");
  };

  /** Brand mark: indigo squircle, five voice bars, one marigold spark. */
  ui.logoMark = function () {
    return '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="20" fill="#0b5d4b"/><path d="M11.5 12.5 20 29l8.5-16.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 16.5a7 7 0 0 1 0 8" fill="none" stroke="#d9a84e" stroke-width="2.2" stroke-linecap="round"/></svg>';
  };

  /** Full-screen sign-in / sign-out animation. Resolves after `ms`. */
  ui.transition = function (kind, name, ms) {
    return new Promise((resolve) => {
      const v = document.createElement("div");
      v.className = "veil veil--" + kind;
      v.setAttribute("role", "status");
      const icon = kind === "in"
        ? '<svg class="veil__icon" viewBox="0 0 96 96" aria-hidden="true"><circle class="veil__ring" cx="48" cy="48" r="42"/><path class="veil__check" d="M29 50l14 14 25-30"/></svg>'
        : '<svg class="veil__icon" viewBox="0 0 96 96" aria-hidden="true"><circle class="veil__ring" cx="48" cy="48" r="42"/><path class="veil__shackle" d="M36 46V38a12 12 0 0 1 24 0v8"/><rect class="veil__lock" x="30" y="46" width="36" height="26" rx="7"/></svg>';
      v.innerHTML = '<div class="veil__inner">' + icon +
        '<h2 class="veil__title">' + App.esc(App.t("anim." + kind, { name: String(name || "").split(" ")[0] })) + "</h2>" +
        '<p class="veil__sub">' + App.esc(App.t("anim." + kind + ".sub")) + "</p>" +
        '<div class="veil__bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div>';
      document.body.appendChild(v);
      document.body.classList.add("sheet-open");
      setTimeout(resolve, ms || 1900);
    });
  };
  /** After a sign-in the next page starts covered and the cover lifts away. */
  ui.revealIfPending = function () {
    let flag = null;
    try { flag = sessionStorage.getItem("avb_veil"); sessionStorage.removeItem("avb_veil"); } catch (e) { /* ignore */ }
    if (flag !== "in") return;
    const v = document.createElement("div");
    v.className = "veil veil--in veil--reveal";
    document.body.appendChild(v);
    setTimeout(() => v.remove(), 900);
  };

  /* ---------- top bar ---------- */
  ui.mountTopbar = function (opts) {
    opts = opts || {};
    const host = $("#topbar");
    if (!host) return;
    host.className = "topbar";
    const lang = App.getLang();
    const seg = App.LANGS.map((l) => '<button type="button" data-l="' + l + '" aria-pressed="' + (l === lang) + '" lang="' + l + '">' + (l === "en" ? "EN" : l === "hi" ? "हिं" : "ಕ") + "</button>").join("");
    host.innerHTML =
      '<a class="brand" href="index.html" aria-label="' + App.esc(App.t("brand")) + '"><span class="brand__mark">' + ui.logoMark() + '</span><span class="brand__name">' + App.esc(App.t("brand.b").trim()) + "</span></a>" +
      '<div class="topbar__right">' + (opts.noLang ? "" : '<div class="seg" role="group" aria-label="Language">' + seg + "</div>") +
      (opts.signout && App.session.active() ? '<button class="iconbtn" type="button" id="btn-signout">' + App.icon("signout") + "<span>" + App.esc(App.t("signout")) + "</span></button>" : "") + "</div>";
    host.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
      if (b.dataset.l === App.getLang()) return;
      App.Voice.stopSpeaking();
      App.setLang(b.dataset.l, true);
    }));
    const so = $("#btn-signout", host);
    if (so) so.addEventListener("click", ui.signOut);
  };
  let leaving = false;
  ui.signOut = async function () {
    if (leaving) return;
    leaving = true;
    App.Voice.stopSpeaking();
    const name = (App.session.account() || {}).full_name;
    await ui.transition("out", name, 1700);
    App.session.clear();
    location.href = "index.html";
  };

  /** Pages that need a login. Returns false (and redirects) when there is none. */
  ui.requireAuth = function () {
    if (!App.session.active()) { location.replace("index.html"); return false; }
    return true;
  };

  /* ---------- buttons ---------- */
  ui.busy = async function (btn, fn) {
    if (btn.getAttribute("aria-busy") === "true") return;
    btn.setAttribute("aria-busy", "true"); btn.disabled = true;
    try { return await fn(); } finally { btn.removeAttribute("aria-busy"); btn.disabled = false; }
  };

  /* ---------- sheet (modal) ---------- */
  ui.sheet = function (html, opts) {
    opts = opts || {};
    const back = document.createElement("div");
    back.className = "backdrop";
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + "</div>";
    document.body.appendChild(back);
    document.body.classList.add("sheet-open");
    const prevFocus = document.activeElement;
    const api = {
      el: back.firstChild,
      close() { document.removeEventListener("keydown", onKey); back.remove(); if (!document.querySelector(".sheet")) document.body.classList.remove("sheet-open"); if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ } if (opts.onClose) opts.onClose(); },
      set(h) { api.el.innerHTML = h; },
    };
    function onKey(e) { if (e.key === "Escape" && opts.escape !== false) api.close(); }
    document.addEventListener("keydown", onKey);
    setTimeout(() => { const f = api.el.querySelector("input,button"); if (f) f.focus(); }, 60);
    return api;
  };

  /** Ask for the 4-digit PIN. run(pin) does the real request; a wrong PIN shows the error and lets the user retry.
      Resolves with run's result, or null if cancelled. */
  ui.pinSheet = function (opts) {
    return new Promise((resolve) => {
      let done = false;
      const E = App.esc;
      const s = ui.sheet(
        '<h2 class="sheet__title">' + E(App.t(opts.title)) + "</h2>" +
        '<label class="field"><span class="field__label">' + E(App.t("f.pin")) + '</span><input class="input input--pin" id="pn-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4"></label>' +
        '<span class="field__error" id="pn-err" role="alert"></span>' +
        '<div class="actions actions--row"><button class="btn btn--ghost" id="pn-cancel" type="button">' + E(App.t("cancel")) + '</button><button class="btn btn--primary" id="pn-ok" type="button">' + E(App.t("continue")) + "</button></div>",
        { escape: true, onClose: () => { App.Voice.stopSpeaking(); App.Voice.listen(opts.pageHandler || null, false); if (!done) resolve(null); } }
      );
      const pin = s.el.querySelector("#pn-pin"), err = s.el.querySelector("#pn-err"), ok = s.el.querySelector("#pn-ok");
      pin.addEventListener("input", () => { pin.value = pin.value.replace(/\D/g, "").slice(0, 4); err.textContent = ""; });
      async function submit() {
        if (!/^\d{4}$/.test(pin.value)) { err.textContent = App.t("tx.pinfirst"); return; }
        await ui.busy(ok, async () => {
          try { const r = await opts.run(pin.value); done = true; s.close(); resolve(r); }
          catch (e) { err.textContent = ui.errMsg(e); pin.value = ""; pin.focus(); App.Voice.speak(ui.errMsg(e)); }
        });
      }
      ok.addEventListener("click", submit);
      pin.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      s.el.querySelector("#pn-cancel").addEventListener("click", () => s.close());
      App.Voice.listen((text) => {
        if (App.Voice.is(text, "no") || App.Voice.is(text, "cmd.back")) { s.close(); return; }
        const d = App.Words.spokenDigits(text, App.getLang());
        if (/^\d{4}$/.test(d)) { pin.value = d; submit(); }
      }, true);
      App.Voice.speak(App.t(opts.title) + ".");
    });
  };

  /* ---------- receipt (downloadable, in the selected language) ---------- */
  ui.receiptHtml = function (result, lang) {
    lang = lang || App.getLang();
    const T = (k, v) => App.t(k, v, lang);
    const kind = result.kind;
    const rows = [];
    rows.push([T("r.date"), ui.date(result.timestamp, lang)]);
    rows.push([T("r.ref"), result.transaction_id]);
    if (kind === "transfer") {
      rows.push([T("r.from"), result.from_name + " (" + result.from_phone_masked + ")"]);
      rows.push([T("r.to"), result.to_name + " (" + result.to_phone_masked + ")"]);
    } else if (result.name) {
      rows.push([T("r.from"), result.name]);
    }
    if (result.loan_name) rows.push([T("tx.loan"), App.ui.loanName(result.loan_name)]);
    rows.push([T("r.amount"), ui.money(result.amount)]);
    if (result.balance_after != null) rows.push([T("r.balance"), ui.money(result.balance_after)]);
    const trs = rows.map((r) => "<tr><th>" + App.esc(r[0]) + "</th><td>" + App.esc(r[1]) + "</td></tr>").join("");
    return '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + App.esc(T("r.title." + kind)) + "</title><style>" +
      'body{margin:0;background:#f6f3ec;font-family:"Segoe UI","Nirmala UI","Noto Sans Kannada","Noto Sans Devanagari",system-ui,sans-serif;color:#0b1f3a}' +
      ".r{max-width:460px;margin:32px auto;background:#fff;border:1px solid #e3ded2;border-radius:16px;padding:28px}" +
      "h1{font:700 1.5rem Georgia,serif;margin:0 0 4px}.b{color:#a8844a;font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;font-weight:600}" +
      "table{width:100%;border-collapse:collapse;margin-top:18px}th{text-align:left;color:#5b6677;font-weight:500;padding:9px 0;border-top:1px solid #eee;width:42%}td{text-align:right;padding:9px 0;border-top:1px solid #eee;font-weight:600}" +
      ".f{margin-top:20px;color:#5b6677;font-size:.8rem;text-align:center}</style></head><body><div class=\"r\"><div class=\"b\">" +
      App.esc(T("brand")) + "</div><h1>" + App.esc(T("r.title." + kind)) + "</h1><table>" + trs + '</table><div class="f">' + App.esc(T("r.foot")) + "</div></div></body></html>";
  };
  ui.downloadReceipt = function (result) {
    const blob = new Blob([ui.receiptHtml(result)], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "receipt-" + result.transaction_id + ".html";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  /* ---------- page boot ---------- */
  ui.boot = function (opts) {
    opts = opts || {};
    if (opts.auth && !ui.requireAuth()) return false;
    App.applyI18n();
    ui.mountTopbar({ signout: !!opts.auth });
    ui.mountMic();
    document.title = (opts.title ? App.t(opts.title) + " · " : "") + App.t("brand");
    if (!App.Voice.supported()) setTimeout(() => ui.toast(App.t("voice.unsupported"), "info"), 800);
    return true;
  };

  /** Fill a field with spoken digits only (numbers, phone, pin). */
  ui.setDigits = function (input, text, max) {
    const d = App.Words.spokenDigits(text, App.getLang()).slice(0, max || 20);
    input.value = d;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return d;
  };
})();
