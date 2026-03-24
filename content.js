(function () {
  if (window.__LexiconAIInjected) {
    return;
  }

  window.__LexiconAIInjected = true;

  const OVERLAY_ID = "LexiconAI-overlay";
  const FINAL_SUBTITLE_HOLD_MS = 3000;
  const DEFAULT_UI_SETTINGS = {
    captionSize: 24,
    captionOpacity: 84,
    textColor: "white",
    position: "bottom",
    fontStyle: "normal",
    textShadow: "none"
  };
  const WORD_MATCH_COLORS = [
    "#7dd3fc",
    "#86efac",
    "#fdba74",
    "#c4b5fd",
    "#f9a8d4",
    "#fcd34d",
    "#67e8f9",
    "#bef264"
  ];
  const MIN_ALIGNMENT_COVERAGE = 0.2;
  const MIN_CONTENT_WORD_LENGTH = 4;
  const FRENCH_STOP_WORDS = new Set([
    "a",
    "ai",
    "as",
    "au",
    "aux",
    "ce",
    "ces",
    "cette",
    "d",
    "de",
    "des",
    "du",
    "elle",
    "en",
    "es",
    "est",
    "et",
    "il",
    "ils",
    "je",
    "j",
    "la",
    "le",
    "les",
    "leur",
    "lui",
    "ma",
    "mes",
    "mon",
    "ne",
    "nous",
    "on",
    "ou",
    "pas",
    "pour",
    "qu",
    "que",
    "qui",
    "sa",
    "se",
    "ses",
    "son",
    "sont",
    "sur",
    "te",
    "tes",
    "toi",
    "tu",
    "un",
    "une",
    "vos",
    "votre",
    "vous",
    "y",
    "bonjour",
    "salut",
    "bonsoir",
    "merci",
    "revoir"
  ]);
  const ENGLISH_STOP_WORDS = new Set([
    "a",
    "am",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "he",
    "her",
    "him",
    "i",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "or",
    "our",
    "she",
    "that",
    "the",
    "their",
    "them",
    "they",
    "this",
    "to",
    "us",
    "we",
    "with",
    "you",
    "your",
    "bye",
    "goodbye",
    "hello",
    "hi",
    "thanks",
    "thank",
    "thankyou"
  ]);

  // Lightweight French -> English hints for MVP word matching.
  const FR_TO_EN_HINTS = {
    bonjour: ["hello", "hi"],
    salut: ["hi", "hello"],
    je: ["i"],
    j: ["i"],
    moi: ["me", "i"],
    tu: ["you"],
    vous: ["you"],
    il: ["he", "it"],
    elle: ["she", "her"],
    nous: ["we", "us"],
    ils: ["they"],
    elles: ["they"],
    suis: ["am"],
    es: ["are"],
    est: ["is"],
    sommes: ["are"],
    etes: ["are"],
    sont: ["are"],
    ai: ["have"],
    as: ["have"],
    a: ["has", "have"],
    avons: ["have"],
    avez: ["have"],
    ont: ["have"],
    le: ["the"],
    la: ["the"],
    les: ["the"],
    un: ["a", "an"],
    une: ["a", "an"],
    des: ["some", "the"],
    du: ["some", "of"],
    de: ["of"],
    d: ["of"],
    et: ["and"],
    ou: ["or"],
    mais: ["but"],
    dans: ["in"],
    sur: ["on"],
    sous: ["under"],
    avec: ["with"],
    pour: ["for"],
    sans: ["without"],
    en: ["in"],
    ici: ["here"],
    la_bas: ["there"],
    oui: ["yes"],
    non: ["no"],
    merci: ["thanks", "thank", "thankyou"],
    beaucoup: ["much", "lot", "very"],
    tres: ["very"],
    bien: ["well", "good"],
    mal: ["bad", "poorly"],
    homme: ["man"],
    femme: ["woman"],
    garcon: ["boy"],
    fille: ["girl"],
    ami: ["friend"],
    amie: ["friend"],
    maison: ["house", "home"],
    voiture: ["car"],
    ecole: ["school"],
    etudiant: ["student"],
    etudiante: ["student"],
    professeur: ["teacher", "professor"],
    livre: ["book"],
    chien: ["dog"],
    chat: ["cat"],
    eau: ["water"],
    pain: ["bread"],
    fromage: ["cheese"],
    temps: ["time", "weather"],
    aujourdhui: ["today"],
    demain: ["tomorrow"],
    hier: ["yesterday"],
    maintenant: ["now"],
    pourquoi: ["why"],
    comment: ["how"],
    quand: ["when"],
    ou_est: ["where"],
    qui: ["who"],
    quoi: ["what"],
    parle: ["speak", "speaks", "talk"],
    parler: ["speak", "talk"],
    parlerai: ["speak"],
    apprendre: ["learn"],
    apprends: ["learn"],
    apprenons: ["learn"],
    aime: ["like", "love"],
    aimes: ["like", "love"],
    aimer: ["like", "love"],
    appelles: ["call", "called", "name"],
    appelle: ["call", "called", "name"],
    appeler: ["call", "name"],
    pose: ["ask"],
    poser: ["ask"],
    question: ["question"],
    peux: ["can"],
    peut: ["can"],
    faire: ["do"],
    weekend: ["weekend"],
    joli: ["pretty", "nice"],
    prenom: ["name"],
    enchante: ["nice", "pleased"],
    lire: ["read"],
    regarder: ["watch"],
    television: ["television", "tv"],
    dormir: ["sleep"],
    voir: ["see"],
    amis: ["friends"],
    francais: ["french"],
    aller: ["go"],
    vais: ["go", "going"],
    va: ["go", "goes"],
    vont: ["go"],
    venir: ["come"],
    viens: ["come"],
    vient: ["comes", "come"],
    petit: ["small", "little"],
    grand: ["big", "large", "tall"]
  };

  let currentSegmentId = 0;
  let holdUntil = 0;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
      return false;
    }

    if (message.type === "SHOW_OVERLAY") {
      ensureOverlay();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "UPDATE_SUBTITLE") {
      updateSubtitle({
        originalText: message.originalText || "",
        translatedText: message.translatedText || "",
        isFinal: Boolean(message.isFinal),
        segmentId: Number(message.segmentId) || 0,
        sourceLanguage: message.sourceLanguage || "fr"
      });
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "HIDE_OVERLAY") {
      hideOverlay();
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === "SHOW_ERROR") {
      showError(message.error || "Unknown error");
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (!changes.captionSize && !changes.captionOpacity && !changes.textColor &&
        !changes.position && !changes.fontStyle && !changes.textShadow) {
      return;
    }

    applyStoredSettings();
  });

  ensureOverlay();
  applyStoredSettings();

  function ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "LexiconAI-overlay LexiconAI-hidden";
    overlay.innerHTML = `
      <div class="LexiconAI-caption" aria-live="polite">
        <span class="LexiconAI-original"></span>
        <span class="LexiconAI-translation LexiconAI-hidden"></span>
      </div>
    `;

    document.documentElement.appendChild(overlay);
  }

  async function applyStoredSettings() {
    try {
      const stored = await chrome.storage.local.get(DEFAULT_UI_SETTINGS);
      applyOverlaySettings({
        captionSize: Number(stored.captionSize) || DEFAULT_UI_SETTINGS.captionSize,
        captionOpacity: Number(stored.captionOpacity) || DEFAULT_UI_SETTINGS.captionOpacity
      });
    } catch (error) {
      console.warn("[LexiconAI] Failed to load UI settings", error);
      applyOverlaySettings(DEFAULT_UI_SETTINGS);
    }
  }

  function applyOverlaySettings(settings) {
    const overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      return;
    }

    const caption = overlay.querySelector(".LexiconAI-caption");
    const translation = overlay.querySelector(".LexiconAI-translation");

    if (!caption || !translation) {
      return;
    }

    const captionSize = clamp(settings.captionSize, 18, 40);
    const captionOpacity = clamp(settings.captionOpacity, 50, 100) / 100;
    const translationSize = Math.max(15, Math.round(captionSize * 0.75));
    const textColor = settings.textColor || "white";
    const position = settings.position || "bottom";
    const fontStyle = settings.fontStyle || "normal";
    const textShadow = settings.textShadow || "none";

    // Font size and opacity
    caption.style.fontSize = `${captionSize}px`;
    caption.style.background = `rgba(15, 23, 42, ${captionOpacity})`;
    translation.style.fontSize = `${translationSize}px`;

    // Text color
    const colorMap = {
      white: "#ffffff",
      yellow: "#fef08a",
      cyan: "#06b6d4",
      lime: "#84cc16"
    };
    const mappedColor = colorMap[textColor] || "#ffffff";
    caption.style.color = mappedColor;

    // Position
    const positionMap = {
      bottom: { bottom: "32px", top: "auto" },
      middle: { bottom: "50%", top: "50%", transform: "translateX(-50%) translateY(50%)" },
      top: { bottom: "auto", top: "32px" }
    };
    const pos = positionMap[position] || positionMap.bottom;
    if (position === "middle") {
      overlay.style.bottom = pos.bottom;
      overlay.style.top = pos.top;
      overlay.style.transform = pos.transform;
    } else {
      overlay.style.bottom = pos.bottom;
      overlay.style.top = pos.top;
      overlay.style.transform = "translateX(-50%)";
    }

    // Font weight
    caption.style.fontWeight = fontStyle === "bold" ? "700" : "400";

    // Text shadow
    const shadowMap = {
      none: "none",
      light: "0 2px 8px rgba(0, 0, 0, 0.5)",
      strong: "0 4px 16px rgba(0, 0, 0, 0.8), 2px 2px 0 rgba(0, 0, 0, 0.6)"
    };
    caption.style.textShadow = shadowMap[textShadow] || "none";
  }

  function updateSubtitle({ originalText, translatedText, isFinal, segmentId, sourceLanguage }) {
    if (segmentId && segmentId < currentSegmentId) {
      return;
    }

    if (!isFinal && Date.now() < holdUntil) {
      return;
    }

    if (segmentId) {
      currentSegmentId = segmentId;
    }

    const overlay = getOverlay();
    const originalNode = overlay.querySelector(".LexiconAI-original");
    const translationNode = overlay.querySelector(".LexiconAI-translation");
    const caption = overlay.querySelector(".LexiconAI-caption");

    overlay.classList.remove("LexiconAI-hidden");
    caption.classList.toggle("LexiconAI-final", isFinal);

    if (isFinal && translatedText) {
      holdUntil = Date.now() + FINAL_SUBTITLE_HOLD_MS;
      if ((sourceLanguage || "fr") === "fr") {
        renderAlignedSubtitlePair(originalNode, translationNode, originalText, translatedText);
      } else {
        renderPlainSubtitle(originalNode, originalText || "Listening...");
        renderPlainSubtitle(translationNode, translatedText);
      }
      translationNode.classList.remove("LexiconAI-hidden");
    } else {
      if (isFinal) {
        holdUntil = Date.now() + FINAL_SUBTITLE_HOLD_MS;
      }

      renderPlainSubtitle(originalNode, originalText || "Listening...");
      translationNode.textContent = "";
      translationNode.classList.add("LexiconAI-hidden");
    }
  }

  function renderAlignedSubtitlePair(originalNode, translationNode, frenchText, englishText) {
    const frenchTokens = tokenizeText(frenchText || "Listening...");
    const englishTokens = tokenizeText(englishText || "");
    const alignments = buildWordAlignments(frenchTokens, englishTokens);
    const colored = colorizeAlignments(frenchTokens, englishTokens, alignments);

    renderTokens(originalNode, frenchTokens, colored.frenchColors);
    renderTokens(translationNode, englishTokens, colored.englishColors);
  }

  function renderPlainSubtitle(node, text) {
    const tokens = tokenizeText(text);
    renderTokens(node, tokens, {});
  }

  function renderTokens(node, tokens, colorMap) {
    node.textContent = "";

    for (const token of tokens) {
      if (token.type === "space") {
        node.appendChild(document.createTextNode(token.value));
        continue;
      }

      const span = document.createElement("span");
      span.className = token.type === "word" ? "LexiconAI-word" : "LexiconAI-punctuation";
      span.textContent = token.value;

      if (token.type === "word" && colorMap[token.index]) {
        span.style.color = colorMap[token.index];
      }

      node.appendChild(span);
    }
  }

  function tokenizeText(text) {
    const pieces = text.match(/(\s+|[A-Za-zÀ-ÿ0-9]+(?:['’-][A-Za-zÀ-ÿ0-9]+)*|[^\sA-Za-zÀ-ÿ0-9])/g) || [];
    let wordIndex = 0;

    return pieces.map((piece) => {
      if (/^\s+$/.test(piece)) {
        return { type: "space", value: piece };
      }

      if (/[A-Za-zÀ-ÿ0-9]/.test(piece)) {
        const normalized = normalizeWord(piece);
        return {
          type: "word",
          value: piece,
          index: wordIndex++,
          normalized,
          stem: stemWord(normalized)
        };
      }

      return { type: "punctuation", value: piece };
    });
  }

  function buildWordAlignments(frenchTokens, englishTokens) {
    const frenchWords = frenchTokens.filter((token) => token.type === "word" && shouldHighlightFrenchWord(token));
    const englishWords = englishTokens.filter((token) => token.type === "word" && shouldHighlightEnglishWord(token));
    const usedEnglish = new Set();
    const alignments = [];

    // Keep this heuristic simple for the MVP: dictionary hints first, then stem/cognate fallback.
    for (const frenchWord of frenchWords) {
      const englishWord = findBestEnglishMatch(frenchWord, englishWords, usedEnglish);

      if (!englishWord) {
        continue;
      }

      usedEnglish.add(englishWord.index);
      alignments.push({
        fr: [frenchWord.index],
        en: [englishWord.index]
      });
    }

    ensureMinimumCoverage(frenchWords, englishWords, alignments, usedEnglish);

    return alignments;
  }

  function findBestEnglishMatch(frenchWord, englishWords, usedEnglish) {
    const candidates = getEnglishCandidates(frenchWord.normalized, frenchWord.stem);

    for (const englishWord of englishWords) {
      if (usedEnglish.has(englishWord.index)) {
        continue;
      }

      if (candidates.has(englishWord.normalized) || candidates.has(englishWord.stem)) {
        return englishWord;
      }
    }

    if (looksLikeCognate(frenchWord.normalized)) {
      for (const englishWord of englishWords) {
        if (usedEnglish.has(englishWord.index)) {
          continue;
        }

        if (englishWord.stem && englishWord.stem === frenchWord.stem) {
          return englishWord;
        }
      }
    }

    return null;
  }

  function getEnglishCandidates(normalizedFrench, frenchStem) {
    const candidates = new Set([normalizedFrench, frenchStem]);
    const hintKeys = [normalizedFrench, frenchStem, normalizedFrench.replace(/'/g, "_")];

    for (const key of hintKeys) {
      const hinted = FR_TO_EN_HINTS[key];

      if (!hinted) {
        continue;
      }

      for (const value of hinted) {
        const normalized = normalizeWord(value);
        candidates.add(normalized);
        candidates.add(stemWord(normalized));
      }
    }

    return candidates;
  }

  function colorizeAlignments(frenchTokens, englishTokens, alignments) {
    const frenchColors = {};
    const englishColors = {};

    alignments.forEach((alignment, groupIndex) => {
      const color = WORD_MATCH_COLORS[groupIndex % WORD_MATCH_COLORS.length];

      alignment.fr.forEach((index) => {
        frenchColors[index] = color;
      });

      alignment.en.forEach((index) => {
        englishColors[index] = color;
      });
    });

    return { frenchColors, englishColors };
  }

  function normalizeWord(word) {
    return word
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9']/g, "");
  }

  function stemWord(word) {
    return word
      .replace(/^(l|d|j|qu|c|n|s|m|t)'/, "")
      .replace(/(aient|ions|iez|erai|eras|era|erons|erez|eront|ons|ent|ez|er|ir|re)$/, "")
      .replace(/(es|s)$/, "")
      .replace(/(ing|ed)$/, "");
  }

  function looksLikeCognate(word) {
    return word.length >= 5;
  }

  function shouldHighlightFrenchWord(token) {
    return shouldHighlightWord(token.normalized, FRENCH_STOP_WORDS);
  }

  function shouldHighlightEnglishWord(token) {
    return shouldHighlightWord(token.normalized, ENGLISH_STOP_WORDS);
  }

  function shouldHighlightWord(word, stopWords) {
    if (!word) {
      return false;
    }

    if (stopWords.has(word)) {
      return false;
    }

    return word.length >= MIN_CONTENT_WORD_LENGTH;
  }

  function ensureMinimumCoverage(frenchWords, englishWords, alignments, usedEnglish) {
    const minimumMatches = Math.ceil(Math.min(frenchWords.length, englishWords.length) * MIN_ALIGNMENT_COVERAGE);

    if (alignments.length >= minimumMatches || minimumMatches === 0) {
      return;
    }

    const usedFrench = new Set(alignments.flatMap((alignment) => alignment.fr));
    const unusedFrench = frenchWords.filter((word) => !usedFrench.has(word.index));
    const unusedEnglish = englishWords.filter((word) => !usedEnglish.has(word.index));
    const extraPairsNeeded = minimumMatches - alignments.length;

    for (let i = 0; i < extraPairsNeeded; i += 1) {
      const frenchWord = unusedFrench[i];
      const englishWord = unusedEnglish[i];

      if (!frenchWord || !englishWord) {
        break;
      }

      usedEnglish.add(englishWord.index);
      alignments.push({
        fr: [frenchWord.index],
        en: [englishWord.index]
      });
    }
  }

  function showError(error) {
    const overlay = getOverlay();
    const originalNode = overlay.querySelector(".LexiconAI-original");
    const translationNode = overlay.querySelector(".LexiconAI-translation");
    const caption = overlay.querySelector(".LexiconAI-caption");

    overlay.classList.remove("LexiconAI-hidden");
    caption.classList.remove("LexiconAI-final");
    caption.classList.add("LexiconAI-error");
    renderPlainSubtitle(originalNode, `LexiconAI error: ${error}`);
    translationNode.textContent = "";
    translationNode.classList.add("LexiconAI-hidden");
  }

  function hideOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);

    if (!overlay) {
      return;
    }

    currentSegmentId = 0;
    holdUntil = 0;
    overlay.remove();
  }

  function getOverlay() {
    ensureOverlay();
    const overlay = document.getElementById(OVERLAY_ID);
    const caption = overlay.querySelector(".LexiconAI-caption");
    caption.classList.remove("LexiconAI-error");
    return overlay;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
