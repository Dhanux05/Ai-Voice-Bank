/* admin.js - Admin panel: dashboard, users (detail, edit, disable), loans, transactions, risk alerts.
   Account number and PIN are read-only; name, phone and balance are editable. English only (staff tool). */
(function () {
  const A = App;
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const E = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
  const money = (n) => inr.format(Number(n) || 0), money0 = (n) => inr0.format(Number(n) || 0);
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); };
  const day = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : d.toLocaleDateString("en-IN", { dateStyle: "medium" }); };
  const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const KEY = "avb_admin";
  const store = { get: () => { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }, set: (v) => { try { sessionStorage.setItem(KEY, v); } catch (e) { /* ignore */ } }, del: () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } } };

  const MSG = {
    ADMIN_UNAUTHORIZED: "That admin token is not correct.", ADMIN_NOT_CONFIGURED: "ADMIN_TOKEN is not set. Add it to backend/.env and restart the server.",
    PHONE_EXISTS: "That mobile number belongs to another account.", INVALID_PHONE: "Enter a valid 10-digit mobile number.", INVALID_NAME: "Enter a valid name.",
    FIELD_READONLY: "That field cannot be changed.", INVALID_BALANCE: "Enter a valid balance (0 or more, up to 2 decimals).", NETWORK: "Cannot reach the server. Is it running?",
  };
  const msg = (e) => MSG[e.code] || (e.data && e.data.message) || e.message || "Something went wrong.";
  const call = (m, p, b) => { const o = { admin: store.get(), noRedirect: true }; return m === "get" ? A.api.get(p, o) : A.api[m](p, b, o); };
  function toast(t, bad) { const n = document.createElement("div"); n.className = "toast-a" + (bad ? " toast-a--err" : ""); n.textContent = t; n.setAttribute("role", "status"); document.body.appendChild(n); setTimeout(() => n.remove(), 3200); }

  const I = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.2 2.3 3.6 5.2"/>',
    loan: '<path d="M3 10l9-6 9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><path d="M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/><circle cx="16" cy="14" r="1.2"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    out: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    alert: '<path d="M12 4l9 16H3L12 4z"/><path d="M12 10v4M12 17h.01"/>',
    ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
  };
  const ic = (n) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + "</svg>";

  const PAGES = [
    { id: "dashboard", label: "Dashboard", icon: "grid", sub: "How the bank is doing right now." },
    { id: "users", label: "Users", icon: "users", sub: "Every customer. Open one to see details, edit or disable." },
    { id: "loans", label: "Loans", icon: "loan", sub: "Who borrowed, what they paid and what is left." },
    { id: "transactions", label: "Transactions", icon: "swap", sub: "All money movement, newest first." },
    { id: "risk", label: "Risk alerts", icon: "shield", sub: "Transactions flagged by the risk check." },
  ];
  let page = "dashboard", seq = 0;

  /* ---------- shell ---------- */
  function brand(host, sub) { host.innerHTML = A.ui.logoMark() + "<div><b>Voice Banking</b><small>" + E(sub) + "</small></div>"; }
  function mountNav() {
    $("#nav").innerHTML = PAGES.map((p) => '<button type="button" data-p="' + p.id + '">' + ic(p.icon) + "<span>" + p.label + "</span></button>").join("");
    $("#nav").addEventListener("click", (ev) => { const b = ev.target.closest("[data-p]"); if (b) go(b.dataset.p); });
    $("#lock").innerHTML = ic("lock") + " Lock panel";
  }
  function go(id) { if (location.hash !== "#" + id) location.hash = id; else show(id); }
  async function show(id) {
    page = PAGES.some((p) => p.id === id) ? id : "dashboard";
    const meta = PAGES.find((p) => p.id === page), my = ++seq;
    $$("#nav button").forEach((b) => { if (b.dataset.p === page) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("#title").textContent = meta.label; $("#subtitle").textContent = meta.sub; $("#bar-actions").innerHTML = ""; document.title = meta.label + " · Admin · Voice Banking";
    $("#view").innerHTML = '<div class="card muted">Loading…</div>';
    try { await views[page](my); } catch (e) { if (my !== seq) return; if (e.code === "ADMIN_UNAUTHORIZED") { lock(); return; } $("#view").innerHTML = '<div class="card"><b>Could not load this page.</b><p class="muted">' + E(msg(e)) + "</p></div>"; }
  }

  /* ---------- dashboard ---------- */
  function kpi(label, icon, val, sub, brandCls) { return '<div class="card kpi' + (brandCls ? " kpi--brand" : "") + '"><div class="kpi__top"><span>' + label + '</span><span class="kpi__ico">' + ic(icon) + '</span></div><div class="kpi__val num">' + val + '</div><div class="kpi__sub">' + sub + "</div></div>"; }
  function lastDays(series, n) {
    const map = {}; series.forEach((s) => { map[s.date] = s; }); const out = [], now = new Date();
    for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i); const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); out.push({ k, d, v: map[k] ? map[k].volume : 0, c: map[k] ? map[k].count : 0 }); }
    return out;
  }
  function niceMax(v) { if (v <= 0) return 1000; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  const short = (v) => v >= 1e7 ? (v / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr" : v >= 1e5 ? (v / 1e5).toFixed(1).replace(/\.0$/, "") + "L" : v >= 1e3 ? (v / 1e3).toFixed(v % 1e3 ? 1 : 0).replace(/\.0$/, "") + "k" : String(Math.round(v));
  function chart(series) {
    const days = lastDays(series, 14), max = niceMax(Math.max.apply(null, days.map((d) => d.v))), W = 700, H = 230, L = 46, B = 28, T = 10, cw = (W - L - 8) / days.length, ch = H - B - T;
    let g = "";
    for (let i = 0; i <= 5; i++) { const y = T + ch - (ch * i) / 5; g += '<line class="gl" x1="' + L + '" x2="' + (W - 8) + '" y1="' + y + '" y2="' + y + '"/><text class="ax" x="' + (L - 8) + '" y="' + (y + 4) + '" text-anchor="end">' + short((max * i) / 5) + "</text>"; }
    days.forEach((d, i) => {
      const h = Math.max(d.v ? 3 : 0, (d.v / max) * ch), x = L + i * cw + cw * 0.2, w = cw * 0.6;
      g += '<rect class="bar-v" x="' + x + '" y="' + (T + ch - h) + '" width="' + w + '" height="' + h + '" rx="5"><title>' + d.d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " + money0(d.v) + " · " + d.c + " transactions</title></rect>";
      if (i % 2 === 0 || days.length < 8) g += '<text class="ax" x="' + (x + w / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + d.d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + "</text>";
    });
    return '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Daily transaction value, last 14 days">' + g + "</svg>";
  }
  function donut(collected, outstanding) {
    const total = collected + outstanding, R = 70, C = 2 * Math.PI * R, pct = total ? collected / total : 0;
    return '<div class="donut"><svg viewBox="0 0 170 170" width="170" height="170" role="img" aria-label="Loan repayment progress"><circle cx="85" cy="85" r="' + R + '" fill="none" stroke="' + (total ? "#d9a84e" : "#e6ebe9") + '" stroke-width="18"/>' +
      '<circle cx="85" cy="85" r="' + R + '" fill="none" stroke="#0b5d4b" stroke-width="18" stroke-linecap="butt" stroke-dasharray="' + (C * pct) + " " + C + '" transform="rotate(-90 85 85)"/></svg>' +
      '<div class="donut__mid"><b class="num">' + Math.round(pct * 100) + '%</b><span>repaid</span></div></div>';
  }
  const typeBadge = (t) => { const m = { Deposit: "ok", Withdrawal: "mute", Transfer: "", "Loan Disbursement": "warn", "Loan EMI Payment": "warn", "Admin Balance Update": "danger" }; return '<span class="badge badge--plain' + (m[t] ? " badge--" + m[t] : "") + '">' + E(t) + "</span>"; };
  const WHY = { ABOVE_USUAL_AMOUNT: "Above the customer's usual amount", ALMOST_ALL_OF_BALANCE: "Almost the whole balance", HIGH_VALUE: "High-value amount", LARGE_LOAN: "Large loan", LARGE_SHARE_OF_BALANCE: "Large share of balance", MANY_TODAY: "Many transactions today", MULTIPLE_LOANS_TODAY: "Several loans in one day", NEW_BIGGEST_AMOUNT: "Biggest amount so far", NEW_RECIPIENT: "New recipient", RAPID_TRANSACTIONS: "Rapid back-to-back transactions", RECENT_FAILED_PINS: "Recent wrong PIN attempts", REPEATED_AMOUNT: "Same amount repeated", ROUND_LARGE_AMOUNT: "Large round amount", UNUSUAL_HOUR: "Unusual time of day" };
  const why = (c) => WHY[c] || String(c).replace(/_/g, " ").toLowerCase().replace(/^./, (x) => x.toUpperCase());
  const lvlBadge = (l) => '<span class="badge badge--' + (l === "high" ? "danger" : l === "medium" ? "warn" : "ok") + '">' + E(l[0].toUpperCase() + l.slice(1)) + "</span>";
  function party(name, acc) { return acc ? '<div class="who"><div><b>' + E(name || "Account") + '</b><small class="num">' + acc + "</small></div></div>" : "—"; }
  function txRows(list, cols) {
    return list.map((t) => "<tr><td>" + E(when(t.timestamp)) + "</td><td>" + typeBadge(t.type) + "</td>" +
      (cols === "full" ? "<td>" + party(t.from_name, t.from_account) + "</td><td>" + (t.type === "Transfer" ? party(t.to_name, t.to_account) : "—") + "</td>" : "<td>" + E(t.from_name || t.from_account) + (t.type === "Transfer" ? " → " + E(t.to_name || t.to_account) : "") + "</td>") +
      '<td class="r num"><b>' + money(t.amount) + "</b></td>" + (cols === "full" ? '<td class="num muted">' + E(t.transaction_id) + "</td>" : "") + "</tr>").join("");
  }

  const views = {
    async dashboard(my) {
      const d = await call("get", "/api/admin/dashboard"); if (my !== seq) return;
      const u = d.users, l = d.loans, t = d.transactions, repaidTotal = l.collected;
      $("#view").innerHTML =
        '<div class="grid g4">' +
        kpi("Customers", "users", u.total, u.active + " active · " + u.disabled + " disabled" + (u.locked ? " · " + u.locked + " locked" : "")) +
        kpi("Money held", "wallet", money0(u.total_balance), "Average " + money0(u.average_balance) + " per customer", true) +
        kpi("Transactions", "swap", t.total, money0(t.volume) + " moved in total") +
        kpi("Loan book", "loan", money0(l.outstanding), l.active + " active · " + l.closed + " closed · " + money0(l.disbursed) + " lent") + "</div>" +
        '<div class="grid g2-1"><div class="card"><div class="card__head"><h2>Money moved, last 14 days</h2><span>Deposits, withdrawals and transfers</span></div><div class="chart-scroll">' + chart(d.series) + "</div></div>" +
        '<div class="card"><div class="card__head"><h2>Loan repayments</h2><button class="link" data-go="loans" type="button">View loans</button></div><div class="donut-wrap">' + donut(repaidTotal, l.outstanding) +
        '<div class="legend"><div><i style="background:#0b5d4b"></i><span>Repaid so far</span><span class="num">' + money0(repaidTotal) + '</span></div><div><i style="background:#d9a84e"></i><span>Still to repay</span><span class="num">' + money0(l.outstanding) + "</span></div></div></div></div></div>" +
        '<div class="grid g2-1"><div class="card"><div class="card__head"><h2>Recent transactions</h2><button class="link" data-go="transactions" type="button">See all</button></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Type</th><th>Account</th><th class="r">Amount</th></tr></thead><tbody>' +
        (txRows(d.recent, "short") || '<tr><td colspan="4" class="empty">No transactions yet.</td></tr>') + "</tbody></table></div></div>" +
        '<div class="grid"><div class="card"><div class="card__head"><h2>Risk alerts</h2><button class="link" data-go="risk" type="button">See all</button></div><div class="list">' +
        (d.alerts.map((a) => '<div><span class="kpi__ico" style="background:' + (a.level === "high" ? "var(--danger-soft);color:var(--danger)" : "var(--warn-soft);color:var(--warn)") + '">' + ic("alert") + '</span><div class="grow"><b>' + E(a.full_name || a.account_number) + " · " + money0(a.amount) + "</b><small>" + E(a.reasons[0] ? why(a.reasons[0]) : a.kind) + "</small></div>" + lvlBadge(a.level) + "</div>").join("") || '<div class="muted">Nothing flagged.</div>') + "</div></div>" +
        '<div class="card"><div class="card__head"><h2>Newest customers</h2><button class="link" data-go="users" type="button">See all</button></div><div class="list">' +
        (d.newest.map((n) => '<div data-user="' + n.account_number + '" style="cursor:pointer"><div class="avatar">' + E(initials(n.full_name)) + '</div><div class="grow"><b>' + E(n.full_name) + '</b><small class="num">' + n.account_number + '</small></div><span class="num muted">' + money0(n.balance) + "</span></div>").join("") || '<div class="muted">No customers yet.</div>') + "</div></div></div></div>";
      $$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
      $$("[data-user]").forEach((b) => b.addEventListener("click", () => openUser(parseInt(b.dataset.user, 10))));
    },

    async users(my) {
      let filter = "all", q = "", all = [];
      $("#view").innerHTML = '<div class="toolbar"><div class="search">' + ic("search") + '<input class="input" id="q" placeholder="Search by name, mobile, account number or branch" aria-label="Search users"></div>' +
        '<div class="seg" id="uf"><button type="button" data-f="all" aria-pressed="true">All</button><button type="button" data-f="active" aria-pressed="false">Active</button><button type="button" data-f="disabled" aria-pressed="false">Disabled</button><button type="button" data-f="locked" aria-pressed="false">Locked</button></div></div>' +
        '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Customer</th><th>Mobile</th><th>Branch</th><th class="r">Balance</th><th>Joined</th><th>Status</th></tr></thead><tbody id="ub"></tbody></table></div><div class="pager"><span id="ucount"></span></div></div>';
      const status = (u) => u.disabled ? '<span class="badge badge--danger">Disabled</span>' : u.locked ? '<span class="badge badge--warn">Locked</span>' : '<span class="badge badge--ok">Active</span>';
      const draw = () => {
        const rows = all.filter((u) => filter === "all" || (filter === "active" && !u.disabled && !u.locked) || (filter === "disabled" && u.disabled) || (filter === "locked" && u.locked));
        $("#ub").innerHTML = rows.map((u) => '<tr data-open="' + u.account_number + '"><td><div class="who"><div class="avatar">' + E(initials(u.full_name)) + '</div><div><b>' + E(u.full_name) + '</b><small class="num">' + u.account_number + '</small></div></div></td><td class="num">' + E(u.phone || "—") + "</td><td>" + E(u.branch_name || "—") + '</td><td class="r num"><b>' + money(u.balance) + "</b></td><td>" + (u.joined ? E(day(u.joined)) : '<span class="muted">—</span>') + "</td><td>" + status(u) + "</td></tr>").join("") || '<tr><td colspan="6" class="empty">No users match.</td></tr>';
        $("#ucount").textContent = rows.length + " of " + all.length + " customers";
      };
      const load = async () => { const d = await call("get", "/api/admin/users?q=" + encodeURIComponent(q)); if (my !== seq) return; all = d.users; draw(); };
      $("#q").addEventListener("input", (ev) => { q = ev.target.value.trim(); clearTimeout(window.__qt); window.__qt = setTimeout(() => load().catch((e) => toast(msg(e), true)), 250); });
      $("#uf").addEventListener("click", (ev) => { const b = ev.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; $$("#uf button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
      $("#ub").addEventListener("click", (ev) => { const r = ev.target.closest("[data-open]"); if (r) openUser(parseInt(r.dataset.open, 10)); });
      await load();
    },

    async loans(my) {
      const d = await call("get", "/api/admin/loans"); if (my !== seq) return;
      let f = "all", q = ""; const L = d.loans;
      const sum = (k, fl) => L.filter(fl || (() => true)).reduce((a, x) => a + (Number(x[k]) || 0), 0);
      $("#view").innerHTML = '<div class="card"><div class="strip">' +
        '<div><small>Loans given</small><b class="num">' + L.length + "</b></div><div><small>Active</small><b class=\"num\">" + L.filter((x) => x.status === "Active").length + "</b></div>" +
        '<div><small>Total lent</small><b class="num">' + money0(sum("principal")) + '</b></div><div><small>Repaid so far</small><b class="num">' + money0(sum("amount_paid")) + '</b></div><div><small>Still to repay</small><b class="num">' + money0(sum("remaining_payable")) + "</b></div></div></div>" +
        '<div class="toolbar"><div class="search">' + ic("search") + '<input class="input" id="lq" placeholder="Search borrower or loan number" aria-label="Search loans"></div>' +
        '<div class="seg" id="lf"><button type="button" data-f="all" aria-pressed="true">All</button><button type="button" data-f="Active" aria-pressed="false">Active</button><button type="button" data-f="Closed" aria-pressed="false">Closed</button></div></div>' +
        '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Borrower</th><th>Loan</th><th class="r">Loan amount</th><th class="r">Paid</th><th class="r">Remaining</th><th>Progress</th><th>EMIs</th><th>Status</th></tr></thead><tbody id="lb"></tbody></table></div></div>';
      const draw = () => {
        const rows = L.filter((x) => (f === "all" || x.status === f) && (!q || (String(x.full_name || "") + x.loan_id + x.account_number).toLowerCase().includes(q)));
        $("#lb").innerHTML = rows.map((x) => '<tr data-open="' + x.account_number + '"><td>' + party(x.full_name, x.account_number) + '</td><td><b style="text-transform:capitalize">' + E(x.loan_type) + '</b><br><small class="muted num">' + E(x.loan_id) + '</small></td><td class="r num">' + money0(x.principal) + '</td><td class="r num pos">' + money(x.amount_paid) + '</td><td class="r num"><b>' + money(x.remaining_payable) + '</b></td><td style="min-width:130px"><div class="bar-meter' + (x.status === "Closed" ? " bar-meter--done" : "") + '"><i style="width:' + x.progress + '%"></i></div><small class="muted">' + x.progress + '% repaid</small></td><td class="num">' + x.emis_paid + " / " + x.tenure_months + "</td><td>" +
          '<span class="badge ' + (x.status === "Active" ? "badge--ok" : "badge--mute") + '">' + E(x.status) + "</span></td></tr>").join("") || '<tr><td colspan="8" class="empty">No loans found.</td></tr>';
      };
      $("#lq").addEventListener("input", (ev) => { q = ev.target.value.trim().toLowerCase(); draw(); });
      $("#lf").addEventListener("click", (ev) => { const b = ev.target.closest("[data-f]"); if (!b) return; f = b.dataset.f; $$("#lf button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
      $("#lb").addEventListener("click", (ev) => { const r = ev.target.closest("[data-open]"); if (r) openUser(parseInt(r.dataset.open, 10), "loans"); });
      draw();
    },

    async transactions(my) {
      const SIZE = 25; let off = 0, q = "", type = "";
      $("#view").innerHTML = '<div class="toolbar"><div class="search">' + ic("search") + '<input class="input" id="tq" placeholder="Search name, account number or reference" aria-label="Search transactions"></div>' +
        '<select class="select" id="tt" style="width:auto" aria-label="Type"><option value="">All types</option><option>Deposit</option><option>Withdrawal</option><option>Transfer</option><option>Loan Disbursement</option><option>Loan EMI Payment</option><option>Admin Balance Update</option></select></div>' +
        '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Type</th><th>From</th><th>To</th><th class="r">Amount</th><th>Reference</th></tr></thead><tbody id="tb"></tbody></table></div><div class="pager"><span id="tc"></span><div class="actions"><button class="btn btn--sm" id="tp" type="button">Previous</button><button class="btn btn--sm" id="tn" type="button">Next</button></div></div></div>';
      const load = async () => {
        const d = await call("get", "/api/admin/transactions?limit=" + SIZE + "&offset=" + off + "&q=" + encodeURIComponent(q) + "&type=" + encodeURIComponent(type)); if (my !== seq) return;
        $("#tb").innerHTML = txRows(d.transactions, "full") || '<tr><td colspan="6" class="empty">No transactions found.</td></tr>';
        $("#tc").textContent = d.total ? "Showing " + (off + 1) + "–" + Math.min(off + SIZE, d.total) + " of " + d.total : "0 transactions";
        $("#tp").disabled = off === 0; $("#tn").disabled = off + SIZE >= d.total;
      };
      const run = () => load().catch((e) => toast(msg(e), true));
      $("#tq").addEventListener("input", (ev) => { q = ev.target.value.trim(); off = 0; clearTimeout(window.__tt); window.__tt = setTimeout(run, 250); });
      $("#tt").addEventListener("change", (ev) => { type = ev.target.value; off = 0; run(); });
      $("#tp").addEventListener("click", () => { off = Math.max(0, off - SIZE); run(); });
      $("#tn").addEventListener("click", () => { off += SIZE; run(); });
      await load();
    },

    async risk(my) {
      let lvl = "";
      $("#view").innerHTML = '<div class="toolbar"><div class="seg" id="rf"><button type="button" data-f="" aria-pressed="true">All</button><button type="button" data-f="high" aria-pressed="false">High</button><button type="button" data-f="medium" aria-pressed="false">Medium</button><button type="button" data-f="low" aria-pressed="false">Low</button></div></div>' +
        '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Customer</th><th>Action</th><th class="r">Amount</th><th>Risk</th><th>Why it was flagged</th><th>Outcome</th></tr></thead><tbody id="rb"></tbody></table></div></div>';
      const load = async () => {
        const d = await call("get", "/api/admin/risk-events?level=" + lvl); if (my !== seq) return;
        $("#rb").innerHTML = d.events.map((r) => '<tr data-open="' + r.account_number + '"><td>' + E(when(r.created_at)) + "</td><td>" + party(r.full_name, r.account_number) + "</td><td>" + E(r.kind) + '</td><td class="r num"><b>' + money(r.amount) + "</b></td><td>" + lvlBadge(r.level) + ' <span class="muted num">' + r.score + "</span></td><td>" + E(r.reasons.map(why).join(", ") || "—") + "</td><td>" + E(r.outcome || "—") + "</td></tr>").join("") || '<tr><td colspan="7" class="empty">No events.</td></tr>';
      };
      $("#rf").addEventListener("click", (ev) => { const b = ev.target.closest("[data-f]"); if (!b) return; lvl = b.dataset.f; $$("#rf button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); load().catch((e) => toast(msg(e), true)); });
      $("#rb").addEventListener("click", (ev) => { const r = ev.target.closest("[data-open]"); if (r) openUser(parseInt(r.dataset.open, 10)); });
      await load();
    },
  };

  /* ---------- user drawer ---------- */
  let dr = null;
  function closeDrawer() { if (!dr) return; const d = dr; dr = null; d.scrim.classList.remove("on"); d.el.classList.remove("on"); document.removeEventListener("keydown", d.key); setTimeout(() => { d.scrim.remove(); d.el.remove(); }, 260); if (d.dirty) show(page); }
  async function openUser(acc, tab) {
    closeDrawer();
    const scrim = document.createElement("div"), el = document.createElement("aside");
    scrim.className = "scrim"; el.className = "drawer"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Customer details");
    el.innerHTML = '<div class="drawer__body"><div class="muted">Loading…</div></div>';
    $("#overlay").append(scrim, el);
    const state = { acc, tab: tab || "profile", data: null, scrim, el, dirty: false, confirm: false };
    state.key = (ev) => { if (ev.key === "Escape") closeDrawer(); };
    document.addEventListener("keydown", state.key); scrim.addEventListener("click", closeDrawer); dr = state;
    requestAnimationFrame(() => { scrim.classList.add("on"); el.classList.add("on"); });
    await reload(state);
  }
  async function reload(s) {
    try { s.data = await call("get", "/api/admin/users/" + s.acc + "/detail"); } catch (e) { toast(msg(e), true); closeDrawer(); return; }
    if (dr !== s) return; paint(s);
  }
  function paint(s) {
    const d = s.data, u = d.user, sm = d.summary, el = s.el;
    const st = u.disabled ? '<span class="badge badge--danger">Disabled</span>' : u.locked ? '<span class="badge badge--warn">Locked</span>' : '<span class="badge badge--ok">Active</span>';
    const tabs = [["profile", "Profile"], ["transactions", "Transactions (" + d.transactions.length + ")"], ["loans", "Loans (" + d.loans.length + ")"], ["risk", "Risk (" + d.risk_events.length + ")"]];
    el.innerHTML = '<div class="drawer__head"><div class="drawer__top"><div class="avatar avatar--lg">' + E(initials(u.full_name)) + '</div><div><h2>' + E(u.full_name) + '</h2><p><span class="num">A/c ' + u.account_number + "</span>" + st + '</p></div><button class="drawer__x" type="button" id="dx" aria-label="Close">' + ic("x") + "</button></div>" +
      '<div class="dtabs" role="tablist">' + tabs.map((t) => '<button type="button" role="tab" data-t="' + t[0] + '" aria-selected="' + (s.tab === t[0]) + '">' + t[1] + "</button>").join("") + '</div></div><div class="drawer__body" id="db"></div>';
    $("#dx", el).addEventListener("click", closeDrawer);
    $$(".dtabs button", el).forEach((b) => b.addEventListener("click", () => { s.tab = b.dataset.t; s.confirm = false; paint(s); }));
    const body = $("#db", el);
    if (s.tab === "profile") profile(s, body); else if (s.tab === "transactions") body.innerHTML = userTx(d, u); else if (s.tab === "loans") body.innerHTML = userLoans(d); else body.innerHTML = userRisk(d);
  }
  function profile(s, body) {
    const d = s.data, u = d.user, sm = d.summary;
    body.innerHTML =
      (u.disabled ? '<div class="banner banner--danger">' + ic("ban") + "<div><b>This account is disabled.</b><br>The customer cannot sign in or receive transfers" + (u.disabled_at ? ". Disabled on " + E(when(u.disabled_at)) : "") + ".</div></div>" : "") +
      (u.locked && !u.disabled ? '<div class="banner banner--warn">' + ic("lock") + "<div><b>Locked after wrong PIN attempts.</b><br>It unlocks by itself after 15 minutes, or you can unlock it now.</div></div>" : "") +
      '<div class="mini"><div><small>Balance</small><b class="num">' + money(u.balance) + '</b></div><div><small>Deposited</small><b class="num">' + money0(sm.deposited) + '</b></div><div><small>Withdrawn</small><b class="num">' + money0(sm.withdrawn) + '</b></div><div><small>Transactions</small><b class="num">' + sm.transactions + "</b></div></div>" +
      '<div class="card"><div class="card__head"><h2>Account details</h2><span>Name, mobile and balance can be edited</span></div>' +
      '<div class="form2"><div class="field"><span>Account number</span><div class="ro">' + ic("lock") + '<span class="num">' + u.account_number + '</span></div></div><div class="field"><span>PIN</span><div class="ro">' + ic("lock") + "<span>•••• hidden, cannot be changed</span></div></div>" +
      '<label class="field"><span>Full name</span><input class="input" id="e-name" maxlength="50" value="' + E(u.full_name) + '"></label><label class="field"><span>Mobile number</span><input class="input num" id="e-phone" inputmode="numeric" maxlength="10" value="' + E(u.phone || "") + '"></label>' +
      '<label class="field"><span>Balance (₹)</span><input class="input num" id="e-bal" inputmode="decimal" value="' + Number(u.balance).toFixed(2) + '"></label><div class="field"><span>Branch</span><div class="ro"><span>' + E(u.branch_name || "—") + "</span></div></div></div>" +
      '<div class="err" id="e-err" role="alert"></div><div class="actions"><button class="btn btn--primary" id="e-save" type="button">Save changes</button><span class="muted">Joined ' + (u.joined ? E(day(u.joined)) : "before join dates were recorded") + "</span></div></div>" +
      '<div class="card"><div class="card__head"><h2>Account control</h2></div>' + (s.confirm
        ? '<div class="confirm"><p><b>Disable ' + E(u.full_name) + "'s account?</b><br>They will be signed out and will not be able to log in, use the voice assistant or receive transfers until you enable it again. Their money and history stay safe.</p>" +
          '<div class="actions"><button class="btn btn--solid-danger" id="c-yes" type="button">Yes, disable account</button><button class="btn" id="c-no" type="button">Keep active</button></div></div>'
        : '<div class="actions">' + (u.disabled ? '<button class="btn btn--primary" id="c-en" type="button">' + ic("check") + " Enable account</button>" : '<button class="btn btn--danger" id="c-dis" type="button">' + ic("ban") + " Disable account</button>") +
          (u.locked ? '<button class="btn" id="c-unlock" type="button">' + ic("lock") + " Unlock PIN</button>" : "") + "</div>" +
          '<p class="muted" style="margin:12px 0 0">' + (u.disabled ? "Enabling lets the customer sign in again with their existing PIN." : "Disabling is reversible. Nothing is deleted.") + "</p>") + "</div>";
    const err = $("#e-err", body), act = async (fn, ok) => { try { await fn(); s.dirty = true; toast(ok); s.confirm = false; await reload(s); } catch (e) { toast(msg(e), true); } };
    const on = (id, fn) => { const b = $(id, body); if (b) b.addEventListener("click", fn); };
    on("#c-dis", () => { s.confirm = true; paint(s); }); on("#c-no", () => { s.confirm = false; paint(s); });
    on("#c-yes", () => act(() => call("post", "/api/admin/users/" + u.account_number + "/disable"), "Account disabled"));
    on("#c-en", () => act(() => call("post", "/api/admin/users/" + u.account_number + "/enable"), "Account enabled"));
    on("#c-unlock", () => act(() => call("post", "/api/admin/users/" + u.account_number + "/unlock"), "PIN unlocked"));
    on("#e-save", async (ev) => {
      err.textContent = ""; const btn = ev.currentTarget, name = $("#e-name", body).value.trim(), phone = $("#e-phone", body).value.replace(/\D/g, ""), bal = $("#e-bal", body).value.trim();
      if (name.length < 2) { err.textContent = MSG.INVALID_NAME; return; } if (!/^\d{10}$/.test(phone)) { err.textContent = MSG.INVALID_PHONE; return; } if (!/^\d+(\.\d{1,2})?$/.test(bal)) { err.textContent = MSG.INVALID_BALANCE; return; }
      btn.disabled = true;
      try {
        const patch = {}; if (name !== u.full_name) patch.full_name = name; if (phone !== (u.phone || "")) patch.phone = phone;
        if (Object.keys(patch).length) await call("put", "/api/admin/users/" + u.account_number, patch);
        if (parseFloat(bal) !== Number(u.balance)) await call("put", "/api/admin/users/" + u.account_number + "/balance", { balance: parseFloat(bal) });
        s.dirty = true; toast("Changes saved"); await reload(s);
      } catch (e) { err.textContent = msg(e); btn.disabled = false; }
    });
  }
  function userTx(d, u) {
    if (!d.transactions.length) return '<div class="card muted">No transactions yet.</div>';
    return '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Type</th><th>With</th><th class="r">Amount</th><th class="r">Balance after</th></tr></thead><tbody>' +
      d.transactions.map((t) => { const out = t.direction === "out", other = t.type === "Transfer" ? (out ? t.to_name || t.to_account : t.from_name || t.from_account) : "—"; return "<tr><td>" + E(when(t.timestamp)) + "</td><td>" + typeBadge(t.type) + "</td><td>" + E(other) + '</td><td class="r num ' + (out ? "neg" : "pos") + '">' + (out ? "−" : "+") + money(Math.abs(t.amount)) + '</td><td class="r num muted">' + money(t.balance_after) + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
  }
  function userLoans(d) {
    if (!d.loans.length) return '<div class="card muted">This customer has not taken any loans.</div>';
    return d.loans.map((x) => '<div class="loan"><div class="loan__top"><div><b>' + E(x.loan_type) + "</b><small class=\"num\">" + E(x.loan_id) + " · taken " + E(day(x.applied_date)) + "</small></div><span class=\"badge " + (x.status === "Active" ? "badge--ok" : "badge--mute") + '">' + E(x.status) + "</span></div>" +
      '<div><div class="bar-meter' + (x.status === "Closed" ? " bar-meter--done" : "") + '"><i style="width:' + x.progress + '%"></i></div><div class="loan__foot" style="margin-top:6px"><span>' + x.progress + "% repaid</span><span class=\"num\">" + x.emis_paid + " of " + x.tenure_months + " EMIs paid</span></div></div>" +
      '<div class="loan__nums"><div><small>Loan amount</small><b class="num">' + money(x.principal) + '</b></div><div><small>Paid so far</small><b class="num pos">' + money(x.amount_paid) + '</b></div><div><small>Remaining to pay</small><b class="num">' + money(x.remaining_payable) + "</b></div>" +
      '<div><small>Monthly EMI</small><b class="num">' + money(x.emi_amount) + "</b></div><div><small>Interest rate</small><b>" + x.interest_rate + '% a year</b></div><div><small>Total payable</small><b class="num">' + money(x.total_payable) + "</b></div></div>" +
      '<div class="loan__foot"><span>' + (x.status === "Active" ? "Next EMI due " + money(x.next_due) + " · " + x.emis_left + " EMIs left" : "Closed " + E(day(x.closed_date))) + "</span><span>" + (x.last_payment ? "Last payment " + E(day(x.last_payment)) : "No payment yet") + "</span></div></div>").join("");
  }
  function userRisk(d) {
    if (!d.risk_events.length) return '<div class="card muted">No risk alerts for this customer.</div>';
    return '<div class="card"><div class="list">' + d.risk_events.map((r) => '<div><span class="kpi__ico" style="background:' + (r.level === "high" ? "var(--danger-soft);color:var(--danger)" : r.level === "medium" ? "var(--warn-soft);color:var(--warn)" : "var(--ok-soft);color:var(--ok)") + '">' + ic("alert") + '</span><div class="grow"><b>' + E(r.kind) + " · " + money(r.amount) + "</b><small>" + E(r.reasons.map(why).join(", ") || "No specific reason") + " · " + E(when(r.created_at)) + "</small></div>" + lvlBadge(r.level) + "</div>").join("") + "</div></div>";
  }

  /* ---------- gate ---------- */
  function lock() { store.del(); closeDrawer(); $("#shell").hidden = true; $("#gate").hidden = false; $("#token").value = ""; }
  async function unlockWith(token) {
    store.set(token);
    try { await call("get", "/api/admin/stats"); } catch (e) { store.del(); $("#gate-err").textContent = msg(e); return; }
    $("#gate").hidden = true; $("#shell").hidden = false; show((location.hash || "").slice(1) || "dashboard");
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.documentElement.lang = "en";
    brand($("#gate-brand"), "Admin panel"); brand($("#side-brand"), "Admin panel"); mountNav();
    window.addEventListener("hashchange", () => { if (!$("#shell").hidden) show((location.hash || "").slice(1)); });
    $("#gate-form").addEventListener("submit", (ev) => { ev.preventDefault(); $("#gate-err").textContent = ""; unlockWith($("#token").value.trim()); });
    $("#lock").addEventListener("click", lock);
    if (store.get()) unlockWith(store.get());
  });
})();
