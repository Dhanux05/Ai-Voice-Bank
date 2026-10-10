/* login.js - mobile number + PIN -> session. */
(function () {
  const A = App, $ = A.$;
  let step = 0;
  async function submit(ev) {
    ev.preventDefault();
    const phone = $("#f-phone").value.trim(), pin = $("#f-pin").value;
    $("#e-login").textContent = "";
    if (!/^\d{10}$/.test(phone)) { $("#e-login").textContent = A.t("err.INVALID_PHONE"); return; }
    if (!/^\d{4}$/.test(pin)) { $("#e-login").textContent = A.t("err.PIN_FORMAT"); return; }
    await A.ui.busy($("#submit"), async () => {
      try {
        const r = await A.api.post("/api/auth/login", { phone, pin }, { anon: true, noRedirect: true });
        A.session.set(r.token, r.account);
        const first = String(r.account.full_name).split(" ")[0];
        try { sessionStorage.setItem("avb_veil", "in"); } catch (e) { /* ignore */ }
        A.Voice.speak(A.t("login.say.ok", { name: first }));
        await A.ui.transition("in", r.account.full_name, 2100);
        location.href = "index.html";
      } catch (e) {
        $("#f-pin").value = "";
        $("#e-login").textContent = A.ui.errMsg(e);
        A.Voice.speak(A.ui.errMsg(e));
      }
    });
  }
  function onVoice(text) {
    if (A.Voice.is(text, "cmd.back")) { location.href = "index.html"; return; }
    const d = A.Words.spokenDigits(text, A.getLang());
    if (step === 0) {
      if (d.length >= 10) { $("#f-phone").value = d.slice(0, 10); step = 1; $("#f-pin").focus(); A.Voice.say("login.say.pin"); }
    } else if (/^\d{4}$/.test(d)) { $("#f-pin").value = d; $("#form").requestSubmit(); }
  }
  document.addEventListener("DOMContentLoaded", () => {
    if (!A.ui.boot({ title: "login.title" })) return;
    $("#f-phone").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); });
    $("#f-pin").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, ""); });
    $("#f-phone").addEventListener("focus", () => { step = 0; });
    $("#f-pin").addEventListener("focus", () => { step = 1; });
    $("#form").addEventListener("submit", submit);
    $("#cancel").addEventListener("click", () => { location.href = "index.html"; });
    A.Voice.listen(onVoice);
    A.Voice.speak(A.t("login.say.phone"));
  });
})();
