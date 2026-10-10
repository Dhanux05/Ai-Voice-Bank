/* txflow.js - the safe two-step money flow used by withdraw, transfer, loan and EMI payments.
   1) preview -> server validates, scores the risk, issues a one-time confirmation token
   2) review sheet (risk banner, spoken summary) -> PIN (+ tick if high risk) -> confirm */
(function () {
  const App = (window.App = window.App || {});
  const E = App.esc;
  const money = (n) => App.ui.money(n);
  const words = (n) => App.Words.money(n, App.getLang());

  function rows(kind, s) {
    const t = App.t, r = [];
    const kv = (k, v) => r.push("<dt>" + E(k) + "</dt><dd class=\"num\">" + E(v) + "</dd>");
    if (kind === "transfer") kv(t("tx.to"), s.to_name + " · " + s.to_phone_masked);
    if (kind === "loan_apply") { kv(t("tx.loan"), App.ui.loanName(s.loan_type)); kv(t("tx.rate"), s.interest_rate + "%"); kv(t("tx.tenure"), t("tx.months", { n: s.tenure_months })); kv(t("tx.emi"), money(s.emi)); }
    if (kind === "loan_pay") { kv(t("tx.loan"), App.ui.loanName(s.loan_name)); kv(t("tx.interest"), money(s.interest_component)); kv(t("tx.principal"), money(s.principal_component)); kv(t("tx.outstanding"), money(s.outstanding_after)); }
    kv(t("tx.amount"), money(s.amount));
    if (kind !== "loan_apply" || s.balance_after != null) kv(t("tx.after"), money(s.balance_after));
    return '<dl class="kv">' + r.join("") + "</dl>";
  }

  function spoken(kind, s) {
    const a = words(s.amount), after = words(s.balance_after);
    if (kind === "withdraw") return App.t("sp.withdraw", { amount: a, after });
    if (kind === "transfer") return App.t("sp.transfer", { amount: a, name: s.to_name, last4: App.Words.digits(String(s.to_phone_masked).slice(-4)), after });
    if (kind === "loan_apply") return App.t("sp.loan_apply", { loan: App.ui.loanName(s.loan_type), amount: a, months: App.Words.integer(s.tenure_months), emi: words(s.emi) });
    return App.t("sp.loan_pay", { loan: App.ui.loanName(s.loan_name), amount: a });
  }

  function riskBox(r) {
    const lv = r.level;
    const icon = lv === "low" ? "shield" : "alert";
    const list = lv === "low" ? "" : "<ul>" + r.reasons.map((c) => "<li>" + E(App.t("r." + c)) + "</li>").join("") + "</ul>";
    return '<div class="risk risk--' + lv + '" role="status"><b>' + App.icon(icon) + E(App.t("risk." + lv)) + "</b>" + list + "</div>";
  }

  function doneSpeech(result) {
    const k = result.kind, a = { after: words(result.balance_after) };
    if (k === "loan_apply") a.emi = words(result.emi);
    if (k === "loan_pay") { a.out = words(result.outstanding_after); }
    if (k === "loan_pay" && result.loan_status === "Closed") return App.t("sp.done.loan_closed");
    return App.t("sp.done." + k, a);
  }

  function showSuccess(result, titleKey, onDone, pageHandler) {
    const sheet = App.ui.sheet(
      '<div class="seal">' + App.icon("check") + '</div><h2 class="sheet__title">' + E(App.t(titleKey)) + "</h2>" +
      '<div class="sheet__big num">' + E(money(result.amount)) + "</div>" +
      '<dl class="kv"><dt>' + E(App.t("tx.after")) + '</dt><dd class="num">' + E(money(result.balance_after)) + "</dd>" +
      "<dt>" + E(App.t("tx.ref")) + '</dt><dd class="num small">' + E(result.transaction_id) + "</dd></dl>" +
      '<div class="actions"><button class="btn btn--ghost" id="tf-dl" type="button">' + App.icon("download") + E(App.t("download")) + "</button>" +
      '<button class="btn btn--primary" id="tf-done" type="button">' + E(App.t("done")) + "</button></div>",
      { escape: true, onClose: () => { App.Voice.stopSpeaking(); App.Voice.listen(pageHandler || null, false); if (onDone) onDone(result); } }
    );
    sheet.el.querySelector("#tf-dl").addEventListener("click", () => App.ui.downloadReceipt(result));
    sheet.el.querySelector("#tf-done").addEventListener("click", () => sheet.close());
    App.Voice.speak(doneSpeech(result));
    if (result.kind === "loan_pay" || result.kind === "loan_apply") App.ui.toast(App.t("tx.ok"), "ok");
  }

  /** run({kind, payload, titleKey, successKey, onDone}) -> shows review sheet; resolves when finished. */
  async function run(opts) {
    let pv;
    try { pv = await App.api.post("/api/tx/preview", Object.assign({ kind: opts.kind }, opts.payload)); }
    catch (e) { App.ui.toast(App.ui.errMsg(e), "error"); throw e; }

    const s = pv.summary, needAck = pv.requires_acknowledgement;
    const sheet = App.ui.sheet(
      '<h2 class="sheet__title">' + E(App.t("tx.review")) + "</h2>" +
      rows(opts.kind, s) + riskBox(pv.risk) +
      '<label class="field"><span class="field__label">' + E(App.t("tx.enterpin")) + '</span><input class="input input--pin" id="tf-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" aria-describedby="tf-err"></label>' +
      (needAck ? '<label class="check mt-2"><input type="checkbox" id="tf-ack"><span>' + E(App.t("risk.ack")) + "</span></label>" : "") +
      '<span class="field__error" id="tf-err" role="alert"></span>' +
      '<div class="actions actions--row"><button class="btn btn--ghost" id="tf-cancel" type="button">' + E(App.t("cancel")) + '</button><button class="btn btn--primary" id="tf-ok" type="button">' + E(App.t("confirm")) + "</button></div>",
      { escape: true, onClose: () => { App.Voice.stopSpeaking(); if (!finished && opts.onCancel) opts.onCancel(); App.Voice.listen(opts.pageHandler || null, false); } }
    );
    let finished = false;
    const el = sheet.el, pin = el.querySelector("#tf-pin"), ok = el.querySelector("#tf-ok"), err = el.querySelector("#tf-err"), ack = el.querySelector("#tf-ack");
    pin.addEventListener("input", () => { pin.value = pin.value.replace(/\D/g, "").slice(0, 4); err.textContent = ""; pin.removeAttribute("aria-invalid"); });
    el.querySelector("#tf-cancel").addEventListener("click", () => { App.Voice.say("sp.cancelled"); sheet.close(); });

    async function submit() {
      if (!/^\d{4}$/.test(pin.value)) { err.textContent = App.t("tx.pinfirst"); pin.setAttribute("aria-invalid", "true"); pin.focus(); return; }
      if (needAck && !ack.checked) { err.textContent = App.t("err.RISK_ACK_REQUIRED"); return; }
      await App.ui.busy(ok, async () => {
        try {
          const result = await App.api.post("/api/tx/confirm", { token: pv.token, pin: pin.value, acknowledge_risk: !!(ack && ack.checked) });
          finished = true;
          sheet.close();
          if (result.balance_after != null && App.session.account()) { const a = App.session.account(); a.balance = result.balance_after; App.session.setAccount(a); }
          showSuccess(result, opts.successKey || "tx.ok", opts.onDone, opts.pageHandler);
        } catch (e) {
          err.textContent = App.ui.errMsg(e);
          if (e.code === "INVALID_PIN" || e.code === "RISK_ACK_REQUIRED") { pin.value = ""; pin.setAttribute("aria-invalid", "true"); pin.focus(); }
          else if (["TOKEN_EXPIRED", "TOKEN_USED", "TOKEN_INVALID", "INSUFFICIENT_FUNDS", "ACCOUNT_LOCKED", "AMOUNT_EXCEEDS_DUE", "LOAN_CLOSED"].includes(e.code)) {
            finished = true; sheet.close(); App.ui.toast(App.ui.errMsg(e), "error"); if (opts.onDone) opts.onDone(null, e);
          }
          App.Voice.speak(App.ui.errMsg(e));
        }
      });
    }
    ok.addEventListener("click", submit);
    pin.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });

    // voice: "confirm" / "cancel" / "I understand" / PIN digits
    const understand = { en: ["understand"], hi: ["समझ"], kn: ["ಅರ್ಥ"] }[App.getLang()];
    App.Voice.listen((text) => {
      if (!document.body.contains(el)) return;
      if (App.Voice.is(text, "no")) { App.Voice.say("sp.cancelled"); sheet.close(); return; }
      if (understand.some((w) => text.toLowerCase().includes(w)) && ack) { ack.checked = true; return; }
      const d = App.Words.spokenDigits(text, App.getLang());
      if (/^\d{4}$/.test(d)) { pin.value = d; err.textContent = ""; return; }
      if (App.Voice.is(text, "yes")) submit();
    }, true);

    const intro = [spoken(opts.kind, s)];
    if (pv.risk.level === "medium") intro.push(App.t("sp.risk.medium"));
    if (pv.risk.level === "high") intro.push(App.t("sp.risk.high"));
    intro.push(App.t("tx.say.pin"));
    App.Voice.speak(intro.join(" "));
  }

  App.TxFlow = { run, success: showSuccess };
})();
