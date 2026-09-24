<script>
const STORE_KEY = 'pathopro_v5_srs';
const DEFAULT_STORE = { xp: 0, level: 1, qStats: {} };
function loadStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : { ...DEFAULT_STORE };
  } catch (error) {
    localStorage.removeItem(STORE_KEY);
    return { ...DEFAULT_STORE };
  }
}
let store = loadStore();
if (!store.preferences) store.preferences = { theme: 'dark', mute: false };
if (!store.badges) store.badges = [];
if (!store.streak) store.streak = { lastDate: null, count: 0 };
if (typeof store.activeSession === 'undefined') store.activeSession = null;

const ALL_THEMES = ['dark','light','midnight','ocean','forest','sunset','rose'];

function applyPreferences() {
  // Remove all theme classes
  document.body.classList.remove('light-mode','theme-midnight','theme-ocean','theme-forest','theme-sunset','theme-rose');
  
  const theme = store.preferences.theme || 'dark';
  if (theme === 'light') document.body.classList.add('light-mode');
  else if (theme !== 'dark') document.body.classList.add('theme-' + theme);
  
  document.getElementById('btn-mute').innerText = store.preferences.mute ? '🔇' : '🔊';
  
  // Update active swatch in theme picker
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
  const activeIdx = ALL_THEMES.indexOf(theme);
  const swatches = document.querySelectorAll('.theme-swatch');
  if (swatches[activeIdx]) swatches[activeIdx].classList.add('active');
}

function openThemePicker() {
  document.getElementById('theme-modal-overlay').classList.add('active');
  applyPreferences(); // highlight current
}

function closeThemePicker(e) {
  if (e.target === document.getElementById('theme-modal-overlay')) {
    document.getElementById('theme-modal-overlay').classList.remove('active');
  }
}

function setTheme(theme) {
  store.preferences.theme = theme;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  applyPreferences();
  // Close modal after a brief moment so user sees the change
  setTimeout(() => document.getElementById('theme-modal-overlay').classList.remove('active'), 200);
}

function toggleTheme() {
  // Cycle through themes
  const current = store.preferences.theme || 'dark';
  const idx = ALL_THEMES.indexOf(current);
  store.preferences.theme = ALL_THEMES[(idx + 1) % ALL_THEMES.length];
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  applyPreferences();
}

function toggleMute() {
  store.preferences.mute = !store.preferences.mute;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  applyPreferences();
}

function playSound(type) {
  if (store.preferences.mute) return;
  try {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const mainGain = actx.createGain();
    mainGain.connect(actx.destination);
    
    if (type === 'correct') {
      // Premium Bell Chord (C5, E5, G5)
      const freqs = [523.25, 659.25, 783.99]; 
      freqs.forEach((freq, i) => {
        const osc = actx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const oscGain = actx.createGain();
        osc.connect(oscGain);
        oscGain.connect(mainGain);
        
        // Stagger the notes slightly and add a smooth exponential decay
        const t = actx.currentTime + (i * 0.04);
        oscGain.gain.setValueAtTime(0, t);
        oscGain.gain.linearRampToValueAtTime(0.15, t + 0.02);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        
        osc.start(t);
        osc.stop(t + 0.7);
      });
    } else {
      // Soft muted percussive thud for wrong answer
      const osc = actx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, actx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, actx.currentTime + 0.2);
      
      osc.connect(mainGain);
      mainGain.gain.setValueAtTime(0, actx.currentTime);
      mainGain.gain.linearRampToValueAtTime(0.3, actx.currentTime + 0.02);
      mainGain.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.25);
      
      osc.start(actx.currentTime);
      osc.stop(actx.currentTime + 0.3);
    }
  } catch(e){}
}

let state = {
  selectedSubjects: new Set(),
  selectedTopics: new Set(),
  selectedDiffs: new Set(),
  selectedSources: new Set(),
  showExp: true
};

let currentQuestions = [];
let currentQIndex = 0;
let currentBlockHistory = []; 
let blockCorrect = 0;
let blockWrong = 0;
let isTutorMode = true;
let isTimedMode = false;
let isMockExam = false;
let currentMockKey = null;
let selectedSize = 10;
let blockTimer;
let flaggedQuestions = new Set();
let currentFontSize = 0.94;


// CORE 4 SUBJECT DEFINITIONS
const FOUR_SUBJECTS = ["Pathology", "Community Med", "Ophthalmology", "ENT"];

const COMM_MED_SUBJS = [
  "community medicine", "smoking", "non-communicable disease", 
  "sexually transmitted diseases", "school health", "drug abuse", 
  "miscellaneous", "parasitology", "behavioural sciences", 
  "mental health", "accidents", "entomology", "hospital waste",
  "epidemiology", "biostatistics", "demography", "environment"
];

let subjectMap = {};
let accuracyChart = null;

const BADGE_DEFS = [
  { id: 'first_blood', name: 'First Blood', icon: '🩸' },
  { id: 'warming_up', name: 'Warming Up', icon: '🔥' },
  { id: 'century_maker', name: 'Century Maker', icon: '💯' },
  { id: 'path_scholar', name: 'Path Scholar', icon: '🔬' },
  { id: 'comm_scholar', name: 'Comm Scholar', icon: '🌍' },
  { id: 'ent_scholar', name: 'ENT Scholar', icon: '👂' },
  { id: 'eye_scholar', name: 'Eye Scholar', icon: '👁️' },
  { id: 'flawless', name: 'Flawless', icon: '⭐' },
  { id: 'night_owl', name: 'Night Owl', icon: '🦉' },
  { id: 'early_bird', name: 'Early Bird', icon: '🌅' },
  { id: 'speed_demon', name: 'Speed Demon', icon: '⚡' },
  { id: 'deep_thinker', name: 'Deep Thinker', icon: '🧠' },
  { id: 'marathoner', name: 'Marathoner', icon: '🏃' },
  { id: 'streak_3', name: '3-Day Streak', icon: '📅' },
  { id: 'streak_7', name: '7-Day Streak', icon: '🏆' }
];

function renderBadges() {
  const container = document.getElementById('badge-grid-container');
  if(!container) return;
  container.innerHTML = '';
  BADGE_DEFS.forEach(b => {
    const isUnlocked = store.badges.includes(b.id);
    container.innerHTML += `
      <div class="badge-item ${isUnlocked ? 'unlocked' : ''}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name}</div>
      </div>
    `;
  });
}

function checkBadges(event, data) {
  let newUnlock = false;
  const unlock = (id) => {
    if (!store.badges.includes(id)) {
      store.badges.push(id);
      newUnlock = true;
      showToast(`🏆 Badge Unlocked: ${BADGE_DEFS.find(b=>b.id===id).name}!`);
    }
  };

  if (event === 'answer') {
    let totalCorrect = 0, pathC = 0, commC = 0, entC = 0, eyeC = 0;
    for (let k in store.qStats) {
      const c = store.qStats[k].correct;
      totalCorrect += c;
      const subj = subjectMap[k];
      if (subj === 'Pathology') pathC += c;
      if (subj === 'Community Med') commC += c;
      if (subj === 'ENT') entC += c;
      if (subj === 'Ophthalmology') eyeC += c;
    }
    
    if (totalCorrect >= 1) unlock('first_blood');
    if (totalCorrect >= 50) unlock('warming_up');
    if (totalCorrect >= 100) unlock('century_maker');
    if (pathC >= 50) unlock('path_scholar');
    if (commC >= 50) unlock('comm_scholar');
    if (entC >= 50) unlock('ent_scholar');
    if (eyeC >= 50) unlock('eye_scholar');

    const hour = new Date().getHours();
    if (hour >= 0 && hour < 4) unlock('night_owl');
    if (hour >= 5 && hour < 8) unlock('early_bird');
    
    if (data && data.timeTaken < 5) unlock('speed_demon');
    if (data && data.timeTaken > 60) unlock('deep_thinker');
  }

  if (event === 'block_end') {
    if (data.accuracy === 100 && data.total >= 10) unlock('flawless');
    if (data.isMock && data.total === 120) unlock('marathoner');
  }

  if (newUnlock) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    renderBadges();
  }
}

function normalizeDatabase() {
  if (typeof masterDatabase === 'undefined' || !Array.isArray(masterDatabase)) {
    alert("CRITICAL ERROR: database.js file not found or contains a syntax error. Make sure database.js is in the same folder.");
    return;
  }

  masterDatabase.forEach((q, i) => {
    if (!q.id) q.id = "q_" + i;
    if (!q.options || q.options.length === 0) q.options = ["Option A", "Option B", "Option C", "Option D"];
    if (typeof q.correct !== 'number') q.correct = 0;
    if (!q.difficulty) q.difficulty = "Normal";
    if (!q.source) q.source = "Standard Bank";
    if (!q.explanation && !q.exp) q.explanation = "Review this key concept in your core textbook.";
    if (q.exp && !q.explanation) q.explanation = q.exp;

    // 4-Subject Engine Mapping
    const rawSubj = (q.subject || "").trim();
    const rawTopic = (q.topic || "").trim();
    const combined = (rawSubj + " " + rawTopic).toLowerCase();

    if (COMM_MED_SUBJS.some(s => combined.includes(s))) {
      q.subject = "Community Med";
      q.topic = rawTopic || (rawSubj.toLowerCase() === "community medicine" ? "General Comm Med" : rawSubj) || "General Comm Med";
    } else if (combined.includes("ent") || combined.includes("otolaryng") || combined.includes("otology") || combined.includes("rhinology") || combined.includes("laryngology") || combined.includes("larynx") || combined.includes("pharynx") || combined.includes("ear") || combined.includes("nose") || combined.includes("sinus") || combined.includes("tonsil") || combined.includes("mastoid") || combined.includes("tympan") || combined.includes("cochlea") || combined.includes("vestibul") || combined.includes("hearing") || combined.includes("deaf") || combined.includes("vertigo") || combined.includes("throat") || combined.includes("vocal cord") || combined.includes("nasal") || combined.includes("adenoid") || combined.includes("epiglot") || combined.includes("tracheostom")) {
      q.subject = "ENT";
      q.topic = rawTopic || (rawSubj && rawSubj !== "ENT" ? rawSubj : "General ENT");
    } else if (combined.includes("ophth") || combined.includes("opthal") || combined.includes("eye") || combined.includes("cornea") || combined.includes("cataract") || combined.includes("glaucoma")) {
      q.subject = "Ophthalmology";
      q.topic = rawTopic || (rawSubj && !rawSubj.toLowerCase().includes("ophth") ? rawSubj : "General Ophthalmology");
    } else {
      q.subject = "Pathology";
      q.topic = rawTopic || rawSubj || "General Pathology";
    }
    
    subjectMap[q.id] = q.subject;
  });
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

// Mock exams are stored as separate files so each test can be updated independently.
// The existing files use a JavaScript assignment despite their .json extension, so
// this loader extracts the array safely instead of executing the file as a script.
let mockTestsLoadPromise = null;
async function ensureMockTestsLoaded() {
  // 1. Bypass the fetch request if the mock test data is already loaded via database.js
  if (typeof mockTestsData !== 'undefined' && mockTestsData.test1 && mockTestsData.test1.length > 0) {
    return Promise.resolve();
  }

  if (mockTestsLoadPromise) return mockTestsLoadPromise;

  mockTestsLoadPromise = Promise.all(['test1', 'test2', 'test3', 'test4', 'test5'].map(async key => {
    const response = await fetch(`./${key}.json`);
    if (!response.ok) throw new Error(`${key} could not be loaded`);

    const fileText = (await response.text()).trim();
    const jsonText = fileText
      .replace(/^\s*const\s+QUESTIONS\s*=\s*/, '')
      .replace(/;\s*$/, '');
    const questions = JSON.parse(jsonText);
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error(`${key} contains no questions`);
    }
    return [key, questions];
  })).then(entries => {
    // 2. Safely initialize the storage object if it wasn't already defined
    if (typeof mockTestsData === 'undefined') {
      window.mockTestsData = {};
    }
    entries.forEach(([key, questions]) => { mockTestsData[key] = questions; });
  }).catch(error => {
    mockTestsLoadPromise = null;
    throw error;
  });

  return mockTestsLoadPromise;
}

window.onload = function() {
  normalizeDatabase();
  initSetup();
  applyPreferences();
  updateDashboard();
  updateStreak();
  ensureMockTestsLoaded().catch(error => console.warn('Mock tests could not be preloaded:', error));

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log("SW Error:", err));
  }

  // Swipe Gestures
  let touchstartX = 0;
  let touchendX = 0;
  document.getElementById('screen-quiz').addEventListener('touchstart', e => {
    touchstartX = e.changedTouches[0].screenX;
  }, {passive:true});
  document.getElementById('screen-quiz').addEventListener('touchend', e => {
    touchendX = e.changedTouches[0].screenX;
    if (touchendX < touchstartX - 50) {
      if (!document.getElementById('btn-next').classList.contains('hidden')) nextQuestion();
    }
    if (touchendX > touchstartX + 50) {
      prevQuestion();
    }
  }, {passive:true});

  // Keyboard Shortcuts
  document.addEventListener('keydown', e => {
    const quizActive = document.getElementById('screen-quiz').classList.contains('active');
    if (!quizActive) return;
    if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      const opts = document.querySelectorAll('.opt');
      if (opts[idx] && document.getElementById('btn-next').classList.contains('hidden')) {
        opts[idx].click();
      }
    }
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      if (!document.getElementById('btn-next').classList.contains('hidden')) nextQuestion();
    }
    if (e.key === 'ArrowLeft') prevQuestion();
  });

  // Auto-resume Session
  if (store.activeSession) {
    if (confirm("You have an active quiz session. Do you want to resume?")) {
      restoreSession();
    } else {
      clearSession();
    }
  }
};

// --- FILTER GENERATION & EVENT LISTENERS ---

function initSetup() {
  const diffs = [...new Set(masterDatabase.map(q => q.difficulty))].sort();
  const sources = [...new Set(masterDatabase.map(q => q.source))].sort();

  state.selectedSubjects = new Set(FOUR_SUBJECTS);
  state.selectedDiffs = new Set(diffs);
  state.selectedSources = new Set(sources);

  renderSubjectChips();
  refreshTopicsFromSubjects();

  renderChips('diff-chips', diffs, state.selectedDiffs, updateAvailableStat);
  renderChips('source-chips', sources, state.selectedSources, updateAvailableStat);

  setupToggleAll('toggle-subjects', 'subject-chips', state.selectedSubjects, () => {
    refreshTopicsFromSubjects();
  });
  setupToggleAll('toggle-topics', 'topic-chips', state.selectedTopics, updateAvailableStat);
  setupToggleAll('toggle-diffs', 'diff-chips', state.selectedDiffs, updateAvailableStat);
  setupToggleAll('toggle-sources', 'source-chips', state.selectedSources, updateAvailableStat);
}

function renderSubjectChips() {
  const container = document.getElementById('subject-chips');
  container.innerHTML = '';
  FOUR_SUBJECTS.forEach(subj => {
    const count = masterDatabase.filter(q => q.subject === subj).length;
    const chip = document.createElement('div');
    chip.className = 'chip ' + (state.selectedSubjects.has(subj) ? 'selected' : '');
    chip.innerHTML = `${subj} <span class="chip-count">(${count})</span>`;
    chip.dataset.val = subj;
    chip.onclick = () => {
      if (state.selectedSubjects.has(subj)) {
        state.selectedSubjects.delete(subj);
        chip.classList.remove('selected');
      } else {
        state.selectedSubjects.add(subj);
        chip.classList.add('selected');
      }
      refreshTopicsFromSubjects();
    };
    container.appendChild(chip);
  });
}

function refreshTopicsFromSubjects() {
  const validTopics = [...new Set(masterDatabase
      .filter(q => state.selectedSubjects.has(q.subject))
      .map(q => q.topic))].sort();

  state.selectedTopics.clear();
  validTopics.forEach(t => state.selectedTopics.add(t));

  renderChips('topic-chips', validTopics, state.selectedTopics, updateAvailableStat);
  updateAvailableStat();
}

function renderChips(containerId, items, selectedSet, callback) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  items.forEach(item => {
    const count = masterDatabase.filter(q => {
      if (containerId === 'topic-chips') return q.topic === item;
      if (containerId === 'diff-chips') return q.difficulty === item;
      if (containerId === 'source-chips') return q.source === item;
      return false;
    }).length;
    const chip = document.createElement('div');
    chip.className = 'chip ' + (selectedSet.has(item) ? 'selected' : '');
    chip.innerHTML = `${item} <span class="chip-count">(${count})</span>`;
    chip.dataset.val = item;
    chip.onclick = () => {
      if (selectedSet.has(item)) {
        selectedSet.delete(item);
        chip.classList.remove('selected');
      } else {
        selectedSet.add(item);
        chip.classList.add('selected');
      }
      if (callback) callback();
    };
    container.appendChild(chip);
  });
}

function setupToggleAll(btnId, containerId, selectedSet, callback) {
  const btn = document.getElementById(btnId);
  btn.onclick = () => {
    const chips = [...document.querySelectorAll('#' + containerId + ' .chip')];
    const allItems = chips.map(c => c.dataset.val);
    const allSelected = allItems.every(i => selectedSet.has(i));

    if (allSelected) {
      allItems.forEach(i => selectedSet.delete(i));
      chips.forEach(c => c.classList.remove('selected'));
    } else {
      allItems.forEach(i => selectedSet.add(i));
      chips.forEach(c => c.classList.add('selected'));
    }
    if (callback) callback();
    updateAvailableStat();
  };
}

function updateAvailableStat() {
  const filtered = masterDatabase.filter(q => 
      state.selectedSubjects.has(q.subject) &&
      state.selectedTopics.has(q.topic) &&
      state.selectedDiffs.has(q.difficulty) &&
      state.selectedSources.has(q.source)
  );

  document.getElementById('stat-available').innerText = filtered.length;
  document.getElementById('error-banner').style.display = filtered.length === 0 ? 'block' : 'none';
  return filtered;
}

// --- STATS & XP DASHBOARD ---
function updateDashboard() {
  document.getElementById('xp-display').innerText = `${store.xp} XP`;
  document.getElementById('xp-level').innerText = store.level;
  document.getElementById('stat-total-db').innerText = masterDatabase.length;

  let totalSeen = 0;
  let totalCorrect = 0;
  
  let subjectStats = {
    "Pathology": { seen: 0, correct: 0 },
    "Community Med": { seen: 0, correct: 0 },
    "Ophthalmology": { seen: 0, correct: 0 },
    "ENT": { seen: 0, correct: 0 }
  };

  for (let key in store.qStats) {
    let stat = store.qStats[key];
    totalSeen += stat.timesSeen;
    totalCorrect += stat.correct;
    
    let subj = subjectMap[key];
    if (subj && subjectStats[subj]) {
      subjectStats[subj].seen += stat.timesSeen;
      subjectStats[subj].correct += stat.correct;
    }
  }

  let accuracy = totalSeen > 0 ? Math.round((totalCorrect / totalSeen) * 100) : 0;

  document.getElementById('g-attempted').innerText = totalSeen;
  document.getElementById('g-correct').innerText = totalCorrect;
  document.getElementById('g-wrong').innerText = totalSeen - totalCorrect;
  document.getElementById('g-accuracy').innerText = `${accuracy}%`;

  renderBadges();

  // XP Bar fill
  const xpForNextLevel = store.level * 1000;
  const xpPct = Math.min(100, Math.round((store.xp % 1000) / 10));
  document.getElementById('xp-bar').style.width = xpPct + '%';

  // Rank Names
  const RANKS = ['Medical Student','Intern','Resident','Senior Resident','Fellow','Attending','Professor','Dean'];
  const rankIdx = Math.min(store.level - 1, RANKS.length - 1);
  document.getElementById('xp-rank-name').innerText = RANKS[rankIdx];

  // Progress Ring — bank completion
  const uniqueSeen = Object.keys(store.qStats).length;
  const totalInBank = masterDatabase.length;
  const completionPct = totalInBank > 0 ? Math.round((uniqueSeen / totalInBank) * 100) : 0;
  const circumference = 213.6;
  const offset = circumference - (completionPct / 100) * circumference;
  const ring = document.getElementById('progress-ring');
  if (ring) {
    ring.style.strokeDashoffset = offset;
    document.getElementById('progress-ring-pct').innerText = completionPct + '%';
  }

  // Streak
  const streakEl = document.getElementById('streak-display');
  if (streakEl) streakEl.innerText = `🔥 ${store.streak.count} Day Streak`;

  const labels = Object.keys(subjectStats);
  const data = labels.map(label => {
    const subject = subjectStats[label];
    return subject.seen > 0 ? Math.round((subject.correct / subject.seen) * 100) : 0;
  });
  const summary = document.getElementById('accuracy-summary');
  if (summary) summary.textContent = labels.map((label, index) => `${label}: ${data[index]}%`).join(' · ');

  const chartCanvas = document.getElementById('accuracyChart');
  if (chartCanvas && !window.Chart) chartCanvas.hidden = true;
  if (window.Chart) {
    const ctx = chartCanvas;
    if (ctx) {
      if (accuracyChart) {
        accuracyChart.data.datasets[0].data = data;
        accuracyChart.update();
      } else {
        accuracyChart = new Chart(ctx.getContext('2d'), {
          type: 'radar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Accuracy %',
              data: data,
              backgroundColor: 'rgba(37, 99, 235, 0.2)',
              borderColor: 'rgba(37, 99, 235, 1)',
              pointBackgroundColor: 'rgba(37, 99, 235, 1)'
            }]
          },
          options: {
            scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } },
            plugins: { legend: { display: false } }
          }
        });
      }
    }
  }
}

function setMode(element, mode) {
  document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
  element.classList.add('selected');
  isTutorMode = (mode === 'tutor');
  isTimedMode = (mode === 'timed');
}

function setSize(element, size) {
  document.querySelectorAll('#block-size-pills .pill').forEach(p => p.classList.remove('selected'));
  element.classList.add('selected');
  selectedSize = size;
}

// --- QUIZ ENGINE ---
function startQuiz() {
  isMockExam = false;
  const filteredDB = updateAvailableStat();

  if (filteredDB.length === 0) {
    document.getElementById('error-banner').style.display = 'block';
    return;
  }

  document.getElementById('screen-setup').classList.remove('active');
  document.getElementById('screen-quiz').classList.add('active');

  currentBlockHistory = [];
  blockCorrect = 0;
  blockWrong = 0;
  currentQIndex = 0;

  if (selectedSize === 'srs') {
    currentQuestions = filteredDB.filter(q => {
      let stat = store.qStats[q.id];
      return stat && (stat.correct < stat.timesSeen);
    });
    if (currentQuestions.length === 0) {
      showToast("No missed questions found. Loading random block.");
      currentQuestions = [...filteredDB].sort(() => 0.5 - Math.random()).slice(0, 10);
    }
  } else if (selectedSize === 'unseen') {
    currentQuestions = filteredDB.filter(q => !store.qStats[q.id]);
    if (currentQuestions.length === 0) {
      showToast("You've seen all questions! Loading random block.");
      currentQuestions = [...filteredDB].sort(() => 0.5 - Math.random()).slice(0, 10);
    } else {
      currentQuestions = [...currentQuestions].sort(() => 0.5 - Math.random()).slice(0, 40);
    }
  } else if (selectedSize === 'bookmarked') {
    currentQuestions = filteredDB.filter(q => {
      let stat = store.qStats[q.id];
      return stat && stat.isBookmarked;
    });
    if (currentQuestions.length === 0) {
      showToast("No bookmarked questions found!");
      return;
    }
  } else {
    currentQuestions = [...filteredDB].sort(() => 0.5 - Math.random()).slice(0, selectedSize);
  }

  flaggedQuestions = new Set();

  if (isTimedMode) {
    let qCount = currentQuestions.length;
    startPomodoroTimer(qCount * 60); // 60 secs per question
    document.getElementById('btn-pause').style.display = 'block';
  } else {
    document.getElementById('block-timer-display').innerText = "∞";
    document.getElementById('btn-pause').style.display = 'none';
    clearInterval(blockTimer);
  }

  saveSession();
  loadQuestion();
}

let qStartTime = 0;

function loadQuestion() {
  qStartTime = Date.now();
  const q = currentQuestions[currentQIndex];
  document.getElementById('quiz-counter').innerText = `${currentQIndex + 1} / ${currentQuestions.length}`;
  document.getElementById('quiz-tag').innerText = q.topic || q.subject;
  document.getElementById('q-text').innerText = q.question;
  document.getElementById('q-text').style.fontSize = currentFontSize + 'rem';

  // Previous button visibility
  document.getElementById('btn-prev').style.display = currentQIndex > 0 ? 'block' : 'none';

  const stat = store.qStats[q.id] || {};
  const bkmkBtn = document.getElementById('btn-bookmark');
  if (stat.isBookmarked) bkmkBtn.classList.add('active');
  else bkmkBtn.classList.remove('active');

  // Flag state
  const flagBtn = document.getElementById('btn-flag');
  if (flaggedQuestions.has(currentQIndex)) flagBtn.classList.add('flagged');
  else flagBtn.classList.remove('flagged');

  const optArea = document.getElementById('options-area');
  optArea.innerHTML = '';
  q.options.forEach((opt, idx) => {
    let div = document.createElement('button');
    div.type = 'button';
    div.className = 'opt';
    const letter = document.createElement('span');
    letter.className = 'opt-letter';
    letter.textContent = String.fromCharCode(65 + idx);
    const text = document.createElement('span');
    text.textContent = opt;
    div.append(letter, text);
    div.onclick = () => selectOption(div, idx, q.correct);
    optArea.appendChild(div);
  });

  document.getElementById('explanation-wrap').classList.remove('show');
  document.getElementById('btn-next').classList.add('hidden');

  // Check if this question was already answered (going back)
  const histItem = currentBlockHistory.find(h => h.questionData.id === q.id);
  if (histItem) {
    const opts = document.querySelectorAll('.opt');
    replayAnswer(opts, histItem, q.correct);
  }

  renderNavGrid();
}

function replayAnswer(opts, histItem, correctIdx) {
  const selOpt = opts[histItem.userSelected];
  if (isTutorMode) {
    if (histItem.isCorrect) {
      selOpt.classList.add('correct');
    } else {
      selOpt.classList.add('incorrect');
      opts[correctIdx].classList.add('correct');
      opts.forEach((o, i) => { if (i !== histItem.userSelected && i !== correctIdx) o.classList.add('dimmed'); });
    }
    const q = histItem.questionData;
    document.getElementById('exp-text').innerText = q.explanation;
    document.getElementById('explanation-wrap').classList.add('show');
  } else {
    selOpt.style.borderColor = 'var(--blue)';
    selOpt.style.background = 'var(--blue-lt)';
    selOpt.style.color = 'var(--blue2)';
  }
  const nextBtn = document.getElementById('btn-next');
  nextBtn.innerText = (currentQIndex === currentQuestions.length - 1) ? "Finish Block →" : "Next →";
  nextBtn.classList.remove('hidden');
}

function renderNavGrid() {
  const wrap = document.getElementById('q-nav-grid-wrap');
  if (!wrap) return;
  // Mock exams intentionally use sequential navigation only.
  if (isMockExam) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = '';
  let html = '<div class="q-nav-grid">';
  currentQuestions.forEach((q, i) => {
    const hist = currentBlockHistory.find(h => h.questionData.id === q.id);
    let cls = 'q-nav-dot';
    if (i === currentQIndex) cls += ' current';
    else if (hist) cls += hist.isCorrect ? ' answered-right' : ' answered-wrong';
    if (flaggedQuestions.has(i)) cls += ' flagged-dot';
    html += `<div class="${cls}" onclick="jumpToQuestion(${i})">${i+1}</div>`;
  });
  html += '</div>';
  wrap.innerHTML = html;
}

function jumpToQuestion(idx) {
  currentQIndex = idx;
  loadQuestion();
}

function selectOption(element, selectedIdx, correctIdx) {
  if (!document.getElementById('btn-next').classList.contains('hidden')) return;
  const q = currentQuestions[currentQIndex];
  
  // Don't re-record if already answered
  if (currentBlockHistory.find(h => h.questionData.id === q.id)) return;
  
  const isCorrect = (selectedIdx === correctIdx);

  currentBlockHistory.push({ questionData: q, userSelected: selectedIdx, isCorrect: isCorrect });

  if (isCorrect) {
    blockCorrect++;
    playSound('correct');
    if (!isMockExam) updateXP(50);
  } else {
    blockWrong++;
    playSound('wrong');
  }
  
  const timeTaken = (Date.now() - qStartTime) / 1000;
  checkBadges('answer', { timeTaken });

  if (!isTutorMode) {
    // In timed mode, just highlight neutrally without revealing answer
    element.style.borderColor = 'var(--blue)';
    element.style.background = 'var(--blue-lt)';
    element.style.color = 'var(--blue2)';
  } else {
    // Tutor mode reveals answer
    if (isCorrect) {
      element.classList.add('correct');
    } else {
      element.classList.add('incorrect');
      const opts = document.querySelectorAll('.opt');
      opts[correctIdx].classList.add('correct');
      opts.forEach((o, i) => { if (i !== selectedIdx && i !== correctIdx) o.classList.add('dimmed'); });
    }
    document.getElementById('exp-text').innerText = q.explanation;
    document.getElementById('explanation-wrap').classList.add('show');
    // Auto-scroll to explanation
    setTimeout(() => {
      document.getElementById('explanation-wrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  }

  if (!store.qStats[q.id]) store.qStats[q.id] = { timesSeen: 0, correct: 0, isBookmarked: false };
  store.qStats[q.id].timesSeen++;
  if (isCorrect) store.qStats[q.id].correct++;
  
  saveSession(); // Persist the answered state

  const nextBtn = document.getElementById('btn-next');
  nextBtn.innerText = (currentQIndex === currentQuestions.length - 1) ? "Finish Block →" : "Next →";
  nextBtn.classList.remove('hidden');
  renderNavGrid();
}

function nextQuestion() {
  currentQIndex++;
  saveSession();
  if (currentQIndex >= currentQuestions.length) endQuiz();
  else loadQuestion();
}

function prevQuestion() {
  if (currentQIndex > 0) {
    currentQIndex--;
    loadQuestion();
  }
}

function toggleFlag() {
  if (flaggedQuestions.has(currentQIndex)) {
    flaggedQuestions.delete(currentQIndex);
    document.getElementById('btn-flag').classList.remove('flagged');
  } else {
    flaggedQuestions.add(currentQIndex);
    document.getElementById('btn-flag').classList.add('flagged');
  }
  renderNavGrid();
}

function changeFontSize(delta) {
  currentFontSize = Math.max(0.7, Math.min(1.4, currentFontSize + delta * 0.08));
  document.getElementById('q-text').style.fontSize = currentFontSize + 'rem';
}

function toggleBookmark() {
  const q = currentQuestions[currentQIndex];
  if (!store.qStats[q.id]) store.qStats[q.id] = { timesSeen: 0, correct: 0, isBookmarked: false };
  store.qStats[q.id].isBookmarked = !store.qStats[q.id].isBookmarked;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  document.getElementById('btn-bookmark').classList.toggle('active');
}

let isPaused = false;
let remainingTime = 0;

function togglePause() {
  isPaused = !isPaused;
  const overlay = document.getElementById('pause-overlay');
  if (isPaused) {
    overlay.classList.add('active');
    clearInterval(blockTimer);
  } else {
    overlay.classList.remove('active');
    startPomodoroTimer(remainingTime);
  }
}

function startPomodoroTimer(seconds) {
  remainingTime = seconds;
  clearInterval(blockTimer);
  const timerEl = document.getElementById('block-timer-display');
  blockTimer = setInterval(() => {
    remainingTime--;
    let m = Math.floor(remainingTime / 60);
    let s = remainingTime % 60;
    timerEl.innerText = `${m}:${s < 10 ? '0' + s : s}`;
    // Timer warning at 60 seconds
    if (remainingTime <= 60) timerEl.classList.add('warning');
    else timerEl.classList.remove('warning');
    if (remainingTime <= 0) {
      clearInterval(blockTimer);
      showToast("⏰ Time's up!");
      endQuiz();
    }
    if (remainingTime % 5 === 0) saveSession();
  }, 1000);
}

async function startMockExam(testKey) {
  try {
    showToast('Loading mock test…');
    await ensureMockTestsLoaded();
  } catch (error) {
    showToast('Unable to load this mock test. Please try again.');
    return;
  }

  if (typeof mockTestsData === 'undefined' || !mockTestsData[testKey] || mockTestsData[testKey].length === 0) {
    showToast("Mock test " + testKey + " is not available yet.");
    return;
  }

  isMockExam = true;
  currentMockKey = testKey;
  
  document.getElementById('screen-setup').classList.remove('active');
  document.getElementById('screen-quiz').classList.add('active');

  currentBlockHistory = [];
  blockCorrect = 0;
  blockWrong = 0;
  currentQIndex = 0;

  // 120 questions, normalized to match app's expected property names
  currentQuestions = mockTestsData[testKey].map((rawQ, index) => ({
    id: rawQ.id || `mock_${testKey}_${index}`,
    subject: rawQ.subject || rawQ.chapter || rawQ.cat || "Mock Exam",
    question: rawQ.question || rawQ.q,
    options: rawQ.options || rawQ.opts,
    correct: rawQ.correct !== undefined ? rawQ.correct : rawQ.a,
    explanation: rawQ.explanation || rawQ.exp
  }));

  // 100 minutes timer for Timed mode Mock Exam
  if (isTimedMode) {
    startPomodoroTimer(100 * 60);
    document.getElementById('btn-pause').style.display = 'block';
  } else {
    document.getElementById('block-timer-display').innerText = "∞";
    document.getElementById('btn-pause').style.display = 'none';
    clearInterval(blockTimer);
  }

  saveSession();
  loadQuestion();
}

function reportQuestion() {
  const q = currentQuestions[currentQIndex];
  const reason = prompt("Why are you reporting this question?", "e.g. Typo, wrong answer, unclear");
  if (reason) {
    alert("Question " + (q.id || "unknown") + " has been reported. Thank you!");
    // You could also save this to local storage to review later
    let reported = JSON.parse(localStorage.getItem('reportedQuestions') || '[]');
    reported.push({ id: q.id, question: q.question, reason: reason, date: new Date().toISOString() });
    localStorage.setItem('reportedQuestions', JSON.stringify(reported));
  }
}


function updateXP(amount) {
  store.xp += amount;
  if (store.xp > store.level * 1000) store.level++;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// --- SESSION PERSISTENCE ---
function saveSession() {
  store.activeSession = {
    currentQuestions,
    currentQIndex,
    currentBlockHistory,
    blockCorrect,
    blockWrong,
    isTutorMode,
    isTimedMode,
    isMockExam,
    currentMockKey,
    remainingTime
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function restoreSession() {
  const sess = store.activeSession;
  currentQuestions = sess.currentQuestions;
  currentQIndex = sess.currentQIndex;
  currentBlockHistory = sess.currentBlockHistory;
  blockCorrect = sess.blockCorrect;
  blockWrong = sess.blockWrong;
  isTutorMode = sess.isTutorMode;
  isTimedMode = sess.isTimedMode;
  isMockExam = sess.isMockExam;
  currentMockKey = sess.currentMockKey;
  
  document.getElementById('screen-setup').classList.remove('active');
  document.getElementById('screen-quiz').classList.add('active');

  if (isTimedMode) {
    startPomodoroTimer(sess.remainingTime);
    document.getElementById('btn-pause').style.display = 'block';
  } else {
    document.getElementById('block-timer-display').innerText = "∞";
    document.getElementById('btn-pause').style.display = 'none';
  }

  loadQuestion();
  
  // If the current question was already answered, restore UI state
  const historyItem = currentBlockHistory.find(h => h.questionData.id === currentQuestions[currentQIndex].id);
  if (historyItem) {
    const opts = document.querySelectorAll('.opt');
    selectOption(opts[historyItem.userSelected], historyItem.userSelected, currentQuestions[currentQIndex].correct, true);
  }
}

function clearSession() {
  store.activeSession = null;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// --- DETAILED QUESTION ANALYZER ---
function endQuiz() {
  clearSession();
  clearInterval(blockTimer);
  document.getElementById('screen-quiz').classList.remove('active');
  document.getElementById('screen-results').classList.add('active');

  document.getElementById('stat-correct').innerText = blockCorrect;
  const total = currentQuestions.length;
  const skipped = Math.max(0, total - blockCorrect - blockWrong);
  document.getElementById('stat-incorrect').innerText = blockWrong + skipped;

  let pct = total > 0 ? Math.round((blockCorrect / total) * 100) : 0;

  if (pct >= 80 && window.confetti) {
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  }

  checkBadges('block_end', { accuracy: pct, total: total, isMock: isMockExam });

  document.getElementById('block-ring-chart').innerText = `${pct}%`;
  document.getElementById('block-ring-chart').style.background = `conic-gradient(var(--ok) 0% ${pct}%, var(--err) ${pct}% 100%)`;
  document.getElementById('block-score-text').innerText = `${blockCorrect} / ${total} Correct${skipped ? ` · ${skipped} Skipped` : ''}`;

  // Dynamic performance message
  const msgEl = document.getElementById('results-perf-msg');
  if (pct >= 90) { msgEl.innerText = '🌟 Outstanding!'; msgEl.style.color = 'var(--gold2)'; }
  else if (pct >= 70) { msgEl.innerText = '💪 Great Work!'; msgEl.style.color = 'var(--ok)'; }
  else if (pct >= 50) { msgEl.innerText = '📚 Keep Practicing!'; msgEl.style.color = 'var(--warn)'; }
  else { msgEl.innerText = '💪 Don\'t Give Up!'; msgEl.style.color = 'var(--err)'; }

  const analyzerList = document.getElementById('analyzer-list');
  analyzerList.innerHTML = '';

  currentBlockHistory.forEach((item, index) => {
    const q = item.questionData;
    const userAnsText = item.userSelected !== null ? q.options[item.userSelected] : "Skipped";
    const correctAnsText = q.options[q.correct];

    let cardHTML = `
      <div class="missed-card">
        <div class="missed-card-header">
          <div class="missed-q-num ${item.isCorrect ? 'right' : 'wrong'}">${index + 1}</div>
          <div class="missed-q-text">${escapeHTML(q.question)}</div>
        </div>
        <div class="missed-card-body">
          <div class="missed-ans-row">
            <span class="ans-label">Your Selection:</span>
            <span style="color: ${item.isCorrect ? 'var(--ok)' : 'var(--err)'}">
               ${item.isCorrect ? '✓' : '✗'} ${escapeHTML(userAnsText)}
            </span>
          </div>
    `;

    if (!item.isCorrect) {
      cardHTML += `<div class="missed-ans-row"><span class="ans-label">Correct Option:</span><span style="color: var(--ok)">✓ ${escapeHTML(correctAnsText)}</span></div>`;
    }

    cardHTML += `
          <div class="missed-why">
            <strong>Key Learning Point:</strong><br/>
            ${escapeHTML(q.explanation)}
          </div>
        </div>
      </div>`;
    analyzerList.innerHTML += cardHTML;
  });
}

function returnToSetup() {
  updateDashboard();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-setup').classList.add('active');
  window.scrollTo(0, 0);
  // Reset timer warning class
  document.getElementById('block-timer-display').classList.remove('warning');
}

// --- STREAK TRACKING ---
function updateStreak() {
  const today = new Date().toISOString().split('T')[0];
  if (store.streak.lastDate === today) return; // Already updated today
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (store.streak.lastDate === yesterday) {
    store.streak.count++;
  } else if (store.streak.lastDate !== today) {
    store.streak.count = 1;
  }
  store.streak.lastDate = today;
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  
  // Check streak badges
  if (store.streak.count >= 3 && !store.badges.includes('streak_3')) {
    store.badges.push('streak_3');
    showToast('🏆 Badge Unlocked: 3-Day Streak!');
  }
  if (store.streak.count >= 7 && !store.badges.includes('streak_7')) {
    store.badges.push('streak_7');
    showToast('🏆 Badge Unlocked: 7-Day Streak!');
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

// --- EXPORT / IMPORT / RESET ---
function exportProgress() {
  const data = JSON.stringify(store, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pathopro_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 Progress exported!');
}

function importProgress(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && typeof imported === 'object' && !Array.isArray(imported) && imported.qStats && typeof imported.qStats === 'object' && !Array.isArray(imported.qStats)) {
        store = imported;
        if (!Number.isFinite(store.xp)) store.xp = 0;
        if (!Number.isFinite(store.level) || store.level < 1) store.level = 1;
        if (!store.preferences) store.preferences = { theme: 'dark', mute: false };
        if (!store.badges) store.badges = [];
        if (!store.streak) store.streak = { lastDate: null, count: 0 };
        localStorage.setItem(STORE_KEY, JSON.stringify(store));
        applyPreferences();
        updateDashboard();
        showToast('📥 Progress imported successfully!');
      } else {
        showToast('⚠️ Invalid file format');
      }
    } catch(err) {
      showToast('⚠️ Error reading file');
    }
  };
  reader.readAsText(file);
  event.target.value = ''; // Reset file input
}

function resetProgress() {
  if (!confirm('Are you sure you want to reset ALL progress? This cannot be undone!')) return;
  if (!confirm('This will delete all XP, badges, stats, and bookmarks. Are you absolutely sure?')) return;
  localStorage.removeItem(STORE_KEY);
  location.reload();
}

// --- BOOKMARK BROWSER ---
function openBookmarks() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-bookmarks').classList.add('active');
  
  const list = document.getElementById('bookmark-list');
  const bookmarked = masterDatabase.filter(q => {
    const stat = store.qStats[q.id];
    return stat && stat.isBookmarked;
  });
  
  if (bookmarked.length === 0) {
    list.innerHTML = '<div class="bookmark-empty">🔖 No bookmarked questions yet.<br>Bookmark questions during a quiz to see them here.</div>';
    return;
  }
  
  list.innerHTML = '';
  bookmarked.forEach((q, i) => {
    const stat = store.qStats[q.id];
    list.innerHTML += `
      <div class="missed-card">
        <div class="missed-card-header">
          <div class="missed-q-num" style="background:var(--gold)">🔖</div>
          <div class="missed-q-text">${escapeHTML(q.question)}</div>
        </div>
        <div class="missed-card-body">
          <div class="missed-ans-row"><span class="ans-label">Correct Answer:</span><span style="color:var(--ok)">✓ ${escapeHTML(q.options[q.correct])}</span></div>
          <div class="missed-why"><strong>Explanation:</strong><br/>${escapeHTML(q.explanation)}</div>
        </div>
      </div>`;
  });
}
</script>