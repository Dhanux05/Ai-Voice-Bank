/* voice.js - speaking and listening.
   Speaking: neural voice from the server (/api/tts) first for Kannada & Hindi; browser voice only if it really
   exists in the SAME language. If neither can speak, the text is shown as a caption (never wrong-language audio).
   Listening: per-language SpeechRecognition that pauses while we speak and restarts itself. */
(function () {
  const App = (window.App = window.App || {});
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const V = (App.Voice = {
    supportsRecognition: !!SR,
    unlocked: false,
    speaking: false,
    wanted: false,           // user wants the mic on
    handler: null,
    pending: null,           // utterance blocked by autoplay policy, replayed after a tap
    onState: () => {},
  });

  /* ---------- helpers ---------- */
  function norm(s) { return String(s || "").toLowerCase().replace(/[.,!?।"']/g, " ").replace(/\s+/g, " ").trim(); }

  /** True if the spoken text contains any phrase of the list (word-boundary for latin, substring otherwise). */
  V.matchAny = function (text, list) {
    const t = norm(text);
    return (list || []).some((w) => {
      const p = norm(w);
      if (!p) return false;
      if (/^[a-z ]+$/.test(p)) return new RegExp("(^| )" + p + "( |$)").test(t);
      return t.includes(p);
    });
  };
  V.is = (text, key) => V.matchAny(text, App.t(key));

  const audio = new Audio();
  audio.preload = "auto";
  const blobCache = new Map();
  let serverDownUntil = 0;
  let current = null;       // {cancel()}

  /* ---------- unlocking (autoplay policy needs one user gesture per page) ---------- */
  V.unlock = function () {
    if (V.unlocked) return;
    V.unlocked = true;
    try {
      // a silent tiny wav primes the audio element inside the gesture
      audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0YQAAAAA=";
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
    try { window.speechSynthesis && window.speechSynthesis.getVoices(); } catch (e) { /* ignore */ }
    const pend = V.pending;
    V.pending = null;
    if (pend) V.speak(pend.text, pend.opts);
    if (V.wanted) startRec();
    V.onState();
  };
  ["pointerdown", "keydown", "touchstart"].forEach((ev) => window.addEventListener(ev, () => V.unlock(), { once: false, passive: true }));

  /* ---------- speaking ---------- */
  function browserVoice(lang) {
    if (!("speechSynthesis" in window)) return null;
    const want = App.speechLang(lang).toLowerCase();       // en-in / hi-in / kn-in
    const all = window.speechSynthesis.getVoices();
    return all.find((v) => v.lang.toLowerCase().replace("_", "-") === want) ||
           all.find((v) => v.lang.toLowerCase().startsWith(lang)) || null;
  }

  async function fetchServer(lang, text) {
    const key = lang + "|" + text;
    if (blobCache.has(key)) return blobCache.get(key);
    if (Date.now() < serverDownUntil) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 14000);
    try {
      const res = await fetch(App.api.ttsUrl(lang, text), { signal: ctl.signal });
      if (!res.ok) { if (res.status === 503) serverDownUntil = Date.now() + 60000; return null; }
      const url = URL.createObjectURL(await res.blob());
      blobCache.set(key, url);
      return url;
    } catch (e) {
      serverDownUntil = Date.now() + 30000;
      return null;
    } finally { clearTimeout(timer); }
  }

  V.prefetch = function (text, lang) { lang = lang || App.getLang(); if (lang !== "en") fetchServer(lang, text); };

  function playUrl(url) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => { if (done) return; done = true; audio.onended = audio.onerror = null; err ? reject(err) : resolve(); };
      audio.onended = () => finish();
      audio.onerror = () => finish(new Error("audio error"));
      current = { cancel() { try { audio.pause(); } catch (e) { /* ignore */ } finish(); } };
      audio.src = url;
      const p = audio.play();
      if (p && p.catch) p.catch((e) => finish(e));
    });
  }

  function speakBrowser(text, lang, voice) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang; u.rate = 0.95;
      let guard = setTimeout(() => resolve(true), Math.max(8000, text.length * 120));
      let ok = true;
      const end2 = () => { clearTimeout(guard); resolve(ok); };
      u.onend = end2;
      u.onerror = (e) => { ok = !(e && (e.error === "not-allowed" || e.error === "synthesis-failed")); end2(); };
      current = { cancel() { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } end2(); } };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }

  /** Speak text in the current (or given) language. Always shows a caption. Resolves when done. Never rejects. */
  V.speak = async function (text, opts) {
    opts = opts || {};
    const lang = opts.lang || App.getLang();
    if (!text) return;
    V.stopSpeaking();
    if (App.ui && App.ui.caption) App.ui.caption(text, "say");
    const token = {};
    V.speaking = true; V.token = token; V.onState();
    pauseRec();
    try {
      let played = false;
      const tryServer = async () => {
        const url = await fetchServer(lang, text);
        if (!url || V.token !== token) return false;
        try { await playUrl(url); return true; } catch (e) {
          if (e && e.name === "NotAllowedError") { V.unlocked = false; V.pending = { text, opts }; if (App.ui) App.ui.voiceChip(true); }
          return false;
        }
      };
      const tryBrowser = async () => {
        const v = browserVoice(lang);
        if (!v || V.token !== token) return false;
        const ok = await speakBrowser(text, lang, v);
        if (!ok) { V.unlocked = false; V.pending = { text, opts }; if (App.ui) App.ui.voiceChip(true); }
        return ok;
      };
      // Kannada / Hindi: neural server voice first. English: instant browser voice first.
      const order = lang === "en" ? [tryBrowser, tryServer] : [tryServer, tryBrowser];
      for (const fn of order) { if (await fn()) { played = true; break; } }
      if (!played && lang !== "en" && App.ui && App.ui.voiceNote) App.ui.voiceNote(lang);
    } finally {
      if (V.token === token) { V.speaking = false; V.token = null; current = null; V.onState(); setTimeout(resumeRec, 250); }
    }
  };
  V.say = (key, vars, opts) => V.speak(App.t(key, vars), opts);

  V.stopSpeaking = function () {
    V.token = null;
    if (current) { try { current.cancel(); } catch (e) { /* ignore */ } current = null; }
    try { audio.pause(); } catch (e) { /* ignore */ }
    V.speaking = false;
  };

  /* ---------- listening ---------- */
  let rec = null, recRunning = false, restartTimer = null, paused = false, denied = false;

  function startRec() {
    if (!SR || denied || recRunning || !V.wanted || V.speaking) return;
    if (!rec) {
      rec = new SR();
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      rec.onstart = () => { recRunning = true; V.onState(); };
      rec.onend = () => {
        recRunning = false; V.onState();
        if (V.wanted && !paused && !V.speaking) { clearTimeout(restartTimer); restartTimer = setTimeout(startRec, 350); }
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          denied = true; V.wanted = false; V.onState();
          if (App.ui) App.ui.toast(App.t("voice.nomic"), "error");
        }
      };
      rec.onresult = (ev) => {
        const res = ev.results[ev.results.length - 1];
        if (!res || !res.isFinal) return;
        const alts = Array.from(res).map((a) => a.transcript);
        const text = alts[0];
        if (App.ui) App.ui.caption(text, "heard");
        if (V.handler) { try { V.handler(text, alts); } catch (err) { console.error(err); } }
      };
    }
    rec.lang = App.speechLang(App.getLang());
    paused = false;
    try { rec.start(); } catch (e) { /* already started */ }
  }
  function pauseRec() { paused = true; clearTimeout(restartTimer); if (rec && recRunning) { try { rec.abort(); } catch (e) { /* ignore */ } } }
  function resumeRec() { paused = false; if (V.wanted) startRec(); }

  /** Register what happens with each spoken phrase. Turns the microphone on when voice is unlocked. */
  V.listen = function (handler, auto) {
    V.handler = handler;
    if (!SR) { return; }
    let remembered = false;
    try { remembered = localStorage.getItem("avb_mic") === "1"; } catch (e) { /* ignore */ }
    if (auto !== false && (V.unlocked || remembered)) { V.wanted = true; if (V.unlocked) startRec(); }
    V.onState();
  };
  V.setMic = function (on) {
    V.wanted = !!on;
    try { localStorage.setItem("avb_mic", on ? "1" : "0"); } catch (e) { /* ignore */ }
    if (on) { denied = false; V.unlock(); startRec(); } else { pauseRec(); }
    V.onState();
  };
  V.isListening = () => V.wanted && (recRunning || !!restartTimer);
  V.supported = () => !!SR;

  window.addEventListener("beforeunload", () => { try { rec && rec.abort(); window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } });
})();
