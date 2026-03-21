(function () {
  if (window.__linguaLensInjected) {
    return;
  }

  window.__linguaLensInjected = true;

  const OVERLAY_ID = "lingualens-overlay";
  const FINAL_SUBTITLE_HOLD_MS = 3000;
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
    aime: ["like", "love"],
    aimer: ["like", "love"],
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
        segmentId: Number(message.segmentId) || 0
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

  ensureOverlay();

  function ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) {
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "lingualens-overlay lingualens-hidden";
    overlay.innerHTML = `
      <div class="lingualens-caption" aria-live="polite">
        <span class="lingualens-original"></span>
        <span class="lingualens-translation lingualens-hidden"></span>
      </div>
    `;

    document.documentElement.appendChild(overlay);
  }

  function updateSubtitle({ originalText, translatedText, isFinal, segmentId }) {
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
    const originalNode = overlay.querySelector(".lingualens-original");
    const translationNode = overlay.querySelector(".lingualens-translation");
    const caption = overlay.querySelector(".lingualens-caption");

    overlay.classList.remove("lingualens-hidden");
    caption.classList.toggle("lingualens-final", isFinal);

    if (isFinal && translatedText) {
      holdUntil = Date.now() + FINAL_SUBTITLE_HOLD_MS;
      renderAlignedSubtitlePair(originalNode, translationNode, originalText, translatedText);
      translationNode.classList.remove("lingualens-hidden");
    } else {
      if (isFinal) {
        holdUntil = Date.now() + FINAL_SUBTITLE_HOLD_MS;
      }

      renderPlainSubtitle(originalNode, originalText || "Listening...");
      translationNode.textContent = "";
      translationNode.classList.add("lingualens-hidden");
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
      span.className = token.type === "word" ? "lingualens-word" : "lingualens-punctuation";
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
    const frenchWords = frenchTokens.filter((token) => token.type === "word");
    const englishWords = englishTokens.filter((token) => token.type === "word");
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
      .replace(/(es|s)$/, "")
      .replace(/(ing|ed)$/, "");
  }

  function looksLikeCognate(word) {
    return word.length >= 5;
  }

  function showError(error) {
    const overlay = getOverlay();
    const originalNode = overlay.querySelector(".lingualens-original");
    const translationNode = overlay.querySelector(".lingualens-translation");
    const caption = overlay.querySelector(".lingualens-caption");

    overlay.classList.remove("lingualens-hidden");
    caption.classList.remove("lingualens-final");
    caption.classList.add("lingualens-error");
    renderPlainSubtitle(originalNode, `LinguaLens error: ${error}`);
    translationNode.textContent = "";
    translationNode.classList.add("lingualens-hidden");
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
    const caption = overlay.querySelector(".lingualens-caption");
    caption.classList.remove("lingualens-error");
    return overlay;
  }
})();
