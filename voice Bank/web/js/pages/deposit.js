(function () {
  const A = App, $ = A.$;
  function amountVal() { const v = parseFloat($("#f-amount").value); return isFinite(v) ? v : NaN; }
  async function submit(ev) {
    ev.preventDefault();
    const amt = amountVal();
    $("#e-amount").textContent = "";
    if (!(amt > 0) || !/^\d+(\.\d{1,2})?$/.test($("#f-amount").value.trim())) { $("#e-amount").textContent = A.t("err.INVALID_AMOUNT"); return; }
    const r = await A.ui.pinSheet({ title: "tx.enterpin", pageHandler: onVoice, run: (pin) => A.api.post("/api/deposit", { amount: amt }, { pin }) });
    if (r) { $("#f-amount").value = ""; A.TxFlow.success(r, "dep.done", null, onVoice); }
  }
  function onVoice(t) {
    if (A.Voice.is(t, "cmd.back")) { location.href = "index.html"; return; }
    const n = A.Words.spokenAmount(t, A.getLang());
    if (n) { $("#f-amount").value = String(n); }
    else if (A.Voice.is(t, "yes")) $("#form").requestSubmit();
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (!A.ui.boot({ auth: true, title: "dep.title" })) return;
    $("#form").addEventListener("submit", submit);
    A.Voice.listen(onVoice);
    A.Voice.speak(A.t("dep.say"));
  });
})();
