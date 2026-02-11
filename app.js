const appCard = document.getElementById("app-card");

const STORAGE_KEY = "arkadas_analiz_restart_count";

const questionBank = [
  {
    id: "sabah",
    question: "Sabah ilk yaptığın şey?",
    options: [
      { label: "Alarmı 4 kez erteleyip varoluşu sorgularım", value: "alarm", tags: ["procrastinator", "dramatic"] },
      { label: "Kahve olmadan insanlarla konuşmam", value: "kahve", tags: ["serious", "npc"] },
      { label: "Telefonu açıp meme bakarım", value: "meme", tags: ["chaotic", "social"] },
      { label: "Yatağı toplar, plan yaparım", value: "plan", tags: ["genius", "reliable"] },
    ],
  },
  {
    id: "cumle",
    question: "En çok kullandığın cümle?",
    options: [
      { label: "" + "Az sonra başlıyorum" + "", value: "azsonra", tags: ["procrastinator", "optimist"] },
      { label: "" + "Bence olay o kadar da derin değil" + "", value: "derin", tags: ["npc", "calm"] },
      { label: "" + "Bunu kimseye söyleme ama..." + "", value: "gizli", tags: ["dramatic", "social"] },
      { label: "" + "Sistem çöktü" + "", value: "sistem", tags: ["chaotic", "tech"] },
    ],
    freeText: true,
  },
  {
    id: "grup",
    question: "Grup chat'teki rolün?",
    options: [
      { label: "Sessiz izleyici (ama her şeyi okur)", value: "izleyici", tags: ["silent", "npc"] },
      { label: "Mizah departmanı", value: "mizah", tags: ["chaotic", "social"] },
      { label: "Organizasyon müdürü", value: "org", tags: ["reliable", "genius"] },
      { label: "Arada girip tansiyonu yükselten", value: "tansiyon", tags: ["dramatic", "chaotic"] },
    ],
  },
  {
    id: "stres",
    question: "Stres anında yaptığın saçmalık?",
    options: [
      { label: "Buzdolabını 7 kez açarım", value: "buzdolabi", tags: ["chaotic", "anxious"] },
      { label: "Her şeyi listeleyip yine başlamam", value: "liste", tags: ["procrastinator", "genius"] },
      { label: "Kendimle toplantı yaparım", value: "toplanti", tags: ["dramatic", "serious"] },
      { label: "" + "Sorun yok" + " deyip paniklerim", value: "sorunyok", tags: ["dramatic", "npc"] },
    ],
  },
  {
    id: "yetenek",
    question: "En gereksiz yeteneğin?",
    options: [
      { label: "USB'yi ilk seferde takamam", value: "usb", tags: ["npc", "chaotic"] },
      { label: "Dizi repliğini birebir taklit ederim", value: "replik", tags: ["dramatic", "social"] },
      { label: "3 saniyede uykuya geçerim", value: "uyku", tags: ["calm", "procrastinator"] },
      { label: "Bozuk şeyleri rastgele düzeltebilirim", value: "tamir", tags: ["genius", "reliable"] },
    ],
    freeText: true,
  },
  {
    id: "emoji",
    question: "Seni ele veren emoji?",
    options: [
      { label: "🤡", value: "clown", tags: ["chaotic", "dramatic"] },
      { label: "🫠", value: "melt", tags: ["anxious", "npc"] },
      { label: "😌", value: "calm", tags: ["calm", "silent"] },
      { label: "🧠", value: "brain", tags: ["genius", "serious"] },
    ],
  },
];

const state = {
  screen: "landing",
  name: "",
  currentIndex: 0,
  answers: [],
  restartCount: Number(localStorage.getItem(STORAGE_KEY) || 0),
  shutdownLocked: false,
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1000) / 1000;
  };
}

function getTagScores() {
  const scores = {};
  state.answers.forEach((answer) => {
    (answer.tags || []).forEach((tag) => {
      scores[tag] = (scores[tag] || 0) + 1;
    });
  });
  return scores;
}

function dominantTags(tagScores) {
  return Object.entries(tagScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((entry) => entry[0]);
}

function buildResult() {
  const answerSeed = JSON.stringify({ n: state.name, a: state.answers.map((x) => `${x.questionId}:${x.value}:${x.freeText || ""}`) });
  const random = seededRandom(hashString(answerSeed));
  const tags = getTagScores();
  const tops = dominantTags(tags);

  const metricRules = [
    {
      name: "Guvenilirlik",
      base: 42,
      plus: { reliable: 18, genius: 10, calm: 8 },
      minus: { chaotic: 12, dramatic: 8, procrastinator: 12 },
    },
    {
      name: "Drama Potansiyeli",
      base: 36,
      plus: { dramatic: 22, chaotic: 11, social: 9 },
      minus: { calm: 14, serious: 7 },
    },
    {
      name: "NPC Enerjisi",
      base: 28,
      plus: { npc: 23, silent: 12, calm: 7 },
      minus: { chaotic: 8, genius: 10, dramatic: 5 },
    },
  ];

  const metrics = metricRules.map((rule) => {
    let score = rule.base;
    Object.entries(rule.plus).forEach(([tag, weight]) => {
      score += (tags[tag] || 0) * weight;
    });
    Object.entries(rule.minus).forEach(([tag, weight]) => {
      score -= (tags[tag] || 0) * weight;
    });
    score += Math.floor(random() * 12) - 5;
    score = Math.max(5, Math.min(98, score));
    return { name: rule.name, value: score };
  });

  const verdictByTag = {
    chaotic: "Sınıf: Premium Kaos",
    dramatic: "Sınıf: Tiyatro CEO'su",
    procrastinator: "Sınıf: Üşengeç Dahi",
    genius: "Sınıf: Sessiz Beyin",
    npc: "Sınıf: Sessiz Tehlike",
    reliable: "Sınıf: Takım Sigortası",
  };

  const verdict = verdictByTag[tops[0]] || "Sınıf: Tatlı Bilinmez";

  const answerSnippets = state.answers
    .slice(0, 6)
    .filter((a, idx) => idx % 2 === 0)
    .slice(0, 3)
    .map((a) => a.displayLabel);

  const roastTemplates = {
    chaotic: `${state.name}, enerji seviyen deprem simülasyonu gibi. "${answerSnippets[0] || "Belirsiz hareket"}" tercihin ve genel tavrınla ekip seni hem çok seviyor hem de sessize alıyor.`,
    dramatic: `${state.name}, gündelik olayları sezon finaline çevirmede doğal yeteneğin var. "${answerSnippets[0] || "Bilinmeyen bir cümle"}" dedikten sonra bir de "${answerSnippets[1] || "plot twist"}" gelince ortam Oscar bekliyor.`,
    procrastinator: `${state.name}, potansiyelin net var ama başlangıç çizgisiyle duygusal bir mesafen var. "${answerSnippets[0] || "Az sonra"}" modun yüzünden görevler seni değil, sen görevleri ghost'luyorsun.`,
    genius: `${state.name}, beyin tarafı kuvvetli ama bunu bazen gizli görev gibi yaşıyorsun. "${answerSnippets[0] || "Gizemli seçim"}" cevabın, plansız görünen planlı bir ajana işaret ediyor.`,
    npc: `${state.name}, dışarıdan sakin görünüyorsun ama log kayıtlarında her şey var. "${answerSnippets[0] || "Sakin seçim"}" çizgin güvenli ama bir anda "${answerSnippets[1] || "beklenmedik hamle"}" açabiliyorsun.`,
  };

  const roast = roastTemplates[tops[0]] || `${state.name}, analiz sonucu: tatlı bir kaosla düzen arasında gidip gelen premium bir karaktersin.`;

  return { metrics, verdict, roast };
}

function encodePayload() {
  const compact = {
    n: state.name,
    a: state.answers.map((a) => ({ q: a.questionId, v: a.value, t: a.freeText || "" })),
  };
  return btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
}

function decodePayload(raw) {
  try {
    const json = decodeURIComponent(escape(atob(raw)));
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

function reconstructFromPayload(payload) {
  if (!payload || !payload.n || !Array.isArray(payload.a)) {
    return false;
  }

  const rebuilt = [];
  for (const q of questionBank) {
    const item = payload.a.find((x) => x.q === q.id);
    if (!item) {
      return false;
    }

    const matched = q.options.find((opt) => opt.value === item.v);
    if (matched) {
      rebuilt.push({
        questionId: q.id,
        value: matched.value,
        displayLabel: matched.label,
        tags: matched.tags,
        freeText: "",
      });
      continue;
    }

    if (item.v === "__other" && q.freeText) {
      const clean = String(item.t || "").trim();
      rebuilt.push({
        questionId: q.id,
        value: "__other",
        displayLabel: clean ? `Diğer: ${clean}` : "Diğer (detay vermedi)",
        tags: ["chaotic"],
        freeText: clean,
      });
      continue;
    }

    return false;
  }

  state.name = String(payload.n).slice(0, 50);
  state.answers = rebuilt;
  state.screen = "result";
  return true;
}

function renderLanding(errorText = "") {
  appCard.innerHTML = `
    <h1>Arkadaş Analiz Merkezi (Kesin Bilimsel)</h1>
    <p class="subtitle">İsmini yaz, sonra bilim kisvesi altında hafifçe dalgamızı geçelim.</p>

    <label for="nameInput">İsim</label>
    <input id="nameInput" type="text" maxlength="40" placeholder="Örn: Mert" value="${escapeHtml(state.name)}" />
    <div class="error">${escapeHtml(errorText)}</div>

    <div class="button-row">
      <button class="btn-primary" id="startBtn">Başla</button>
    </div>
    <p class="small">Bu uygulamayı ${state.restartCount} kere yeniden başlattın. Bu da bir başarı.</p>
  `;

  const nameInput = document.getElementById("nameInput");
  const startBtn = document.getElementById("startBtn");

  startBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name || name.length < 2) {
      renderLanding("İsim en az 2 karakter olsun, gizli ajan kodu gibi kalmasın.");
      return;
    }

    state.name = name;
    state.currentIndex = 0;
    state.answers = [];
    state.screen = "question";
    render();
  });
}

function renderQuestion(errorText = "") {
  const total = questionBank.length;
  const q = questionBank[state.currentIndex];
  const progressPct = ((state.currentIndex + 1) / total) * 100;
  const existing = state.answers.find((a) => a.questionId === q.id);

  const options = [...q.options];
  if (q.freeText) {
    options.push({ label: "Diğer (kendin yaz)", value: "__other", tags: ["chaotic"] });
  }

  const optionsHtml = options
    .map((opt) => {
      const checked = existing?.value === opt.value ? "checked" : "";
      return `
      <label class="option">
        <input type="radio" name="answer" value="${escapeHtml(opt.value)}" ${checked} />
        <span>${escapeHtml(opt.label)}</span>
      </label>
    `;
    })
    .join("");

  const otherVisible = existing?.value === "__other" ? "" : "style=\"display:none\"";

  appCard.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-top">
        <span>${escapeHtml(state.name)} için analiz</span>
        <span>${state.currentIndex + 1}/${total}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${progressPct}%"></div></div>
    </div>

    <h2>${escapeHtml(q.question)}</h2>
    <div class="option-grid">${optionsHtml}</div>

    ${
      q.freeText
        ? `<div id="otherWrap" ${otherVisible}><input id="otherInput" type="text" maxlength="60" placeholder="İstersen buraya yazabilirsin" value="${escapeHtml(existing?.freeText || "")}" /></div>`
        : ""
    }

    <div class="error">${escapeHtml(errorText)}</div>

    <div class="button-row">
      ${state.currentIndex > 0 ? '<button class="btn-secondary" id="prevBtn">Geri</button>' : ""}
      <button class="btn-primary" id="nextBtn">${state.currentIndex === total - 1 ? "Sonucu Göster" : "Devam"}</button>
    </div>
  `;

  const radios = Array.from(document.querySelectorAll('input[name="answer"]'));
  const otherWrap = document.getElementById("otherWrap");

  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (otherWrap) {
        otherWrap.style.display = radio.value === "__other" && radio.checked ? "block" : "none";
      }
    });
  });

  const prevBtn = document.getElementById("prevBtn");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      state.currentIndex -= 1;
      render();
    });
  }

  document.getElementById("nextBtn").addEventListener("click", () => {
    const selected = document.querySelector('input[name="answer"]:checked');
    if (!selected) {
      renderQuestion("Bir seçenek seç, teleskopla rastgele veri toplayamayız.");
      return;
    }

    const pickedValue = selected.value;
    const picked = q.options.find((opt) => opt.value === pickedValue);
    const otherInput = document.getElementById("otherInput");
    const freeText = pickedValue === "__other" ? (otherInput?.value || "").trim() : "";

    const answer = picked
      ? {
          questionId: q.id,
          value: picked.value,
          displayLabel: picked.label,
          tags: picked.tags,
          freeText: "",
        }
      : {
          questionId: q.id,
          value: "__other",
          displayLabel: freeText ? `Diğer: ${freeText}` : "Diğer (detay vermedi)",
          tags: ["chaotic"],
          freeText,
        };

    const existingIndex = state.answers.findIndex((a) => a.questionId === q.id);
    if (existingIndex >= 0) {
      state.answers[existingIndex] = answer;
    } else {
      state.answers.push(answer);
    }

    if (state.currentIndex === total - 1) {
      state.screen = "result";
      render();
      return;
    }

    state.currentIndex += 1;
    render();
  });
}

function renderResult() {
  const result = buildResult();

  const metricsHtml = result.metrics
    .map((m) => `<div class="metric"><strong>${escapeHtml(m.name)}:</strong> %${m.value}</div>`)
    .join("");

  appCard.innerHTML = `
    <h2>Analiz Tamamlandı: ${escapeHtml(state.name)}</h2>
    <div class="badge">${escapeHtml(result.verdict)}</div>
    <div class="metric-list">${metricsHtml}</div>
    <p>${escapeHtml(result.roast)}</p>
    <div class="notice" id="shareNotice"></div>
    <div class="button-row">
      <button class="btn-secondary" id="shareBtn">Arkadaşa Gönder (link kopyala)</button>
      <button class="btn-primary" id="closeBtn">Kapat</button>
    </div>
  `;

  document.getElementById("shareBtn").addEventListener("click", async () => {
    const payload = encodePayload();
    const url = `${window.location.origin}${window.location.pathname}?s=${encodeURIComponent(payload)}`;
    const notice = document.getElementById("shareNotice");

    try {
      await navigator.clipboard.writeText(url);
      notice.textContent = "Link kopyalandı. Arkadaşın da aynı bilimsel travmayı yaşayabilir.";
    } catch (err) {
      notice.textContent = "Kopyalama izni verilmedi. Linki adres çubuğundan paylaşabilirsin.";
    }
  });

  document.getElementById("closeBtn").addEventListener("click", () => {
    state.screen = "shutdown";
    state.shutdownLocked = false;
    render();

    setTimeout(() => {
      state.shutdownLocked = true;
      render();
    }, 2000);
  });
}

function restartApp() {
  state.restartCount += 1;
  localStorage.setItem(STORAGE_KEY, String(state.restartCount));
  state.screen = "landing";
  state.name = "";
  state.currentIndex = 0;
  state.answers = [];
  state.shutdownLocked = false;
  window.history.replaceState({}, "", window.location.pathname);
  render();
}

function renderShutdown() {
  if (!state.shutdownLocked) {
    appCard.innerHTML = `
      <div class="shutdown">
        <h2>Sistem Kapanıyor</h2>
        <div class="shutdown-screen">
          <p>Sistem kendini kapatıyor<span class="dot-anim"></span></p>
          <p>Çünkü seni daha fazla kaldıramadı.</p>
          <div class="shutdown-progress"><span></span></div>
          <p class="small">Lütfen bu sırada dramatik hareketlerden kaçının.</p>
        </div>
      </div>
    `;
    return;
  }

  appCard.innerHTML = `
    <div class="shutdown">
      <h2>Uygulama Kilitlendi</h2>
      <div class="shutdown-screen">
        <p>Bilim kurulu kısa devre yaptı.</p>
        <p>Bu uygulamayı ${state.restartCount} kere yeniden başlattın. Bu da bir başarı.</p>
      </div>
      <div class="button-row" style="justify-content:center;">
        <button class="btn-primary" id="restartBtn">Restart</button>
      </div>
    </div>
  `;

  document.getElementById("restartBtn").addEventListener("click", restartApp);
}

function render() {
  if (state.screen === "landing") {
    renderLanding();
    return;
  }

  if (state.screen === "question") {
    renderQuestion();
    return;
  }

  if (state.screen === "result") {
    renderResult();
    return;
  }

  renderShutdown();
}

(function init() {
  const params = new URLSearchParams(window.location.search);
  const shared = params.get("s");

  if (shared) {
    const payload = decodePayload(shared);
    if (reconstructFromPayload(payload)) {
      render();
      return;
    }
  }

  render();
})();
