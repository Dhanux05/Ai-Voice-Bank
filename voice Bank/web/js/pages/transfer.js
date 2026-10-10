(function () {
  const A = App, $ = A.$;
  let step = 0;
  function onVoice(t) {
    if (A.Voice.is(t, "cmd.back")) { location.href = "index.html"; return; }
    if (step === 0) {
      const d = A.Words.spokenDigits(t, A.getLang());
      if (d.length >= 10) { $("#f-phone").value = d.slice(0, 10); step = 1; $("#f-amount").focus(); A.Voice.say("tr.say.amount"); }
    } else {
      const n = A.Words.spokenAmount(t, A.getLang());
      if (n) { $("#f-amount").value = String(n); $("#form").requestSubmit(); }
    }
  }
  async function submit(ev) {
    ev.preventDefault();
    const phone = $("#f-phone").value.trim(), raw = $("#f-amount").value.trim();
    $("#e-phone").textContent = ""; $("#e-amount").textContent = "";
    let bad = false;
    if (!/^\d{10}$/.test(phone)) { $("#e-phone").textContent = A.t("err.INVALID_PHONE"); bad = true; }
    if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(parseFloat(raw) > 0)) { $("#e-amount").textContent = A.t("err.INVALID_AMOUNT"); bad = true; }
    if (bad) return;
    await A.ui.busy($("#submit"), async () => {
      try {
        await A.TxFlow.run({ kind: "transfer", payload: { to_phone: phone, amount: parseFloat(raw) }, pageHandler: onVoice, onDone: (r) => { if (r) { $("#form").reset(); step = 0; } } });
      } catch (e) {
        const target = ["RECIPIENT_NOT_FOUND", "SELF_TRANSFER", "INVALID_PHONE"].includes(e.code) ? "#e-phone" : "#e-amount";
        $(target).textContent = A.ui.errMsg(e);
        A.Voice.speak(A.ui.errMsg(e));
      }
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (!A.ui.boot({ auth: true, title: "tr.title" })) return;
    $("#f-phone").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); });
    $("#f-phone").addEventListener("focus", () => { step = 0; });
    $("#f-amount").addEventListener("focus", () => { step = 1; });
    $("#form").addEventListener("submit", submit);
    A.Voice.listen(onVoice);
    A.Voice.speak(A.t("tr.say.to"));
  });
})();
