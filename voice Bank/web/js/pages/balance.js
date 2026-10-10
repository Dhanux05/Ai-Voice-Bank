/* balance.js - balance card (amount also in words, in the chosen language) and paged history in every language. */
(function () {
  const A = App, $ = A.$, E = A.esc;
  const PAGE = 15;
  let offset = 0, total = 0, PIN = null;

  function iconFor(it) {
    if (it.type === "Transfer") return "transfer";
    if (it.type === "Withdrawal") return "withdraw";
    if (it.type === "Deposit") return "deposit";
    return "wallet";
  }
  function title(it) {
    if (it.type === "Transfer") {
      const who = it.counterparty_name || it.counterparty_masked || "";
      return A.t(it.direction === "out" ? "tx.out" : "tx.in", { name: who });
    }
    return A.t("tx." + it.type);
  }
  function row(it) {
    const sign = it.direction === "out" ? "−" : "+";
    return '<li class="tx tx--' + it.direction + '"><span class="tx__dot">' + A.icon(iconFor(it)) + '</span>' +
      '<div class="tx__main"><div class="tx__title">' + E(title(it)) + '</div><div class="tx__time">' + E(A.ui.date(it.timestamp)) + "</div></div>" +
      '<div class="tx__amt num"><b>' + sign + " " + E(A.ui.money(it.amount)) + '</b><span class="tx__bal">' + E(A.t("tx.bal")) + " " + E(A.ui.money(it.balance_after)) + "</span></div></li>";
  }

  async function loadMore(first) {
    const btn = $("#more");
    const data = await A.api.get("/api/transactions?limit=" + PAGE + "&offset=" + offset, { pin: PIN });
    total = data.total;
    if (first && !data.items.length) { $("#list").hidden = true; $("#empty").hidden = false; }
    else { $("#list").hidden = false; $("#empty").hidden = true; }
    $("#list").insertAdjacentHTML("beforeend", data.items.map(row).join(""));
    offset += data.items.length;
    btn.hidden = offset >= total;
  }

  async function init() {
    if (!A.ui.boot({ auth: true, title: "bal.title" })) return;
    $("#list").innerHTML = "";
    $("#more").addEventListener("click", (ev) => A.ui.busy(ev.currentTarget, () => loadMore(false).catch((e) => A.ui.toast(A.ui.errMsg(e), "error"))));
    // the PIN is asked every time this page is opened; nothing is shown before it is correct
    const got = await A.ui.pinSheet({ title: "pin.view", run: async (pin) => ({ pin, acc: await A.api.get("/api/balance", { pin }) }) });
    if (!got) { location.href = "index.html"; return; }
    PIN = got.pin;
    const acc = got.acc;
    try {
      A.session.setAccount(Object.assign({}, A.session.account(), { full_name: acc.full_name }));
      $("#amount").textContent = A.ui.money(acc.balance);
      const words = A.Words.money(acc.balance);
      $("#words").textContent = words;
      $("#holder").textContent = acc.full_name;
      $("#accno").textContent = acc.account_number;
      $("#phone").textContent = acc.phone || "—";
      $("#branch").textContent = acc.branch_name === "Main Branch" ? A.t("branch.main") : (acc.branch_name || "—");
      await loadMore(true);
      const first = String(acc.full_name).split(" ")[0];
      A.Voice.speak(A.t("bal.say", { name: first, words }));
    } catch (e) { A.ui.toast(A.ui.errMsg(e), "error"); }
    A.Voice.listen((t) => { if (A.Voice.is(t, "cmd.back")) location.href = "index.html"; });
  }
  document.addEventListener("DOMContentLoaded", init);
})();
