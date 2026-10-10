/* api.js - talks to the FastAPI backend. Errors always carry a stable `code` that the UI translates. */
(function () {
  const App = (window.App = window.App || {});

  // Same-origin when served by FastAPI (http://localhost:5000). If the page is opened from another dev server, point at :5000.
  const base = (function () {
    const h = location.hostname;
    const local = h === "localhost" || h === "127.0.0.1" || location.protocol === "file:";
    if (location.protocol === "file:" || (local && location.port && location.port !== "5000")) return "http://localhost:5000";
    return "";
  })();

  class ApiError extends Error {
    constructor(code, status, data) {
      super((data && data.message) || code);
      this.code = code;
      this.status = status;
      this.data = data || {};
    }
  }

  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  App.session = {
    token: () => store.get("avb_token"),
    account() { try { return JSON.parse(store.get("avb_acct") || "null"); } catch (e) { return null; } },
    set(token, account) { store.set("avb_token", token); store.set("avb_acct", JSON.stringify(account)); },
    setAccount(account) { store.set("avb_acct", JSON.stringify(account)); },
    clear() { store.del("avb_token"); store.del("avb_acct"); },
    active: () => !!store.get("avb_token"),
  };

  async function request(method, path, body, opts) {
    opts = opts || {};
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = opts.admin ? null : App.session.token();
    if (token && !opts.anon) headers.Authorization = "Bearer " + token;
    if (opts.admin) headers["X-Admin-Token"] = opts.admin;
    if (opts.pin) headers["X-Pin"] = opts.pin;

    let res;
    try {
      res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) {
      throw new ApiError("NETWORK", 0, {});
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const code = (data && data.code) || (res.status === 401 ? "UNAUTHORIZED" : "generic");
      const err = new ApiError(code, res.status, data);
      if (res.status === 401 && code === "UNAUTHORIZED" && !opts.admin) {
        App.session.clear();
        if (!opts.noRedirect) location.href = "index.html";
      }
      throw err;
    }
    return data;
  }

  App.api = {
    base,
    ApiError,
    get: (p, o) => request("GET", p, undefined, o),
    post: (p, b, o) => request("POST", p, b === undefined ? {} : b, o),
    put: (p, b, o) => request("PUT", p, b, o),
    del: (p, o) => request("DELETE", p, undefined, o),
    ttsUrl: (lang, text) => base + "/api/tts?lang=" + encodeURIComponent(lang) + "&text=" + encodeURIComponent(text),
  };
})();
