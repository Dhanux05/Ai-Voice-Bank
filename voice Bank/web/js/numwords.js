/* numwords.js - numbers and money as WORDS in English / Hindi / Kannada (Indian system: thousand, lakh, crore).
   Used so spoken amounts are in the SAME language as the voice (no English numerals inside Kannada speech). */
(function () {
  const App = (window.App = window.App || {});

  const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  const HI = ["शून्य", "एक", "दो", "तीन", "चार", "पाँच", "छह", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "तेरह", "चौदह", "पंद्रह", "सोलह", "सत्रह", "अठारह", "उन्नीस", "बीस", "इक्कीस", "बाईस", "तेईस", "चौबीस", "पच्चीस", "छब्बीस", "सत्ताईस", "अट्ठाईस", "उनतीस", "तीस", "इकतीस", "बत्तीस", "तैंतीस", "चौंतीस", "पैंतीस", "छत्तीस", "सैंतीस", "अड़तीस", "उनतालीस", "चालीस", "इकतालीस", "बयालीस", "तैंतालीस", "चौवालीस", "पैंतालीस", "छियालीस", "सैंतालीस", "अड़तालीस", "उनचास", "पचास", "इक्यावन", "बावन", "तिरपन", "चौवन", "पचपन", "छप्पन", "सत्तावन", "अट्ठावन", "उनसठ", "साठ", "इकसठ", "बासठ", "तिरसठ", "चौंसठ", "पैंसठ", "छियासठ", "सड़सठ", "अड़सठ", "उनहत्तर", "सत्तर", "इकहत्तर", "बहत्तर", "तिहत्तर", "चौहत्तर", "पचहत्तर", "छिहत्तर", "सतहत्तर", "अठहत्तर", "उन्यासी", "अस्सी", "इक्यासी", "बयासी", "तिरासी", "चौरासी", "पचासी", "छियासी", "सत्तासी", "अट्ठासी", "नवासी", "नब्बे", "इक्यानवे", "बानवे", "तिरानवे", "चौरानवे", "पंचानवे", "छियानवे", "सत्तानवे", "अट्ठानवे", "निन्यानवे"];

  const KN_1_19 = ["ಸೊನ್ನೆ", "ಒಂದು", "ಎರಡು", "ಮೂರು", "ನಾಲ್ಕು", "ಐದು", "ಆರು", "ಏಳು", "ಎಂಟು", "ಒಂಬತ್ತು", "ಹತ್ತು", "ಹನ್ನೊಂದು", "ಹನ್ನೆರಡು", "ಹದಿಮೂರು", "ಹದಿನಾಲ್ಕು", "ಹದಿನೈದು", "ಹದಿನಾರು", "ಹದಿನೇಳು", "ಹದಿನೆಂಟು", "ಹತ್ತೊಂಬತ್ತು"];
  const KN_TENS = ["", "", "ಇಪ್ಪತ್ತು", "ಮೂವತ್ತು", "ನಲವತ್ತು", "ಐವತ್ತು", "ಅರವತ್ತು", "ಎಪ್ಪತ್ತು", "ಎಂಬತ್ತು", "ತೊಂಬತ್ತು"];
  // stem used when a unit follows: ಇಪ್ಪತ್ತ + ೊಂದು = ಇಪ್ಪತ್ತೊಂದು
  const KN_STEM = ["", "", "ಇಪ್ಪತ್ತ", "ಮೂವತ್ತ", "ನಲವತ್ತ", "ಐವತ್ತ", "ಅರವತ್ತ", "ಎಪ್ಪತ್ತ", "ಎಂಬತ್ತ", "ತೊಂಬತ್ತ"];
  const KN_JOIN = ["", "ೊಂದು", "ೆರಡು", "ಮೂರು", "ನಾಲ್ಕು", "ೈದು", "ಾರು", "ೇಳು", "ೆಂಟು", "ೊಂಬತ್ತು"];
  const KN_HUNDREDS = ["", "ನೂರು", "ಇನ್ನೂರು", "ಮುನ್ನೂರು", "ನಾನೂರು", "ಐನೂರು", "ಆರುನೂರು", "ಏಳುನೂರು", "ಎಂಟುನೂರು", "ಒಂಬೈನೂರು"];

  const UNITS = {
    en: { hundred: "hundred", thousand: "thousand", lakh: "lakh", crore: "crore", rupee: "rupees", rupee1: "rupee", paise: "paise", and: "and", zero: "zero" },
    hi: { hundred: "सौ", thousand: "हज़ार", lakh: "लाख", crore: "करोड़", rupee: "रुपये", rupee1: "रुपया", paise: "पैसे", and: "और", zero: "शून्य" },
    kn: { hundred: "ನೂರು", thousand: "ಸಾವಿರ", lakh: "ಲಕ್ಷ", crore: "ಕೋಟಿ", rupee: "ರೂಪಾಯಿ", rupee1: "ರೂಪಾಯಿ", paise: "ಪೈಸೆ", and: "ಮತ್ತು", zero: "ಸೊನ್ನೆ" },
  };

  const DIGITS = {
    en: EN_ONES.slice(0, 10),
    hi: HI.slice(0, 10),
    kn: KN_1_19.slice(0, 10),
  };

  function below100(n, lang) {          // 0..99
    if (lang === "hi") return HI[n];
    if (lang === "kn") {
      if (n < 20) return KN_1_19[n];
      const t = Math.floor(n / 10), o = n % 10;
      return o === 0 ? KN_TENS[t] : KN_STEM[t] + KN_JOIN[o];
    }
    if (n < 20) return EN_ONES[n];
    const t = Math.floor(n / 10), o = n % 10;
    return o ? EN_TENS[t] + "-" + EN_ONES[o] : EN_TENS[t];
  }

  function below1000(n, lang) {          // 1..999
    const u = UNITS[lang];
    const h = Math.floor(n / 100), r = n % 100;
    const parts = [];
    if (h) {
      if (lang === "kn") parts.push(KN_HUNDREDS[h]);
      else parts.push(below100(h, lang), u.hundred);
    }
    if (r) parts.push(below100(r, lang));
    return parts.join(" ");
  }

  /** integer >= 0 -> words (Indian grouping). */
  function integer(n, lang) {
    lang = lang || App.getLang();
    n = Math.floor(Math.abs(n));
    if (n === 0) return UNITS[lang].zero;
    const u = UNITS[lang];
    const crore = Math.floor(n / 1e7);
    const lakh = Math.floor((n % 1e7) / 1e5);
    const thousand = Math.floor((n % 1e5) / 1e3);
    const rest = n % 1e3;
    const out = [];
    if (crore) out.push((crore >= 100 ? integer(crore, lang) : below100(crore, lang)), u.crore);
    if (lakh) out.push(below100(lakh, lang), u.lakh);
    if (thousand) out.push(below100(thousand, lang), u.thousand);
    if (rest) out.push(below1000(rest, lang));
    return out.join(" ");
  }

  /** 12500.5 -> "twelve thousand five hundred rupees and fifty paise" (in the chosen language). */
  function money(amount, lang) {
    lang = lang || App.getLang();
    const u = UNITS[lang];
    const total = Math.round(Math.abs(Number(amount) || 0) * 100);
    const rupees = Math.floor(total / 100);
    const paise = total % 100;
    let s = integer(rupees, lang) + " " + (rupees === 1 ? u.rupee1 : u.rupee);
    if (paise) s += " " + u.and + " " + below100(paise, lang) + " " + u.paise;
    return s;
  }

  /** "9876543210" -> digits spoken one by one in the language. */
  function digits(str, lang) {
    lang = lang || App.getLang();
    return String(str).replace(/\D/g, "").split("").map((d) => DIGITS[lang][+d]).join(" ");
  }

  /** Normalise Devanagari / Kannada numerals and spoken text to ASCII digits only. */
  function asciiDigits(text) {
    return String(text || "")
      .replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966))
      .replace(/[೦-೯]/g, (c) => String(c.charCodeAt(0) - 0x0ce6))
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  }

  const WORD_DIGITS = {
    en: { zero: 0, oh: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 },
    hi: { शून्य: 0, एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9 },
    kn: { ಸೊನ್ನೆ: 0, ಒಂದು: 1, ಎರಡು: 2, ಮೂರು: 3, ನಾಲ್ಕು: 4, ಐದು: 5, ಆರು: 6, ಏಳು: 7, ಎಂಟು: 8, ಒಂಬತ್ತು: 9 },
  };

  /** Extract only digits from a spoken phrase, understanding numerals AND spoken digit words. */
  function spokenDigits(text, lang) {
    lang = lang || App.getLang();
    const words = asciiDigits(text).toLowerCase().split(/[\s,.\-]+/);
    const map = Object.assign({}, WORD_DIGITS.en, WORD_DIGITS[lang] || {});
    let out = "";
    for (const w of words) {
      if (/^\d+$/.test(w)) out += w;
      else if (w in map) out += map[w];
    }
    return out;
  }

  /** Spoken amount -> number. Handles "5000", "5,000", "five thousand" (english words) best-effort. */
  function spokenAmount(text, lang) {
    const raw = asciiDigits(text).replace(/,/g, "");
    const m = raw.match(/\d+(?:\.\d+)?/);
    if (m) {
      let v = parseFloat(m[0]);
      if (/\b(lakh|lac|लाख|ಲಕ್ಷ)\b/i.test(raw)) v *= 100000;
      else if (/\b(thousand|हज़ार|हजार|ಸಾವಿರ)\b/i.test(raw)) v *= 1000;
      else if (/\b(crore|करोड़|ಕೋಟಿ)\b/i.test(raw)) v *= 1e7;
      return v;
    }
    return null;
  }

  App.Words = { integer, money, digits, asciiDigits, spokenDigits, spokenAmount, below100 };
})();
