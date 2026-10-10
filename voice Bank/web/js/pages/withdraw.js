(function () {
  const A = App, $ = A.$;
  function onVoice(t) {
    if (A.Voice.is(t, "cmd.back")) { location.href = "index.html"; return; }
    const n = A.Words.spokenAmount(t, A.getLang());
    if (n) { $("#f-amount").value = String(n); $("#form").requestSubmit(); }
  }
  async function submit(ev) {
    ev.preventDefault();
    const raw = $("#f-amount").value.trim();
    $("#e-amount").textContent = "";
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(parseFloat(raw) > 0)) { $("#e-amount").textContent = A.t("err.INVALID_AMOUNT"); return; }
    await A.ui.busy($("#submit"), async () => {
      try {
        await A.TxFlow.run({ kind: "withdraw", payload: { amount: parseFloat(raw) }, pageHandler: onVoice, onDone: (r) => { if (r) $("#f-amount").value = ""; } });
      } catch (e) { $("#e-amount").textContent = A.ui.errMsg(e); A.Voice.speak(A.ui.errMsg(e)); }
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (!A.ui.boot({ auth: true, title: "wd.title" })) return;
    $("#form").addEventListener("submit", submit);
    A.Voice.listen(onVoice);
    A.Voice.speak(A.t("wd.say"));
  });
})();
