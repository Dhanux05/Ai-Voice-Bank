/* loan.js - apply (live EMI, voice in 3 languages) and manage loans (pay EMI / pay in full). */
(function () {
  const A = App, $ = A.$, E = A.esc;
  let types = {}, calcTimer, step = 0;

  function fillTypes() {
    const sel = $("#f-type");
    sel.innerHTML = '<option value="">—</option>' + Object.keys(types).map((k) => '<option value="' + k + '">' + E(A.t("loan." + k)) + "</option>").join("");
  }
  function limits() {
    const c = types[$("#f-type").value];
    $("#limits").textContent = c ? A.t("loan.limits", { min: A.ui.money(c.min_amount).replace(".00", ""), max: A.ui.money(c.max_amount).replace(".00", ""), tmin: c.min_tenure, tmax: c.max_tenure }) : "";
    $("#rate").textContent = c ? c.interest_rate + "%" : "—";
  }
  function scheduleCalc() { clearTimeout(calcTimer); calcTimer = setTimeout(calc, 300); }
  async function calc() {
    const type = $("#f-type").value, amt = parseFloat($("#f-amount").value), ten = parseInt($("#f-tenure").value, 10);
    const box = $("#emi-box");
    if (!type || !(amt > 0) || !(ten > 0)) { box.hidden = true; return null; }
    try {
      const r = await A.api.post("/api/loans/calculate-emi", { loan_type: type, amount: amt, tenure_months: ten }, { anon: true });
      $("#emi").textContent = A.ui.money(r.emi);
      $("#tint").textContent = A.ui.money(r.total_interest);
      $("#tpay").textContent = A.ui.money(r.total_payable);
      box.hidden = false;
      return r;
    } catch (e) { box.hidden = true; return null; }
  }

  async function review(ev) {
    ev && ev.preventDefault();
    $("#e-loan").textContent = "";
    const type = $("#f-type").value, raw = $("#f-amount").value.trim(), ten = parseInt($("#f-tenure").value, 10);
    if (!type) { $("#e-loan").textContent = A.t("err.INVALID_LOAN_TYPE"); return; }
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(parseFloat(raw) > 0)) { $("#e-loan").textContent = A.t("err.INVALID_AMOUNT"); return; }
    if (!(ten > 0)) { $("#e-loan").textContent = A.t("err.INVALID_TENURE"); return; }
    await A.ui.busy($("#submit"), async () => {
      try {
        await A.TxFlow.run({ kind: "loan_apply", payload: { loan_type: type, amount: parseFloat(raw), tenure_months: ten }, successKey: "tx.ok", pageHandler: onVoice,
          onDone: (r) => { if (r) { $("#form").reset(); $("#emi-box").hidden = true; limits(); selectTab("mine"); } } });
      } catch (e) { $("#e-loan").textContent = A.ui.errMsg(e); A.Voice.speak(A.ui.errMsg(e)); }
    });
  }

  /* ---------- my loans ---------- */
  function loanCard(l) {
    const pct = Math.min(100, Math.round((l.emis_paid / l.tenure_months) * 100));
    const active = l.status === "Active";
    return '<article class="loancard" data-id="' + E(l.loan_id) + '"><div class="row row--between"><h3>' + E(A.ui.loanName(l.loan_type)) + '</h3><span class="badge ' + (active ? "badge--ok" : "") + '">' + E(A.t(active ? "loan.active" : "loan.closed")) + "</span></div>" +
      '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div>' +
      '<div class="muted small">' + E(A.t("loan.paid", { n: l.emis_paid, total: l.tenure_months })) + "</div>" +
      '<dl class="kv"><dt>' + E(A.t("loan.outstanding")) + '</dt><dd class="num">' + E(A.ui.money(l.outstanding_balance)) + "</dd>" +
      "<dt>" + E(A.t("loan.emi")) + '</dt><dd class="num">' + E(A.ui.money(l.emi_amount)) + "</dd>" +
      "<dt>" + E(A.t("loan.rate")) + '</dt><dd class="num">' + l.interest_rate + "%</dd></dl>" +
      (active ? '<div class="actions actions--row"><button class="btn btn--primary btn--sm" data-act="emi" type="button">' + E(A.t("loan.payemi")) + " · " + E(A.ui.money(l.next_due)) + '</button><button class="btn btn--ghost btn--sm" data-act="full" type="button">' + E(A.t("loan.payfull")) + "</button></div>" : "") +
      '<button class="linkbtn" data-act="hist" type="button">' + E(A.t("loan.history")) + '</button><div class="hist" hidden></div></article>';
  }
  let loans = [];
  async function loadLoans() {
    const box = $("#loans");
    try {
      const d = await A.api.get("/api/loans");
      loans = d.loans;
      box.innerHTML = loans.length ? loans.map(loanCard).join("") :
        '<div class="empty card">' + A.icon("loan") + "<b>" + E(A.t("loan.none")) + "</b>" + E(A.t("loan.none.s")) + "</div>";
    } catch (e) { A.ui.toast(A.ui.errMsg(e), "error"); }
  }
  async function onLoanClick(ev) {
    const b = ev.target.closest("[data-act]"); if (!b) return;
    const card = b.closest(".loancard"), l = loans.find((x) => x.loan_id === card.dataset.id);
    if (b.dataset.act === "hist") {
      const h = $(".hist", card);
      if (!h.hidden) { h.hidden = true; return; }
      try {
        const d = await A.api.get("/api/loans/" + encodeURIComponent(l.loan_id));
        h.innerHTML = d.payments.length ? '<ul class="mini">' + d.payments.map((p) => "<li><span>" + E(A.ui.dateOnly(p.payment_date)) + '</span><b class="num">' + E(A.ui.money(p.amount)) + "</b></li>").join("") + "</ul>" : '<p class="muted small mt-1">' + E(A.t("loan.nopay")) + "</p>";
        h.hidden = false;
      } catch (e) { A.ui.toast(A.ui.errMsg(e), "error"); }
      return;
    }
    const payload = { loan_id: l.loan_id };
    if (b.dataset.act === "full") payload.amount = l.payoff_amount;
    await A.ui.busy(b, async () => {
      try { await A.TxFlow.run({ kind: "loan_pay", payload, pageHandler: onVoice, onDone: (r) => { if (r) loadLoans(); } }); }
      catch (e) { /* toast already shown by TxFlow */ }
    });
  }

  /* ---------- tabs + voice ---------- */
  function selectTab(name) {
    A.$$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    $("#tab-apply").hidden = name !== "apply";
    $("#tab-mine").hidden = name !== "mine";
    if (name === "mine") loadLoans();
  }
  function onVoice(t) {
    if (A.Voice.is(t, "cmd.back")) { location.href = "index.html"; return; }
    if (A.Voice.is(t, "loan.cmd.review")) { review(); return; }
    // loan type word (any step) - works in Hindi/Kannada because keywords are in that language
    for (const k of Object.keys(types)) {
      if (A.Voice.is(t, "loan.kw." + k)) { $("#f-type").value = k; limits(); scheduleCalc(); step = 1; A.Voice.say("loan.say.amount"); return; }
    }
    const n = A.Words.spokenAmount(t, A.getLang());
    if (n && step <= 1) { $("#f-amount").value = String(n); scheduleCalc(); step = 2; A.Voice.say("loan.say.tenure"); return; }
    if (n && step === 2) { $("#f-tenure").value = String(Math.round(n)); scheduleCalc(); step = 3; A.Voice.say("loan.say.review"); }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!A.ui.boot({ auth: true, title: "loan.title" })) return;
    try { const d = await A.api.get("/api/loans/types", { anon: true }); d.loan_types.forEach((x) => { types[x.key] = x; }); } catch (e) { A.ui.toast(A.ui.errMsg(e), "error"); }
    fillTypes(); limits();
    $("#f-type").addEventListener("change", () => { limits(); scheduleCalc(); });
    ["#f-amount", "#f-tenure"].forEach((s) => $(s).addEventListener("input", scheduleCalc));
    $("#form").addEventListener("submit", review);
    $("#loans").addEventListener("click", onLoanClick);
    A.$$(".tabs button").forEach((b) => b.addEventListener("click", () => selectTab(b.dataset.tab)));
    A.Voice.listen(onVoice);
    A.Voice.speak(A.t("loan.say"));
  });
})();
