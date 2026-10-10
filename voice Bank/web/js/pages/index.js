/* index.js - splash -> language -> sign-in/register -> menu, all by tap or voice. */
(function () {
  const A = App, $ = A.$;
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } } };

  function show(name) {
    A.$$("[data-view]").forEach((s) => { s.hidden = s.dataset.view !== name; });
    A.ui.mountTopbar({ signout: true });
    window.scrollTo(0, 0);
  }
  const anyLang = (text, key) => A.LANGS.some((l) => A.Voice.matchAny(text, A.t(key, null, l)));

  function viewSplash() { show("splash"); }

  function viewLang() {
    show("lang");
    A.Voice.speak(A.t("lang.say"));
    A.Voice.listen((text) => {
      for (const l of A.LANGS) if (anyLang(text, "cmd.lang." + l)) return choose(l);
    });
  }
  function choose(l) {
    A.Voice.stopSpeaking();
    A.setLang(l);
    ss.set("avb_langok", "1");
    A.applyI18n();
    $(".chip-voice span") && ($(".chip-voice span").textContent = A.t("voice.tap"));
    A.Voice.prefetch(A.t("auth.say"));
    viewAuth();
  }

  function viewAuth() {
    show("auth");
    ss.set("avb_step", "auth");
    A.Voice.speak(A.t("auth.say"));
    A.Voice.listen((text) => {
      if (A.Voice.is(text, "cmd.register")) location.href = "register.html";
      else if (A.Voice.is(text, "cmd.login")) location.href = "login.html";
      else if (A.Voice.is(text, "cmd.back")) viewLang();
    });
  }

  const ROUTES = { deposit: "deposit.html", withdraw: "withdraw.html", balance: "balance.html", transfer: "transfer.html", loan: "loan.html" };
  function viewMenu() {
    show("menu");
    const acc = A.session.account() || {};
    const first = String(acc.full_name || "").split(" ")[0];
    $("#hello").textContent = A.t("menu.hello", { name: first });
    A.Voice.speak(A.t("menu.hello", { name: first }) + ". " + A.t("menu.say"));
    A.Voice.listen((text) => {
      if (A.Voice.is(text, "cmd.signout")) return A.ui.signOut();
      // check the more specific words first (a Kannada "withdraw" contains no deposit word, etc.)
      for (const k of ["withdraw", "deposit", "balance", "transfer", "loan"]) if (A.Voice.is(text, "cmd." + k)) { location.href = ROUTES[k]; return; }
    });
  }

  function init() {
    A.applyI18n();
    A.ui.revealIfPending();
    const seal = $(".splash__seal"); if (seal) seal.innerHTML = A.ui.logoMark();
    A.ui.mountTopbar({ signout: true });
    A.ui.mountMic();
    $("#begin").addEventListener("click", () => { A.Voice.unlock(); ss.set("avb_started", "1"); viewLang(); });
    A.$$("#v-lang .choice").forEach((b) => b.addEventListener("click", () => { A.Voice.unlock(); choose(b.dataset.l); }));
    $("#go-register").addEventListener("click", () => { location.href = "register.html"; });
    $("#go-login").addEventListener("click", () => { location.href = "login.html"; });
    $("#back-lang").addEventListener("click", viewLang);
    A.$$("#v-menu .tile").forEach((t) => t.addEventListener("click", () => { location.href = ROUTES[t.dataset.go]; }));

    if (A.session.active()) {
      A.api.get("/api/auth/me", { noRedirect: true }).then((a) => { A.session.setAccount(a); viewMenu(); }).catch(() => { A.session.clear(); viewSplash(); });
      viewMenu();
    } else if (ss.get("avb_step") === "auth" && ss.get("avb_langok")) viewAuth();
    else viewSplash();
    if (!A.Voice.supported()) setTimeout(() => A.ui.toast(A.t("voice.unsupported"), "info"), 900);
  }
  document.addEventListener("DOMContentLoaded", init);
})();
