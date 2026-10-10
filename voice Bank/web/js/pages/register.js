/* register.js - open an account (all languages), guided by voice, with Cancel. */
(function () {
  const A = App, $ = A.$;
  const F = {};
  const order = ["name", "phone", "pin", "pin2"];
  let step = 0;

  function setErr(id, msg) {
    const e = $("#e-" + id); if (e) e.textContent = msg || "";
    if (F[id]) { msg ? F[id].setAttribute("aria-invalid", "true") : F[id].removeAttribute("aria-invalid"); }
  }
  function validate() {
    let ok = true;
    order.forEach((k) => setErr(k, ""));
    const v = (k) => F[k].value.trim();
    if (v("name").length < 2 || /\d/.test(v("name"))) { setErr("name", A.t("err.INVALID_NAME")); ok = false; }
    if (!/^\d{10}$/.test(v("phone"))) { setErr("phone", A.t("err.INVALID_PHONE")); ok = false; }
    if (!/^\d{4}$/.test(v("pin"))) { setErr("pin", A.t("err.PIN_FORMAT")); ok = false; }
    else if (v("pin") !== v("pin2")) { setErr("pin2", A.t("reg.pinmatch")); ok = false; }
    return ok;
  }

  function prompt(i) {
    step = i;
    if (i >= order.length) { A.Voice.speak(A.t("reg.say.done")); return; }
    F[order[i]].focus({ preventScroll: false });
    A.Voice.speak(A.t("reg.say." + order[i]));
  }

  function onVoice(text) {
    if (A.Voice.is(text, "cmd.back") || A.Voice.is(text, "no")) { cancel(); return; }
    if (step >= order.length) { if (A.Voice.is(text, "yes")) $("#form").requestSubmit(); return; }
    const k = order[step], inp = F[k];
    if (k === "name") inp.value = text.replace(/[0-9०-९೦-೯]/g, "").replace(/\s+/g, " ").trim();
    else {
      const d = A.Words.spokenDigits(text, A.getLang());
      inp.value = d.slice(0, k === "phone" ? 10 : 4);
    }
    if (!inp.value) return;
    setErr(k, "");
    prompt(step + 1);
  }

  function cancel() {
    A.Voice.stopSpeaking();
    $("#form").reset();
    order.forEach((k) => setErr(k, ""));
    location.href = "index.html";
  }

  async function submit(ev) {
    ev.preventDefault();
    if (!validate()) return;
    const btn = $("#submit");
    await A.ui.busy(btn, async () => {
      try {
        const acc = await A.api.post("/api/auth/register", {
          full_name: F.name.value.trim(), phone: F.phone.value.trim(), pin: F.pin.value,
        }, { anon: true });
        $("#v-form").hidden = true; $("#v-ok").hidden = false;
        $("#ok-sub").textContent = A.t("reg.ok.sub", { acc: acc.account_number });
        window.scrollTo(0, 0);
        A.Voice.speak(A.t("reg.say.ok", { acc: A.Words.digits(acc.account_number) }));
        A.Voice.listen((t) => { if (A.Voice.is(t, "cmd.login") || A.Voice.is(t, "yes")) location.href = "login.html"; });
      } catch (e) {
        const map = { PHONE_EXISTS: "phone", INVALID_PHONE: "phone", INVALID_NAME: "name", PIN_FORMAT: "pin" };
        if (map[e.code]) setErr(map[e.code], A.ui.errMsg(e)); else A.ui.toast(A.ui.errMsg(e), "error");
        A.Voice.speak(A.ui.errMsg(e));
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!A.ui.boot({ title: "reg.title" })) return;
    order.forEach((k) => { F[k] = $("#f-" + k); F[k].addEventListener("focus", () => { step = order.indexOf(k); }); F[k].addEventListener("input", () => setErr(k, "")); });
    ["phone", "pin", "pin2"].forEach((k) => F[k].addEventListener("input", () => { F[k].value = F[k].value.replace(/\D/g, ""); }));
    $("#form").addEventListener("submit", submit);
    $("#cancel").addEventListener("click", cancel);
    $("#to-login").addEventListener("click", () => { location.href = "login.html"; });
    A.Voice.listen(onVoice);
    A.Voice.speak(A.t("reg.sub") + " " + A.t("reg.say.name")).then(() => { step = 0; });
  });
})();
