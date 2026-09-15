let questionsDatabase = [];
let savedTests = [];
let timerInterval = null;
let sessionStartTime = null;
let gameSettings = {
  timePerQuestion: 5,
  mode: 'classic',
  questionCount: 10,
  repeatCount: 1,
  playMode: ''
};
let correctAnswerIndex = 0;
let currentQuestion = null;
let currentOptions = [];
let currentReverseQuestionKey = '';
let currentCorrectOptionKey = '';
let currentImage = '';
let puzzleQueue = [];
let puzzleState = {
  pendingQuestion: null,
  roundQuestions: [],
  roundAnswers: [],
  completedPairs: 0
};
let answerImageData = {
  correct: '',
  wrong: []
};
let settings = {
  themes: true,
  stats: true,
  welcome: true,
  fontSize: 18,
  buttonColor: '#7c3aed',
  correctButtonColor: '#22c55e',
  wrongButtonColor: '#ef4444',
  buttonTextColor: '#ffffff',
  accentOrangeColor: '#0f766e'
};
let stats = {
  correct: 0,
  incorrect: 0,
  missedQuestions: [],
  durationSeconds: 0
};
let totalAnswered = 0;
let currentMode = 'choice';
let editingSavedTestId = null;
let editingQuestionIndex = null;
let activeCreatorMode = '';
let activeFlow = 'welcome';
let previousPage = 'welcome';
let sharedTests = [];
let accounts = [];
let activeAccountId = null;
let accountHistory = [];
const MAX_TEXT_LENGTH = 1000;
const STORAGE_KEYS = {
  savedTests: 'quiz-saved-tests',
  sharedTests: 'quiz-shared-tests',
  theme: 'quiz-theme'
};

function getElement(id) {
  return document.getElementById(id) || null;
}

function bindIfExists(id, eventName, handler) {
  const element = getElement(id);
  if (element) {
    element.addEventListener(eventName, handler);
  }
  return element;
}

function safeStorageGet(key, fallback = null) {
  try {
    const storedValue = localStorage.getItem(key);
    if (storedValue === null) {
      return fallback;
    }
    return JSON.parse(storedValue);
  } catch (error) {
    console.warn(`Не удалось прочитать ${key}:`, error);
    return fallback;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Не удалось сохранить ${key}:`, error);
    return false;
  }
}

function createSafeId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getAnswerButtons() {
  return Array.from(document.querySelectorAll('.answer-btn'));
}

function getPuzzleQuestionButtons() {
  return Array.from(document.querySelectorAll('.puzzle-question-btn'));
}

function setButtonVisualState(button, state = '') {
  if (!button) {
    return;
  }

  button.classList.remove('is-correct', 'is-wrong', 'is-selected', 'puzzle-error-shake');

  if (state === 'correct') {
    button.classList.add('is-correct');
    button.style.background = `linear-gradient(135deg, ${settings.correctButtonColor}22, ${settings.correctButtonColor}14)`;
    button.style.color = settings.buttonTextColor;
    button.style.borderColor = settings.correctButtonColor;
    button.style.boxShadow = `0 8px 18px ${settings.correctButtonColor}22`;
    return;
  }

  if (state === 'wrong') {
    button.classList.add('is-wrong');
    button.style.background = `linear-gradient(135deg, ${settings.wrongButtonColor}22, ${settings.wrongButtonColor}14)`;
    button.style.color = settings.buttonTextColor;
    button.style.borderColor = settings.wrongButtonColor;
    button.style.boxShadow = `0 8px 18px ${settings.wrongButtonColor}22`;
    return;
  }

  if (state === 'selected') {
    button.classList.add('is-selected');
  }

  button.style.background = '';
  button.style.color = '';
  button.style.borderColor = '';
  button.style.boxShadow = '';
}

function setSectionVisibility(section, visible, displayType = 'block') {
  if (section) {
    section.style.display = visible ? displayType : 'none';
  }
}

function loadAccounts() {
  try {
    const storedAccounts = safeStorageGet('quiz-accounts', []);
    accounts = Array.isArray(storedAccounts) ? storedAccounts : [];
    const storedActiveAccountId = localStorage.getItem('quiz-active-account-id');
    activeAccountId = storedActiveAccountId && accounts.some((account) => account.id === storedActiveAccountId)
      ? storedActiveAccountId
      : null;
  } catch (error) {
    console.error('Не удалось загрузить аккаунты', error);
    accounts = [];
    activeAccountId = null;
  }
}

function saveAccounts() {
  safeStorageSet('quiz-accounts', accounts);
  if (activeAccountId) {
    localStorage.setItem('quiz-active-account-id', activeAccountId);
  } else {
    localStorage.removeItem('quiz-active-account-id');
  }
}

function getActiveAccount() {
  return accounts.find((account) => account.id === activeAccountId) || null;
}

function persistAccountData() {
  const account = getActiveAccount();
  if (!account) {
    return;
  }

  account.savedTests = Array.isArray(savedTests) ? savedTests.map((test) => ({ ...test })) : [];
  account.sharedTests = Array.isArray(sharedTests) ? sharedTests.map((test) => ({ ...test })) : [];
  account.history = Array.isArray(accountHistory) ? accountHistory.map((entry) => ({ ...entry })) : [];
  account.updatedAt = new Date().toISOString();
  saveAccounts();
}


function recordAccountHistory(entry) {
  const account = getActiveAccount();
  if (!account) {
    return;
  }

  accountHistory.unshift({
    id: createSafeId(),
    title: sanitizeText(entry.title || 'Без названия', 120),
    score: entry.score ?? 0,
    total: entry.total ?? 0,
    percent: entry.percent ?? 0,
    createdAt: new Date().toISOString()
  });
  accountHistory = accountHistory.slice(0, 30);
  persistAccountData();
}

function sanitizeText(value, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/[<>"'`]/g, '').trim().slice(0, maxLength);
}

function containsArabicText(text = '') {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u.test(text);
}

function applyArabicTextClass(element) {
  if (!element) {
    return;
  }

  const shouldUseArabic = containsArabicText(element.textContent || '');
  element.classList.toggle('arabic-text', shouldUseArabic);

  if (element.classList.contains('answer-btn')) {
    const btnText = element.querySelector('.btn-text');
    if (btnText) {
      btnText.classList.toggle('arabic-text', shouldUseArabic);
    }
  }
}

function sanitizeImageData(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed.startsWith('data:image/') ? trimmed : '';
}

function sanitizeQuestionEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const safeText = sanitizeText(entry.text, 1000);
  const safeType = entry.type === 'matching' ? 'matching' : 'choice';

  const normalizeAnswer = (answer) => {
    if (answer && typeof answer === 'object') {
      return {
        text: sanitizeText(answer.text, 500),
        image: sanitizeImageData(answer.image)
      };
    }
    return sanitizeText(answer, 500);
  };

  return {
    text: safeText,
    correctAnswer: normalizeAnswer(entry.correctAnswer),
    wrongAnswers: Array.isArray(entry.wrongAnswers)
      ? entry.wrongAnswers.map((item) => normalizeAnswer(item)).slice(0, 4)
      : [],
    image: sanitizeImageData(entry.image),
    type: safeType
  };
}

function sanitizeStoredTests(rawData) {
  if (!Array.isArray(rawData)) {
    return [];
  }

  return rawData
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: sanitizeText(item.id, 80),
      title: sanitizeText(item.title, 120),
      author: sanitizeText(item.author, 120),
      createdAt: sanitizeText(item.createdAt, 80),
      questions: Array.isArray(item.questions)
        ? item.questions.map((question) => sanitizeQuestionEntry(question)).filter(Boolean)
        : []
    }))
    .filter((item) => item.id || item.title || item.author);
}

function resetButtons() {
  const buttons = getAnswerButtons();
  buttons.forEach((btn) => {
    btn.disabled = false;
    setButtonVisualState(btn, '');
  });
}

function scrollToTop() {
  const root = document.documentElement;
  const body = document.body;

  root.scrollTop = 0;
  body.scrollTop = 0;

  try {
    window.scrollTo(0, 0);
  } catch (error) {
    root.scrollTop = 0;
    body.scrollTop = 0;
  }
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const seconds = String(safeSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateTimer() {
  const timerText = document.getElementById('timer-text');
  const timerBar = document.getElementById('timer-bar');
  const timerContainer = document.querySelector('.timer-container');

  if (!timerText || !timerBar) {
    return;
  }

  if (gameSettings.playMode === 'puzzle') {
    timerText.textContent = 'без лимита';
    timerBar.style.width = '100%';
    if (timerContainer) {
      timerContainer.style.display = 'none';
    }
    return;
  }

  if (gameSettings.mode === 'marathon') {
    timerText.textContent = '∞';
    timerBar.style.width = '100%';
    if (timerContainer) {
      timerContainer.style.display = 'none';
    }
    return;
  }

  if (timerContainer) {
    timerContainer.style.display = 'block';
  }

  const remaining = Math.max(0, Math.ceil(window.timeLeft));
  timerText.textContent = `${remaining}с`;
  timerBar.style.width = `${(remaining / Math.max(1, gameSettings.timePerQuestion)) * 100}%`;
}

function startTimer() {
  clearInterval(timerInterval);

  if (gameSettings.playMode === 'puzzle') {
    updateTimer();
    return;
  }

  if (gameSettings.mode === 'marathon') {
    updateTimer();
    return;
  }

  window.timeLeft = Number(gameSettings.timePerQuestion) || 5;
  updateTimer();

  timerInterval = setInterval(() => {
    window.timeLeft -= 1;
    updateTimer();

    if (window.timeLeft <= 0) {
      clearInterval(timerInterval);
      checkAnswer(-1);
    }
  }, 1000);
}

function applyPracticeAppearanceSettings() {
  const fontSizeSelect = document.getElementById('practice-font-size-select');
  const buttonColorPicker = document.getElementById('practice-button-color-picker');
  const correctButtonColorPicker = document.getElementById('practice-correct-button-color-picker');
  const wrongButtonColorPicker = document.getElementById('practice-wrong-button-color-picker');
  const buttonTextColorPicker = document.getElementById('practice-button-text-color-picker');
  const accentColorPicker = document.getElementById('practice-accent-color-picker');

  const fontSize = Number(fontSizeSelect?.value) || 32;
  const buttonColor = buttonColorPicker?.value || '#7c3aed';
  const correctButtonColor = correctButtonColorPicker?.value || '#22c55e';
  const wrongButtonColor = wrongButtonColorPicker?.value || '#ef4444';
  const buttonTextColor = buttonTextColorPicker?.value || '#ffffff';
  const accentColor = accentColorPicker?.value || '#0f766e';

  document.documentElement.style.setProperty('--practice-font-size', `${fontSize}px`);
  document.documentElement.style.setProperty('--app-font-size', `${fontSize}px`);
  document.documentElement.style.setProperty('--practice-button-color', buttonColor);
  document.documentElement.style.setProperty('--practice-correct-button-color', correctButtonColor);
  document.documentElement.style.setProperty('--practice-wrong-button-color', wrongButtonColor);
  document.documentElement.style.setProperty('--practice-button-text-color', buttonTextColor);
  document.documentElement.style.setProperty('--practice-accent-color', accentColor);

  document.querySelectorAll('#practice-section .practice-settings-card, #practice-section .saved-test-card').forEach((element) => {
    element.style.setProperty('border-color', accentColor);
  });

  document.querySelectorAll('#practice-section .helper-btn, #practice-section .switch-btn').forEach((element) => {
    element.style.setProperty('background-color', buttonColor);
    element.style.setProperty('color', buttonTextColor);
    element.style.setProperty('border-color', buttonColor);
  });

  document.querySelectorAll('#practice-section .saved-test-count, #practice-section .practice-settings-card h3').forEach((element) => {
    element.style.setProperty('color', accentColor);
  });
}

function applySettingsUI() {
  const themesToggle = document.getElementById('toggle-themes');
  const statsToggle = document.getElementById('toggle-stats');
  const fontSizeSelect = document.getElementById('font-size-select');
  const buttonColorPicker = document.getElementById('button-color-picker');
  const correctButtonColorPicker = document.getElementById('correct-button-color-picker');
  const wrongButtonColorPicker = document.getElementById('wrong-button-color-picker');
  const buttonTextColorPicker = document.getElementById('button-text-color-picker');
  const accentOrangeColorPicker = document.getElementById('accent-orange-color-picker');

  settings.themes = themesToggle.checked;
  settings.stats = statsToggle.checked;
  settings.fontSize = Number(fontSizeSelect.value) || 18;
  settings.buttonColor = buttonColorPicker.value || '#7c3aed';
  settings.correctButtonColor = correctButtonColorPicker.value || '#22c55e';
  settings.wrongButtonColor = wrongButtonColorPicker.value || '#ef4444';
  settings.buttonTextColor = buttonTextColorPicker.value || '#ffffff';
  settings.accentOrangeColor = accentOrangeColorPicker.value || '#0f766e';

  const wrongAnswersGroup = document.getElementById('wrong-answers-group');
  const bulkField = document.getElementById('bulk-wrong-answers');
  const manualInputs = document.getElementById('wrong-answer-inputs');
  const helperText = wrongAnswersGroup.querySelector('.helper-text');
  const randomButton = document.getElementById('generate-random-btn');

  document.querySelectorAll('.theme-selector').forEach((selector) => {
    if (selector) {
      selector.style.display = settings.themes ? 'flex' : 'none';
    }
  });
  document.getElementById('wrong-count-group').style.display = 'block';
  wrongAnswersGroup.style.display = 'block';
  bulkField.style.display = 'block';
  manualInputs.style.display = 'block';
  randomButton.style.display = 'block';

  if (helperText) {
    helperText.textContent = 'Введите по одному неправильному варианту вручную.';
  }

  document.getElementById('stats-section').style.display = 'none';
  document.documentElement.style.setProperty('--app-font-size', `${settings.fontSize}px`);
  document.documentElement.style.setProperty('--game-font-size', `${settings.fontSize}px`);
  document.documentElement.style.setProperty('--custom-button-color', settings.buttonColor);
  document.documentElement.style.setProperty('--custom-correct-button-color', settings.correctButtonColor);
  document.documentElement.style.setProperty('--custom-wrong-button-color', settings.wrongButtonColor);
  document.documentElement.style.setProperty('--custom-button-text-color', settings.buttonTextColor);
  document.documentElement.style.setProperty('--custom-accent-orange', settings.accentOrangeColor);
  document.body.style.setProperty('--accent-2', settings.accentOrangeColor);
  document.body.style.setProperty('--warning', settings.accentOrangeColor);
  document.body.style.setProperty('--accent', settings.buttonColor);
  document.body.style.setProperty('--accent-2', settings.accentOrangeColor);
  document.body.style.setProperty('--warning', settings.accentOrangeColor);
  document.querySelectorAll('.welcome-option:not(.regular), .mode-block h3, .label-correct, .saved-test-count, .answer-image-status, .mode-pill, .progress-pill').forEach((el) => {
    el.style.setProperty('background-color', settings.accentOrangeColor);
    el.style.setProperty('color', settings.buttonTextColor);
  });

  document.querySelectorAll('.page-nav-btn, .submit-btn, .switch-btn, .finish-btn, .welcome-option.regular').forEach((el) => {
    el.style.setProperty('background-color', settings.buttonColor);
    el.style.setProperty('color', settings.buttonTextColor);
    el.style.setProperty('border-color', settings.buttonColor);
  });

  document.querySelectorAll('.answer-btn .btn-text, #game-question-text').forEach((el) => {
    if (el) {
      el.style.fontSize = `${settings.fontSize}px`;
    }
  });

  document.querySelectorAll('.answer-btn').forEach((btn) => {
    if (!btn.classList.contains('is-correct') && !btn.classList.contains('is-wrong')) {
      btn.style.background = settings.buttonColor;
      btn.style.color = settings.buttonTextColor;
      btn.style.borderColor = settings.buttonColor;
      btn.style.boxShadow = `0 8px 18px ${settings.buttonColor}22`;
    }
    btn.style.setProperty('--button-color', settings.buttonColor);
    btn.style.setProperty('--button-text-color', settings.buttonTextColor);
    btn.style.setProperty('--correct-button-color', settings.correctButtonColor);
    btn.style.setProperty('--wrong-button-color', settings.wrongButtonColor);
  });
}

function updateGameHeader() {
  const modePill = document.getElementById('game-mode-pill');
  const progressPill = document.getElementById('game-progress-pill');
  const modeLabel = {
    classic: 'Классический',
    sprint: 'Спринт',
    marathon: 'Марафон'
  }[gameSettings.mode] || 'Классический';

  if (modePill) {
    if (gameSettings.playMode === 'puzzle') {
      modePill.textContent = 'Мазайка';
    } else if (gameSettings.playMode === 'reverse-survey') {
      modePill.textContent = 'Обратный опрос';
    } else {
      modePill.textContent = modeLabel;
    }
  }

  if (progressPill) {
    const totalQuestions = gameSettings.playMode === 'puzzle'
      ? String(Math.max(1, questionsDatabase.length || 3))
      : (gameSettings.mode === 'marathon' ? '∞' : String(gameSettings.questionCount));
    progressPill.textContent = `${Math.max(0, totalAnswered)} / ${totalQuestions}`;
  }
}

function getEffectiveQuestionCount() {
  const select = document.getElementById('question-count-select');
  const selectedValue = select?.value;

  if (selectedValue === 'auto') {
    return Math.max(1, questionsDatabase.length || 10);
  }

  const parsedValue = Number(selectedValue);
  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return Math.max(1, questionsDatabase.length || 10);
}

function renderPuzzleRound(roundQuestions, roundAnswers) {
  const questionText = document.getElementById('game-question-text');
  const imageElement = document.getElementById('game-question-image');
  const buttons = getAnswerButtons();
  const puzzleContainer = document.getElementById('puzzle-questions-container');
  const gameModeTitle = document.getElementById('game-mode-title');
  const matchHint = document.getElementById('match-hint');

  if (puzzleContainer) {
    puzzleContainer.innerHTML = '';
    puzzleContainer.style.display = 'flex';
  }

  questionText.textContent = 'Собери пазл: выбери вопрос и ответ';
  applyArabicTextClass(questionText);
  currentOptions = roundAnswers;
  currentMode = 'choice';
  currentQuestion = null;

  imageElement.removeAttribute('src');
  imageElement.style.display = 'none';

  gameModeTitle.textContent = 'Собери пазл из слов';
  matchHint.textContent = 'Сначала нажми на вопрос, затем на ответ';
  matchHint.style.display = 'block';

  if (puzzleContainer) {
    roundQuestions.forEach((question, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'puzzle-question-btn';
      button.textContent = question.text;
      applyArabicTextClass(button);
      button.dataset.questionIndex = String(index);
      button.addEventListener('click', () => {
        puzzleState.pendingQuestion = index;
        document.querySelectorAll('.puzzle-question-btn').forEach((item) => {
          item.classList.toggle('is-selected', Number(item.dataset.questionIndex) === index);
        });
      });
      puzzleContainer.appendChild(button);
    });
  }

  buttons.forEach((btn, index) => {
    const isVisible = index < roundAnswers.length;
    const option = isVisible ? roundAnswers[index] : '';
    const previewImg = btn.querySelector('.answer-image-preview');

    btn.classList.toggle('is-hidden', !isVisible);
    btn.style.display = isVisible ? 'block' : 'none';
    btn.querySelector('.btn-text').textContent = isVisible ? getAnswerText(option) : '';
    applyArabicTextClass(btn);
    btn.disabled = !isVisible;
    btn.style.backgroundColor = '';
    btn.style.color = '';

    if (previewImg) {
      if (option && typeof option === 'object' && option.image) {
        previewImg.src = option.image;
        previewImg.style.display = 'block';
      } else {
        previewImg.removeAttribute('src');
        previewImg.style.display = 'none';
      }
    }
  });

  puzzleState.roundQuestions = roundQuestions;
  puzzleState.roundAnswers = roundAnswers;
  puzzleState.pendingQuestion = null;

  updateGameHeader();
}

function renderQuestion(question, options) {
  const questionText = document.getElementById('game-question-text');
  const imageElement = document.getElementById('game-question-image');
  const buttons = getAnswerButtons();
  const puzzleContainer = document.getElementById('puzzle-questions-container');
  const gameModeTitle = document.getElementById('game-mode-title');
  const matchHint = document.getElementById('match-hint');

  if (gameSettings.playMode === 'puzzle') {
    return;
  }

  if (puzzleContainer) {
    puzzleContainer.innerHTML = '';
    puzzleContainer.style.display = 'none';
  }

  questionText.textContent = question.text;
  applyArabicTextClass(questionText);
  currentOptions = options;
  currentMode = question.type || 'choice';
  currentQuestion = question;

  if (question.image) {
    imageElement.src = question.image;
    imageElement.style.display = 'block';
  } else {
    imageElement.removeAttribute('src');
    imageElement.style.display = 'none';
  }

  if (currentMode === 'matching') {
    gameModeTitle.textContent = 'Соответствие';
    matchHint.style.display = 'block';
  } else {
    gameModeTitle.textContent = 'Вопрос';
    matchHint.style.display = 'none';
  }

  buttons.forEach((btn, index) => {
    const isVisible = index < options.length;
    const option = isVisible ? options[index] : '';
    const previewImg = btn.querySelector('.answer-image-preview');

    btn.classList.toggle('is-hidden', !isVisible);
    btn.style.display = isVisible ? 'block' : 'none';
    btn.querySelector('.btn-text').textContent = isVisible ? getAnswerText(option) : '';
    applyArabicTextClass(btn);
    btn.disabled = !isVisible;
    btn.style.backgroundColor = '';
    btn.style.color = '';

    if (previewImg) {
      if (option && typeof option === 'object' && option.image) {
        previewImg.src = option.image;
        previewImg.style.display = 'block';
      } else {
        previewImg.removeAttribute('src');
        previewImg.style.display = 'none';
      }
    }
  });

  correctAnswerIndex = options.findIndex((item) => {
    return getAnswerText(item) === getAnswerText(question.correctAnswer);
  });

  updateGameHeader();
}

function generateFallbackDistractors(correctAnswer, questionText, extraPool = []) {
  const answer = String(correctAnswer || '').trim().toLowerCase();
  const text = String(questionText || '').trim().toLowerCase();
  const fallbackPool = [
    'Серебро', 'Золото', 'Алюминий', 'Медь', 'Железо', 'Кальций', 'Натрий', 'Кислород',
    'Марс', 'Венера', 'Юпитер', 'Сатурн', 'Уран', 'Нептун', 'Луна', 'Меркурий',
    'Париж', 'Берлин', 'Рим', 'Москва', 'Лондон', 'Вена', 'Прага', 'Токио',
    '7', '9', '10', '12', '6', '4', '5', '11',
    'Вода', 'Воздух', 'Песок', 'Пластик', 'Стекло', 'Дерево', 'Бумага', 'Нефть'
  ];

  const normalizedExtra = (Array.isArray(extraPool) ? extraPool : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  const preferred = [];

  if (text.includes('металл') || text.includes('металла')) {
    preferred.push('Алюминий', 'Медь', 'Железо');
  }
  if (text.includes('планет') || text.includes('солнечной')) {
    preferred.push('Марс', 'Венера', 'Юпитер');
  }
  if (text.includes('столица') || text.includes('страна')) {
    preferred.push('Берлин', 'Рим', 'Москва');
  }
  if (text.includes('сколько') || /\d/.test(text)) {
    preferred.push('7', '9', '10');
  }

  const combined = [...normalizedExtra, ...preferred, ...fallbackPool];
  const unique = [...new Set(combined.map((item) => String(item).trim()).filter(Boolean))]
    .filter((item) => String(item).trim().toLowerCase() !== answer);

  return unique.slice(0, 3);
}

function getDistractorsForQuestion(question) {
  const correctAnswer = getAnswerText(question.correctAnswer);
  const pool = (question.wrongAnswers || []).map((item) => getAnswerText(item)).filter(Boolean);
  const otherAnswers = (questionsDatabase || [])
    .filter((item) => item !== question)
    .map((item) => getAnswerText(item.correctAnswer))
    .filter(Boolean)
    .filter((item) => item !== correctAnswer);

  const candidatePool = [...pool, ...otherAnswers];
  const uniquePool = candidatePool.filter((item, index) => item !== correctAnswer && candidatePool.indexOf(item) === index);

  if (uniquePool.length >= 3) {
    const shuffled = [...uniquePool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  const fallbackPool = uniquePool.length > 0
    ? uniquePool
    : [];

  return generateFallbackDistractors(correctAnswer, question.text, fallbackPool)
    .filter((item) => item !== correctAnswer)
    .slice(0, 3);
}

function buildAnswerOption(item) {
  if (item && typeof item === 'object' && item.text) {
    return item;
  }
  return item;
}

function getAnswerText(item) {
  if (item && typeof item === 'object' && item !== null) {
    return item.text || '';
  }
  return String(item || '');
}

function loadRandomQuestion() {
  if (questionsDatabase.length === 0) {
    stopGame();
    return;
  }

  resetButtons();

  if (gameSettings.playMode === 'reverse-survey') {
    loadRandomReverseQuestion();
    return;
  }

  if (gameSettings.playMode === 'puzzle') {
    if (puzzleQueue.length === 0) {
      finishLearning();
      return;
    }

    const roundQuestions = puzzleQueue.splice(0, Math.min(3, puzzleQueue.length));
    if (roundQuestions.length === 0) {
      finishLearning();
      return;
    }

    const roundAnswers = roundQuestions.map((question) => buildAnswerOption(question.correctAnswer));
    const shuffledAnswers = [...roundAnswers].sort(() => Math.random() - 0.5);
    renderPuzzleRound(roundQuestions, shuffledAnswers);
    return;
  }

  const randomQuestion = questionsDatabase[Math.floor(Math.random() * questionsDatabase.length)];
  currentQuestion = randomQuestion;

  const distractors = getDistractorsForQuestion(randomQuestion);
  const correctOption = buildAnswerOption(randomQuestion.correctAnswer);
  const wrongOptions = distractors.map(buildAnswerOption);
  const options = [correctOption, ...wrongOptions];
  const shuffled = [...options].sort(() => Math.random() - 0.5);

  renderQuestion(randomQuestion, shuffled);
  startTimer();
}

function buildReverseQuestionKey(question) {
  const baseText = sanitizeText(getAnswerText(question?.text || ''), 400);
  const baseAnswer = sanitizeText(getAnswerText(question?.correctAnswer || ''), 400);
  return `${baseText}::${baseAnswer}`;
}

function loadRandomReverseQuestion() {
  if (questionsDatabase.length === 0) {
    stopGame();
    return;
  }

  resetButtons();

  const sourceQuestion = questionsDatabase[Math.floor(Math.random() * questionsDatabase.length)];
  const sourceKey = buildReverseQuestionKey(sourceQuestion);
  const otherQuestions = questionsDatabase.filter((item) => buildReverseQuestionKey(item) !== sourceKey);
  const distractorPool = otherQuestions.length >= 3 ? otherQuestions : otherQuestions.slice(0, 3);

  const optionPool = [sourceQuestion, ...distractorPool].slice(0, 4);
  const shuffledOptions = shuffleArray(optionPool.map((item) => ({
    text: getAnswerText(item.text),
    questionKey: buildReverseQuestionKey(item)
  }))).slice(0, 4);

  const fallbackQuestionText = getAnswerText(sourceQuestion?.correctAnswer || '');
  const promptText = fallbackQuestionText || getAnswerText(sourceQuestion?.text || '');

  renderReverseSurveyQuestion(sourceQuestion, shuffledOptions, promptText, sourceKey);
  startTimer();
}

function renderReverseSurveyQuestion(question, options, promptText, questionKey) {
  const questionText = document.getElementById('game-question-text');
  const imageElement = document.getElementById('game-question-image');
  const buttons = getAnswerButtons();
  const puzzleContainer = document.getElementById('puzzle-questions-container');
  const gameModeTitle = document.getElementById('game-mode-title');
  const matchHint = document.getElementById('match-hint');

  if (puzzleContainer) {
    puzzleContainer.innerHTML = '';
    puzzleContainer.style.display = 'none';
  }

  questionText.textContent = promptText || 'Выбери вопрос по ответу';
  applyArabicTextClass(questionText);
  currentOptions = options;
  currentMode = 'choice';
  currentQuestion = question;
  currentReverseQuestionKey = questionKey || buildReverseQuestionKey(question);

  imageElement.removeAttribute('src');
  imageElement.style.display = 'none';

  gameModeTitle.textContent = 'Обратный опрос';
  matchHint.style.display = 'none';

  buttons.forEach((btn, index) => {
    const isVisible = index < options.length;
    const option = isVisible ? options[index] : '';
    const previewImg = btn.querySelector('.answer-image-preview');

    btn.classList.toggle('is-hidden', !isVisible);
    btn.style.display = isVisible ? 'block' : 'none';
    btn.querySelector('.btn-text').textContent = isVisible ? getAnswerText(option?.text || '') : '';
    btn.dataset.optionKey = isVisible ? (option?.questionKey || '') : '';
    applyArabicTextClass(btn);
    btn.disabled = !isVisible;
    btn.style.backgroundColor = '';
    btn.style.color = '';

    if (previewImg) {
      previewImg.removeAttribute('src');
      previewImg.style.display = 'none';
    }
  });

  currentCorrectOptionKey = options.find((item) => item.questionKey === currentReverseQuestionKey)?.questionKey || '';
  correctAnswerIndex = options.findIndex((item) => item.questionKey === currentReverseQuestionKey);
  updateGameHeader();
}

function highlightCorrectAnswer() {
  const buttons = getAnswerButtons();
  if (buttons[correctAnswerIndex]) {
    setButtonVisualState(buttons[correctAnswerIndex], 'correct');
  }
}

function handlePuzzleQuestionSelection(questionIndex) {
  getPuzzleQuestionButtons().forEach((button) => {
    button.classList.remove('puzzle-error-shake');
  });
  getAnswerButtons().forEach((button) => {
    button.classList.remove('puzzle-error-shake');
  });

  puzzleState.pendingQuestion = questionIndex;
  getPuzzleQuestionButtons().forEach((button) => {
    button.classList.toggle('is-selected', Number(button.dataset.questionIndex) === questionIndex);
  });
}

function handlePuzzleSelection(answerIndex) {
  const buttons = getAnswerButtons();

  if (gameSettings.playMode !== 'puzzle') {
    checkAnswer(answerIndex);
    return;
  }

  if (puzzleState.pendingQuestion === null || puzzleState.pendingQuestion === undefined) {
    return;
  }

  const selectedQuestion = puzzleState.roundQuestions[puzzleState.pendingQuestion];
  const selectedAnswer = puzzleState.roundAnswers[answerIndex];
  const isCorrect = getAnswerText(selectedAnswer) === getAnswerText(selectedQuestion?.correctAnswer);
  const questionIndex = puzzleState.pendingQuestion;

  if (isCorrect) {
    stats.correct += 1;
    totalAnswered += 1;
    buttons[answerIndex].classList.add('is-correct');

    const remainingQuestions = puzzleState.roundQuestions.filter((_, index) => index !== questionIndex);
    const remainingAnswers = puzzleState.roundAnswers.filter((_, index) => index !== answerIndex);

    if (remainingQuestions.length === 0) {
      setTimeout(() => {
        buttons.forEach((btn) => btn.classList.remove('is-selected', 'is-correct', 'is-wrong', 'puzzle-error-shake'));
        document.querySelectorAll('.puzzle-question-btn').forEach((btn) => btn.classList.remove('is-selected', 'puzzle-error-shake'));
        loadRandomQuestion();
      }, 900);
      return;
    }

    setTimeout(() => {
      buttons.forEach((btn) => btn.classList.remove('is-selected', 'is-correct', 'is-wrong', 'puzzle-error-shake'));
      document.querySelectorAll('.puzzle-question-btn').forEach((btn) => btn.classList.remove('is-selected', 'puzzle-error-shake'));
      renderPuzzleRound(remainingQuestions, remainingAnswers);
    }, 900);
    return;
  }

  stats.incorrect += 1;
  stats.missedQuestions.push({
    question: selectedQuestion?.text || 'Вопрос',
    yourAnswer: getAnswerText(selectedAnswer),
    correctAnswer: getAnswerText(selectedQuestion?.correctAnswer || '')
  });
  buttons.forEach((btn) => btn.classList.add('puzzle-error-shake'));
  document.querySelectorAll('.puzzle-question-btn').forEach((btn) => btn.classList.add('puzzle-error-shake'));
  buttons[answerIndex].classList.add('is-wrong');
  puzzleState.pendingQuestion = null;
  document.querySelectorAll('.puzzle-question-btn').forEach((btn) => btn.classList.remove('is-selected'));
}

function checkAnswer(selectedIndex) {
  clearInterval(timerInterval);
  const buttons = getAnswerButtons();
  buttons.forEach((btn) => {
    btn.disabled = true;
  });

  totalAnswered += 1;
  const isReverseSurvey = gameSettings.playMode === 'reverse-survey';
  const selectedKey = buttons[selectedIndex]?.dataset.optionKey || '';
  const isCorrect = isReverseSurvey
    ? selectedIndex >= 0 && selectedKey === currentCorrectOptionKey
    : selectedIndex >= 0 && selectedIndex === correctAnswerIndex;

  if (isCorrect) {
    setButtonVisualState(buttons[selectedIndex], 'correct');
    stats.correct += 1;
  } else {
    if (selectedIndex >= 0) {
      setButtonVisualState(buttons[selectedIndex], 'wrong');
    }
    highlightCorrectAnswer();
    stats.incorrect += 1;
    stats.missedQuestions.push({
      question: isReverseSurvey ? getAnswerText(currentQuestion?.correctAnswer || '') : (currentQuestion?.text || 'Вопрос'),
      yourAnswer: selectedIndex >= 0 ? getAnswerText(currentOptions[selectedIndex]) : 'Не успел',
      correctAnswer: isReverseSurvey ? (currentQuestion?.text || 'Вопрос') : getAnswerText(currentQuestion?.correctAnswer || '')
    });
  }

  const shouldFinish = (gameSettings.mode === 'classic' || gameSettings.mode === 'sprint')
    && totalAnswered >= gameSettings.questionCount;

  const nextAction = () => {
    if (shouldFinish) {
      finishLearning();
    } else {
      loadRandomQuestion();
    }
  };

  setTimeout(nextAction, gameSettings.mode === 'marathon' ? 700 : 1500);
}

function updateWrongAnswerInputs() {
  const wrongCount = Number(document.getElementById('wrong-count-select').value);
  const inputs = Array.from(document.querySelectorAll('#wrong-answer-inputs .wrong-ans'));

  inputs.forEach((input, index) => {
    const container = input.closest('.form-group-sub');
    container.style.display = index < wrongCount ? 'block' : 'none';
  });
}

function collectWrongAnswers() {
  const wrongCount = Number(document.getElementById('wrong-count-select').value);
  const inputs = Array.from(document.querySelectorAll('#wrong-answer-inputs .wrong-ans'));
  const manualAnswers = inputs
    .filter((input, index) => index < wrongCount)
    .map((input) => input.value.trim())
    .filter(Boolean);

  if (manualAnswers.length > 0) {
    return manualAnswers;
  }

  const bulkText = document.getElementById('bulk-wrong-answers').value || '';
  return bulkText
    .split(/[.,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, wrongCount);
}

function parseBulkWrongAnswers() {
  const raw = document.getElementById('bulk-wrong-answers').value || '';
  const cleaned = raw
    .split(/[.,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const inputs = Array.from(document.querySelectorAll('#wrong-answer-inputs .wrong-ans'));
  inputs.forEach((input, index) => {
    input.value = cleaned[index] || '';
  });

  return cleaned;
}

function syncBulkWrongAnswersToInputs() {
  const bulkText = document.getElementById('bulk-wrong-answers').value || '';
  const cleaned = bulkText
    .split(/[.,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const inputs = Array.from(document.querySelectorAll('#wrong-answer-inputs .wrong-ans'));
  inputs.forEach((input, index) => {
    input.value = cleaned[index] || '';
  });
}

function generateRandomWrongAnswers() {
  const wrongCount = Number(document.getElementById('wrong-count-select').value);
  const wordPool = [
    'Альфа', 'Бета', 'Гамма', 'Дельта', 'Эпсилон', 'Зета', 'Эта', 'Тета',
    'Иота', 'Каппа', 'Лямбда', 'Мю', 'Ню', 'Кси', 'Омикрон', 'Пи', 'Ро',
    'Сигма', 'Тау', 'Упсилон', 'Фи', 'Хи', 'Пси', 'Омега', 'Книга', 'Река',
    'Лес', 'Мост', 'Окно', 'Птица', 'Солнце', 'Море', 'Гора', 'Звезда', 'Дом', 'Город'
  ];

  const generated = Array.from({ length: Math.max(1, wrongCount) }, () => {
    const randomWord = wordPool[Math.floor(Math.random() * wordPool.length)];
    return randomWord;
  });

  document.getElementById('bulk-wrong-answers').value = generated.join(', ');
  syncBulkWrongAnswersToInputs();
  return generated;
}

function shuffleArray(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

function normalizePdfLine(line) {
  return String(line || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeQuestionLine(line) {
  const normalized = line.toLowerCase();
  return normalized.includes('вопрос')
    || normalized.includes('question')
    || normalized.includes('?')
    || normalized.startsWith('q ');
}

function looksLikeAnswerLine(line) {
  const normalized = line.toLowerCase();
  return normalized.includes('ответ')
    || normalized.includes('answer')
    || normalized.includes('правильный')
    || normalized.includes('правильный ответ')
    || normalized.includes('вариант')
    || normalized.includes('correct');
}

function looksLikeVocabularyPair(questionText, answerText) {
  const question = String(questionText || '').trim();
  const answer = String(answerText || '').trim();

  if (!question || !answer) {
    return false;
  }

  if (question.length > 160 || answer.length > 160) {
    return false;
  }

  if (/^(вопрос|question|ответ|answer|правильный|вариант|correct)$/i.test(question)
    || /^(вопрос|question|ответ|answer|правильный|вариант|correct)$/i.test(answer)) {
    return false;
  }

  const countWords = (value) => value.split(/\s+/).filter(Boolean).length;
  return countWords(question) <= 8 && countWords(answer) <= 12;
}

function cleanPdfTextFragment(text) {
  return String(text || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-•\d.)(\s]+/, '')
    .trim();
}

function parseSingleVocabularyPair(line) {
  const compact = String(line || '').replace(/\s+/g, ' ').trim();
  if (!compact || compact.length > 220) {
    return null;
  }

  const parenthesizedMatch = compact.match(/^\((.+?)\s*\?\s*(.+)\)$/);
  if (parenthesizedMatch) {
    const questionText = cleanPdfTextFragment(parenthesizedMatch[1]);
    const answerText = cleanPdfTextFragment(parenthesizedMatch[2]);
    if (questionText && answerText && !looksLikeAnswerLine(questionText) && !looksLikeQuestionLine(answerText)) {
      return { text: questionText, correctAnswer: answerText };
    }
  }

  const separatorMatch = compact.match(/^(.+?)\s*(?:[:=]|—|–|―|→|=>|\/|\||- )\s*(.+)$/);
  if (separatorMatch) {
    const questionText = cleanPdfTextFragment(separatorMatch[1]);
    const answerText = cleanPdfTextFragment(separatorMatch[2]);

    if (!questionText || !answerText) {
      return null;
    }

    if (looksLikeQuestionLine(questionText)
      || looksLikeAnswerLine(questionText)
      || looksLikeAnswerLine(answerText)) {
      return null;
    }

    if (looksLikeVocabularyPair(questionText, answerText)) {
      return { text: questionText, correctAnswer: answerText };
    }
  }

  const questionAnswerMatch = compact.match(/^(.+?)\s*\?\s*(.+)$/);
  if (questionAnswerMatch) {
    const questionText = cleanPdfTextFragment(questionAnswerMatch[1]);
    const answerText = cleanPdfTextFragment(questionAnswerMatch[2]);
    const cleanedAnswer = answerText.replace(/[).]+$/g, '').trim();
    if (questionText && cleanedAnswer && !looksLikeAnswerLine(questionText) && !looksLikeQuestionLine(cleanedAnswer)) {
      return { text: questionText, correctAnswer: cleanedAnswer };
    }
  }

  const tokens = compact.split(/\s+/).filter(Boolean);
  if (tokens.length === 2 && !/[?!.;:(),]/.test(compact) && tokens.every((token) => token.length <= 40)) {
    const [questionText, answerText] = tokens.map((token) => cleanPdfTextFragment(token));

    if (questionText && answerText
      && !looksLikeQuestionLine(questionText)
      && !looksLikeAnswerLine(questionText)
      && !looksLikeAnswerLine(answerText)) {
      return { text: questionText, correctAnswer: answerText };
    }
  }

  return null;
}

function parseAlternatingWordPairs(lines) {
  const pairs = [];

  lines.forEach((line) => {
    const compact = String(line || '').replace(/\s+/g, ' ').trim();
    if (!compact || compact.length > 220 || /[?!.;:(),]/.test(compact)) {
      return;
    }

    const tokens = compact.split(/\s+/).filter(Boolean);
    if (tokens.length >= 4 && tokens.length % 2 === 0 && tokens.every((token) => token.length <= 40)) {
      const half = tokens.length / 2;
      const firstHalf = tokens.slice(0, half);
      const secondHalf = tokens.slice(half);

      firstHalf.forEach((questionToken, tokenIndex) => {
        const answerToken = secondHalf[tokenIndex];
        if (!questionToken || !answerToken) {
          return;
        }

        const questionText = cleanPdfTextFragment(questionToken);
        const answerText = cleanPdfTextFragment(answerToken);

        if (questionText && answerText
          && !looksLikeQuestionLine(questionText)
          && !looksLikeAnswerLine(questionText)
          && !looksLikeAnswerLine(answerText)) {
          pairs.push({ text: questionText, correctAnswer: answerText });
        }
      });
    }
  });

  return pairs;
}

function buildFallbackPairsFromLines(lines) {
  const pairs = [];
  const normalizedLines = lines
    .map((line) => cleanPdfTextFragment(line))
    .filter((line) => line && line.length <= 140 && !/^(?:ответ|answer|правильный|вариант|correct|вопрос|question)$/i.test(line));

  for (let index = 0; index < normalizedLines.length - 1; index += 2) {
    const questionText = normalizedLines[index];
    const answerText = normalizedLines[index + 1];

    if (questionText && answerText && questionText !== answerText) {
      pairs.push({ text: questionText, correctAnswer: answerText });
    }
  }

  if (pairs.length === 0) {
    normalizedLines.forEach((line, index) => {
      const nextLine = normalizedLines[index + 1];
      if (line && nextLine && line.length <= 80 && nextLine.length <= 80) {
        pairs.push({ text: line, correctAnswer: nextLine });
      }
    });
  }

  return pairs;
}

function extractQuestionAnswerPairs(rawText) {
  const lines = String(rawText || '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(normalizePdfLine)
    .filter(Boolean);

  const permissivePairs = [];
  const pattern = /(?:\()?\s*([^?()\n]+)\s*\?\s*([^)\n]+)(?:\))?/g;
  const directText = String(rawText || '');
  let match;
  while ((match = pattern.exec(directText)) !== null) {
    const questionText = cleanPdfTextFragment(match[1]);
    const answerText = cleanPdfTextFragment(match[2]);
    if (questionText && answerText) {
      permissivePairs.push({ text: questionText, correctAnswer: answerText });
    }
  }

  if (permissivePairs.length > 0) {
    return permissivePairs;
  }

  const pairs = [];
  let pendingQuestion = '';

  lines.forEach((line) => {
    const compact = line.replace(/\s+/g, ' ').trim();

    const vocabularyPair = parseSingleVocabularyPair(compact);
    if (vocabularyPair) {
      pairs.push(vocabularyPair);
      pendingQuestion = '';
      return;
    }

    const singleWordLine = compact.match(/^([A-Za-zА-Яа-яЁё]+)$/u);
    if (singleWordLine && !pendingQuestion) {
      pendingQuestion = cleanPdfTextFragment(singleWordLine[1]);
      return;
    }

    if (singleWordLine && pendingQuestion) {
      const answerText = cleanPdfTextFragment(singleWordLine[1]);
      if (answerText && answerText !== pendingQuestion) {
        pairs.push({ text: pendingQuestion, correctAnswer: answerText });
        pendingQuestion = '';
      }
      return;
    }

    const numberedPairMatch = compact.match(/^(?:вопрос|question)\s*(\d+)\s*[:\-–—]?\s*(.+?)\s*(?:ответ|answer)\s*(\d+)\s*[:\-–—]?\s*(.+)$/i);
    if (numberedPairMatch) {
      const questionText = cleanPdfTextFragment(numberedPairMatch[2]);
      const answerText = cleanPdfTextFragment(numberedPairMatch[4]);
      if (questionText && answerText) {
        pairs.push({ text: questionText, correctAnswer: answerText });
        pendingQuestion = '';
        return;
      }
    }

    const numberedQuestionMatch = compact.match(/^(?:вопрос|question)\s*(\d+)\s*[:\-–—]?\s*(.+)$/i);
    if (numberedQuestionMatch) {
      pendingQuestion = cleanPdfTextFragment(numberedQuestionMatch[2]);
      return;
    }

    const numberedAnswerMatch = compact.match(/^(?:ответ|answer)\s*(\d+)\s*[:\-–—]?\s*(.+)$/i);
    if (numberedAnswerMatch) {
      const answerText = cleanPdfTextFragment(numberedAnswerMatch[2]);
      if (pendingQuestion && answerText) {
        pairs.push({ text: pendingQuestion, correctAnswer: answerText });
        pendingQuestion = '';
      }
      return;
    }

    const vocabularyMatch = compact.match(/^(.+?)\s*(?:—|–|―|→|=>|\/|\||\s-\s)\s*(.+)$/);
    if (vocabularyMatch) {
      const questionText = cleanPdfTextFragment(vocabularyMatch[1]);
      const answerText = cleanPdfTextFragment(vocabularyMatch[2]);
      if (questionText && answerText && looksLikeVocabularyPair(questionText, answerText)) {
        pairs.push({ text: questionText, correctAnswer: answerText });
        pendingQuestion = '';
        return;
      }
    }

    const labelMatch = compact.match(/(?:вопрос|question)\s*[:\-–—]?\s*(.+?)(?=(?:\s*(?:ответ|answer|правильный\s+ответ|правильный\s+вариант|correct)\s*[:\-–—]?))/i);
    const answerMatch = compact.match(/(?:ответ|answer|правильный\s+ответ|правильный\s+вариант|correct)\s*[:\-–—]?\s*(.+)$/i);

    if (labelMatch && answerMatch) {
      const questionText = cleanPdfTextFragment(labelMatch[1]);
      const answerText = cleanPdfTextFragment(answerMatch[1]);
      if (questionText && answerText) {
        pairs.push({ text: questionText, correctAnswer: answerText });
        pendingQuestion = '';
        return;
      }
    }

    const questionMarkMatch = compact.match(/^(.+?)\s*\?\s*(.+)$/);
    if (questionMarkMatch) {
      const questionText = cleanPdfTextFragment(questionMarkMatch[1]);
      const answerText = cleanPdfTextFragment(questionMarkMatch[2]);
      if (questionText && answerText && answerText.length < 140) {
        pairs.push({ text: questionText, correctAnswer: answerText });
        pendingQuestion = '';
        return;
      }
    }

    const combinedMatch = compact.match(/^(?:вопрос|question)\s*[:\-–—]?\s*(.+?)\s*(?:ответ|answer|правильный\s+ответ|правильный\s+вариант|correct)\s*[:\-–—]?\s*(.+)$/i);
    if (combinedMatch) {
      const questionText = cleanPdfTextFragment(combinedMatch[1]);
      const answerText = cleanPdfTextFragment(combinedMatch[2]);
      if (questionText && answerText) {
        pairs.push({ text: questionText, correctAnswer: answerText });
        pendingQuestion = '';
        return;
      }
    }

    const questionCueMatch = compact.match(/^(?:вопрос|question)\s*[:\-–—]?\s*(.+)$/i);
    if (questionCueMatch) {
      pendingQuestion = cleanPdfTextFragment(questionCueMatch[1]);
      return;
    }

    const answerCueMatch = compact.match(/^(?:ответ|answer|правильный\s+ответ|правильный\s+вариант|correct)\s*[:\-–—]?\s*(.+)$/i);
    if (answerCueMatch) {
      const answerText = cleanPdfTextFragment(answerCueMatch[1]);
      if (pendingQuestion && answerText) {
        pairs.push({ text: pendingQuestion, correctAnswer: answerText });
        pendingQuestion = '';
      } else if (answerText) {
        pairs.push({ text: 'Вопрос', correctAnswer: answerText });
      }
      return;
    }

    if (pendingQuestion && compact && !looksLikeQuestionLine(compact) && !looksLikeAnswerLine(compact)) {
      const candidateAnswer = cleanPdfTextFragment(compact);
      if (candidateAnswer) {
        pairs.push({ text: pendingQuestion, correctAnswer: candidateAnswer });
        pendingQuestion = '';
      }
      return;
    }

    if (!pendingQuestion && looksLikeQuestionLine(compact)) {
      pendingQuestion = cleanPdfTextFragment(compact);
    }
  });

  if (pairs.length === 0) {
    const alternatingPairs = parseAlternatingWordPairs(lines);
    if (alternatingPairs.length > 0) {
      return alternatingPairs;
    }

    const fallbackPairs = buildFallbackPairsFromLines(lines);
    if (fallbackPairs.length > 0) {
      return fallbackPairs;
    }

    const likelyQuestions = lines
      .filter((line) => {
        const compact = line.replace(/\s+/g, ' ').trim();
        return compact.length > 8 && compact.length < 180 && /[?а-яa-z]/i.test(compact);
      })
      .map((line) => cleanPdfTextFragment(line))
      .filter((line) => !/^(?:ответ|answer|правильный|вариант|correct|вопрос|question)/i.test(line));

    likelyQuestions.forEach((line, i) => {
      const nextLine = lines[i + 1] || '';
      if (line && nextLine && nextLine.length < 120) {
        pairs.push({ text: line, correctAnswer: cleanPdfTextFragment(nextLine) });
      }
    });
  }

  return pairs;
}

function createImportedQuestion(pair, fallbackAnswers) {
  const distractors = fallbackAnswers.filter(Boolean);
  const wrongAnswers = distractors.length > 0
    ? shuffleArray(distractors).slice(0, Math.min(3, distractors.length))
    : generateFallbackDistractors(pair.correctAnswer, pair.text);

  return {
    text: pair.text,
    correctAnswer: pair.correctAnswer,
    wrongAnswers,
    image: '',
    type: 'choice'
  };
}

function createCanvasFromImageUrl(imageUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = reject;
    image.src = imageUrl;
  });
}

function preprocessCanvas(canvas, mode) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    let gray = Math.round((r * 0.299) + (g * 0.587) + (b * 0.114));

    if (mode === 'contrast') {
      gray = Math.max(0, Math.min(255, Math.round(((gray - 128) * 1.45) + 128)));
    } else if (mode === 'binary') {
      gray = gray > 140 ? 255 : 0;
    } else if (mode === 'mixed') {
      gray = Math.max(0, Math.min(255, Math.round(((gray - 128) * 1.25) + 128)));
      gray = gray > 140 ? 255 : 0;
    }

    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

async function recognizeTextFromCanvas(canvas) {
  if (typeof window.Tesseract === 'undefined') {
    throw new Error('Tesseract.js не загружен');
  }

  const worker = await window.Tesseract.createWorker('rus+eng');
  const variants = [
    { label: 'original', canvas },
    { label: 'contrast', canvas: preprocessCanvas(canvas.cloneNode(false), 'contrast') },
    { label: 'binary', canvas: preprocessCanvas(canvas.cloneNode(false), 'binary') },
    { label: 'mixed', canvas: preprocessCanvas(canvas.cloneNode(false), 'mixed') }
  ];

  const texts = [];

  for (const variant of variants) {
    try {
      const imageUrl = variant.canvas.toDataURL('image/png');
      const result = await worker.recognize(imageUrl, { rotateAuto: true, tessedit_pageseg_mode: '6' });
      const text = result?.data?.text || '';
      if (text) {
        texts.push(text);
      }
    } catch (variantError) {
      console.warn('OCR variant failed', variantError);
    }
  }

  await worker.terminate();

  if (texts.length === 0) {
    return '';
  }

  return texts
    .map((text) => text.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];
}

async function ocrTextFromImage(imageUrl) {
  const canvas = await createCanvasFromImageUrl(imageUrl);
  return recognizeTextFromCanvas(canvas);
}

async function ocrPdfPagesToText(file) {
  const bytes = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const chunks = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: context, viewport }).promise;
    const text = await recognizeTextFromCanvas(canvas);
    if (text) {
      chunks.push(text);
    }
  }
  return chunks.join('\n');
}

async function readFileTextWithOcr(file) {
  if (!file) {
    return '';
  }

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    const fileUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    return ocrTextFromImage(fileUrl);
  }

  if (file.type === 'application/pdf') {
    return ocrPdfPagesToText(file);
  }

  return '';
}

function duplicateQuestionEntries(pairs, repeatCount = 1) {
  if (!Array.isArray(pairs) || !pairs.length) {
    return [];
  }

  const repeatNumber = Math.max(1, Number(repeatCount) || 1);
  const expanded = [];

  pairs.forEach((pair) => {
    for (let index = 0; index < repeatNumber; index += 1) {
      expanded.push(pair);
    }
  });

  return expanded;
}

function buildQuestionsFromText(text = null, wrongCountValue = null) {
  const pasteInput = document.getElementById('paste-text-input');
  const sourceText = text ?? pasteInput.value;

  if (!sourceText || !sourceText.trim()) {
    return { error: 'Сначала вставьте текст с вопросами и ответами или список слов.' };
  }

  const pairs = extractQuestionAnswerPairs(sourceText);
  if (pairs.length === 0) {
    return { error: 'Не удалось найти вопросы и ответы или пары слов в вставленном тексте.' };
  }

  const wrongCountSelect = document.getElementById('answer-count-select');
  const wrongCount = Math.max(1, Number(wrongCountValue ?? wrongCountSelect.value) || 3);
  const pool = questionsDatabase.length > 0 ? [...questionsDatabase] : [];
  const repeatedPairs = duplicateQuestionEntries(pairs, gameSettings.repeatCount);

  const generatedQuestions = repeatedPairs.map((pair) => {
    const distractors = pool.length > 0
      ? shuffleArray(pool.map((item) => getAnswerText(item.correctAnswer || item))).filter(Boolean).slice(0, Math.max(1, wrongCount))
      : generateFallbackDistractors(pair.correctAnswer, pair.text);

    return {
      text: pair.text,
      correctAnswer: pair.correctAnswer,
      wrongAnswers: distractors.length > 0 ? distractors : generateFallbackDistractors(pair.correctAnswer, pair.text),
      image: '',
      type: 'choice'
    };
  });

  return { questions: generatedQuestions };
}

function downloadGeneratedTestFile(text = null, wrongCountValue = null) {
  const statusEl = document.getElementById('paste-status');
  const result = buildQuestionsFromText(text, wrongCountValue);

  if (result.error) {
    statusEl.textContent = result.error;
    return;
  }

  const payload = {
    version: 1,
    title: 'Готовый тест из текста',
    author: 'пользователь',
    exportedAt: new Date().toISOString(),
    questions: result.questions
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ready-test.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  statusEl.textContent = 'Готовый тест скачан как JSON-файл.';
}

function generateFromPastedText(text = null, wrongCountValue = null) {
  const pasteInput = document.getElementById('paste-text-input');
  const statusEl = document.getElementById('paste-status');
  const wrongCountSelect = document.getElementById('answer-count-select');
  const sourceText = text ?? pasteInput.value;

  if (!sourceText || !sourceText.trim()) {
    statusEl.textContent = 'Сначала вставьте текст с вопросами и ответами или список слов.';
    return;
  }

  const wrongCount = Math.max(1, Number(wrongCountValue ?? wrongCountSelect.value) || 3);
  statusEl.textContent = 'Разбираю вставленный текст...';

  try {
    const result = buildQuestionsFromText(sourceText, wrongCount);
    if (result.error) {
      statusEl.textContent = result.error;
      return;
    }

    questionsDatabase = result.questions;
    const startButton = document.getElementById('start-game-btn');
    startButton.style.display = 'block';
    startButton.textContent = `Запустить игру (${questionsDatabase.length} вопр.)`;
    statusEl.textContent = `Тест готов: ${questionsDatabase.length} вопросов.`;
    startGame();
  } catch (error) {
    statusEl.textContent = `Не удалось разобрать текст: ${error.message || 'неизвестная ошибка'}`;
    console.error(error);
  }
}

function generateAutoTestFromPdf(file = null, wrongCountValue = null) {
  const fileInput = document.getElementById('auto-pdf-upload');
  const statusEl = document.getElementById('auto-pdf-status');
  const wrongCountSelect = document.getElementById('auto-wrong-count-select');
  const fileToUse = file || fileInput.files[0];

  if (!fileToUse) {
    statusEl.textContent = 'Сначала выберите фото или PDF-файл.';
    return;
  }

  const wrongCount = Math.max(1, Number(wrongCountValue ?? wrongCountSelect.value) || 3);
  statusEl.textContent = 'Считываю текст и создаю тест...';

  (async () => {
    try {
      let fullText = '';
      let pairs = [];

      if (fileToUse.type === 'application/pdf') {
        if (typeof window.pdfjsLib === 'undefined') {
          throw new Error('PDF.js не загружен');
        }

        const pdfBytes = await fileToUse.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
          const page = await pdf.getPage(pageIndex);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item) => item.str).join(' ') + '\n';
        }
        pairs = extractQuestionAnswerPairs(fullText);
      } else if (fileToUse.type.startsWith('image/')) {
        fullText = await readFileTextWithOcr(fileToUse);
        pairs = extractQuestionAnswerPairs(fullText);
      }

      if (pairs.length === 0) {
        const ocrText = await readFileTextWithOcr(fileToUse);
        pairs = extractQuestionAnswerPairs(ocrText);
      }

      if (pairs.length === 0 && fullText) {
        const fallbackLines = fullText
          .split(/\n+/)
          .map((line) => cleanPdfTextFragment(line))
          .filter(Boolean);
        pairs = buildFallbackPairsFromLines(fallbackLines);
      }

      if (pairs.length === 0) {
        statusEl.textContent = 'Не удалось распознать вопросы и ответы из файла. Возможно, файл слишком грязный или это не текстовый документ.';
        return;
      }

      const pool = questionsDatabase.length > 0 ? [...questionsDatabase] : [];
      const repeatedPairs = duplicateQuestionEntries(pairs, gameSettings.repeatCount);
      const generatedQuestions = repeatedPairs.map((pair) => {
        const distractors = pool.length > 0
          ? shuffleArray(pool.map((item) => getAnswerText(item.correctAnswer || item))).filter(Boolean).slice(0, Math.max(1, wrongCount))
          : generateFallbackDistractors(pair.correctAnswer, pair.text);

        return {
          text: pair.text,
          correctAnswer: pair.correctAnswer,
          wrongAnswers: distractors.length > 0 ? distractors : generateFallbackDistractors(pair.correctAnswer, pair.text),
          image: '',
          type: 'choice'
        };
      });

      questionsDatabase = generatedQuestions;
      const importedTitle = getSuggestedImportTitle(fileToUse);
      document.getElementById('test-title-input').value = importedTitle;
      document.getElementById('test-author-input').value = 'ты';
      saveCurrentTestToLibrary({ title: importedTitle, author: 'ты', silent: true });

      const startButton = document.getElementById('start-game-btn');
      startButton.style.display = 'block';
      startButton.textContent = `Запустить игру (${questionsDatabase.length} вопр.)`;
      statusEl.textContent = `Тест готов: ${questionsDatabase.length} вопросов. Сохранён в библиотеку.`;
      startGame();
    } catch (error) {
      statusEl.textContent = `Не удалось создать тест из файла: ${error.message || 'неизвестная ошибка'}`;
      console.error(error);
    }
  })();
}

function updateQuestionTypeUI() {
  const mode = document.getElementById('question-type-select').value;
  const correctLabel = document.getElementById('correct-answer-label');
  const wrongLabel = document.getElementById('wrong-label');

  if (mode === 'matching') {
    correctLabel.textContent = 'Правильное соответствие:';
    wrongLabel.textContent = 'Неправильные соответствия:';
  } else {
    correctLabel.textContent = 'Правильный ответ:';
    wrongLabel.textContent = 'Неправильные варианты:';
  }

  updateWrongAnswerInputs();
}

function getSelectedInputMode() {
  const manualQuestion = document.getElementById('q-text').value.trim();
  const manualAnswer = document.getElementById('correct-ans').value.trim();
  const fileInput = document.getElementById('auto-pdf-upload');
  const pasteText = document.getElementById('paste-text-input').value.trim();

  const hasManualContent = Boolean(manualQuestion || manualAnswer);
  const hasFileContent = Boolean(fileInput.files && fileInput.files.length > 0);
  const hasPasteContent = Boolean(pasteText);

  if (hasManualContent) {
    return 'manual';
  }
  if (hasFileContent) {
    return 'file';
  }
  if (hasPasteContent) {
    return 'paste';
  }
  return null;
}

function validateCurrentMode() {
  const mode = getSelectedInputMode();
  if (!mode) {
    alert('Заполните хотя бы один из режимов: ручной ввод, файл или вставленный текст.');
    return false;
  }
  return true;
}

function saveQuestion() {
  if (!validateCurrentMode()) {
    return;
  }

  const questionText = document.getElementById('q-text').value.trim();
  const correctAnswer = document.getElementById('correct-ans').value.trim();
  const wrongCount = Number(document.getElementById('wrong-count-select').value);
  syncBulkWrongAnswersToInputs();
  const distractors = collectWrongAnswers();



  const correctAnswerOption = answerImageData.correct ? { text: correctAnswer, image: answerImageData.correct } : correctAnswer;
  const wrongAnswerOptions = distractors.map((item, index) => {
    const image = answerImageData.wrong[index];
    return image ? { text: item, image } : item;
  });

  const newQuestion = {
    text: questionText,
    correctAnswer: correctAnswerOption,
    wrongAnswers: wrongAnswerOptions,
    image: currentImage,
    type: document.getElementById('question-type-select').value
  };

  if (editingQuestionIndex !== null && Number.isInteger(editingQuestionIndex) && questionsDatabase[editingQuestionIndex]) {
    questionsDatabase[editingQuestionIndex] = newQuestion;
  } else {
    questionsDatabase.push(newQuestion);
  }

  const startButton = document.getElementById('start-game-btn');
  startButton.style.display = 'block';
  startButton.textContent = `Запустить игру (${questionsDatabase.length} вопр.)`;
  renderEditingQuestionsList();

  document.getElementById('quiz-form').reset();
  document.querySelectorAll('.answer-image-status').forEach((el) => {
    el.textContent = '';
  });
  currentImage = '';
  answerImageData = { correct: '', wrong: [] };
  editingQuestionIndex = null;
}

function clearAllQuestions() {
  const confirmed = confirm('Точно хотите удалить все сохранения?');
  if (!confirmed) {
    return;
  }

  questionsDatabase = [];
  currentQuestion = null;
  currentImage = '';
  stats = { correct: 0, incorrect: 0, missedQuestions: [] };
  totalAnswered = 0;

  const startButton = document.getElementById('start-game-btn');
  startButton.style.display = 'none';
  startButton.textContent = 'Запустить игру (0 вопросов)';
  renderEditingQuestionsList();
  document.getElementById('quiz-form').reset();
  alert('Все сохранения удалены.');
}

function startGame(testData = null) {
  const sourceQuestions = testData && Array.isArray(testData.questions)
    ? testData.questions.map((item) => ({ ...item }))
    : questionsDatabase;

  if (!Array.isArray(sourceQuestions) || sourceQuestions.length === 0) {
    alert('Сначала сохраните хотя бы один вопрос.');
    return;
  }

  questionsDatabase = sourceQuestions.map((item) => ({ ...item }));
  activeFlow = testData ? 'practice' : 'creator';
  gameSettings.playMode = '';
  stats = { correct: 0, incorrect: 0, missedQuestions: [], durationSeconds: 0 };
  totalAnswered = 0;
  sessionStartTime = Date.now();
  puzzleQueue = [...questionsDatabase];
  puzzleState = {
    selectedQuestionIndex: null,
    selectedAnswerIndex: null,
    pendingQuestion: null,
    pendingAnswer: null,
    roundQuestions: [],
    roundAnswers: [],
    completedPairs: 0
  };
  gameSettings.questionCount = getEffectiveQuestionCount();
  updateGameHeader();
  showPage('game');
  loadRandomQuestion();
}

function startReverseSurvey(testData = null) {
  const sourceQuestions = testData && Array.isArray(testData.questions)
    ? testData.questions.map((item) => ({ ...item }))
    : questionsDatabase;

  if (!Array.isArray(sourceQuestions) || sourceQuestions.length === 0) {
    alert('Сначала сохраните хотя бы один вопрос.');
    return;
  }

  questionsDatabase = sourceQuestions.map((item) => ({ ...item }));
  activeFlow = testData ? 'practice' : 'creator';
  gameSettings.playMode = 'reverse-survey';
  stats = { correct: 0, incorrect: 0, missedQuestions: [], durationSeconds: 0 };
  totalAnswered = 0;
  sessionStartTime = Date.now();
  puzzleQueue = [...questionsDatabase];
  puzzleState = {
    selectedQuestionIndex: null,
    selectedAnswerIndex: null,
    pendingQuestion: null,
    pendingAnswer: null,
    roundQuestions: [],
    roundAnswers: [],
    completedPairs: 0
  };
  gameSettings.questionCount = getEffectiveQuestionCount();
  updateGameHeader();
  showPage('game');
  loadRandomQuestion();
}

function stopGame() {
  clearInterval(timerInterval);
  timerInterval = null;
  resetButtons();
  sessionStartTime = null;
  currentQuestion = null;
  currentOptions = [];
  currentReverseQuestionKey = '';
  currentCorrectOptionKey = '';
  editingQuestionIndex = null;
  showPage(activeFlow === 'practice' ? 'practice' : 'creator');
  if (activeFlow !== 'practice') {
    syncEditingUI();
  }

  const gameButton = document.getElementById('start-game-btn');
  if (gameButton) {
    gameButton.textContent = `Запустить игру (${questionsDatabase.length} вопр.)`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderStats() {
  if (!settings.stats) {
    return;
  }
  const correctEl = document.getElementById('stats-correct');
  const incorrectEl = document.getElementById('stats-incorrect');
  const totalEl = document.getElementById('stats-total');
  const percentEl = document.getElementById('stats-percent');
  const timeEl = document.getElementById('stats-time');
  const listEl = document.getElementById('stats-list');
  const progressRing = document.querySelector('.progress-ring');

  const total = Math.max(totalAnswered, 1);
  const percent = Math.round((stats.correct / total) * 100);

  correctEl.textContent = stats.correct;
  incorrectEl.textContent = stats.incorrect;
  totalEl.textContent = total;
  percentEl.textContent = `${percent}%`;
  if (timeEl) {
    timeEl.textContent = formatDuration(stats.durationSeconds || 0);
  }
  progressRing.style.background = `conic-gradient(var(--accent-2) ${percent * 3.6}deg, var(--card-bg) 0deg)`;

  listEl.innerHTML = '';

  if (stats.missedQuestions.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'Пока нет ошибок — молодец!';
    listEl.appendChild(emptyItem);
    return;
  }

  stats.missedQuestions.forEach((item) => {
    const listItem = document.createElement('li');
    const question = document.createElement('strong');
    question.textContent = sanitizeText(item.question, 300);

    const answerText = document.createElement('div');
    answerText.textContent = `Ваш ответ: ${sanitizeText(item.yourAnswer, 300)}`;

    const correctText = document.createElement('div');
    correctText.textContent = `Правильный: ${sanitizeText(item.correctAnswer, 300)}`;

    listItem.appendChild(question);
    listItem.appendChild(answerText);
    listItem.appendChild(correctText);
    listEl.appendChild(listItem);
  });
}

function finishLearning() {
  clearInterval(timerInterval);
  if (gameSettings.playMode === 'puzzle') {
    stats.durationSeconds = sessionStartTime ? Math.max(0, Math.floor((Date.now() - sessionStartTime) / 1000)) : 0;
  } else {
    stats.durationSeconds = 0;
  }

  const total = Math.max(totalAnswered, 1);
  const percent = Math.round((stats.correct / total) * 100);
  const title = sanitizeText(document.getElementById('test-title-input')?.value || 'Без названия', 120);
  recordAccountHistory({
    title,
    score: stats.correct,
    total,
    percent
  });

  if (settings.stats) {
    showPage('stats');
    renderStats();
  } else {
    showPage('creator');
  }
}

function updateGameModeUI() {
  const modeSelect = document.getElementById('game-mode-select');
  const questionCountSetting = document.getElementById('question-count-setting');
  const modeHint = document.getElementById('game-mode-hint');
  const timeSelect = document.getElementById('question-time-select');
  const repeatCountSelect = document.getElementById('repeat-count-select');

  if (!modeSelect || !questionCountSetting || !modeHint || !timeSelect) {
    return;
  }

  const selectedMode = modeSelect.value;
  gameSettings.mode = selectedMode;
  gameSettings.timePerQuestion = Number(timeSelect.value) || 5;
  gameSettings.questionCount = getEffectiveQuestionCount();
  gameSettings.repeatCount = Number(repeatCountSelect.value) || 1;

  questionCountSetting.style.display = selectedMode === 'marathon' ? 'none' : 'flex';

  const hints = {
    classic: 'Классический режим: серия автоматически подстраивается под текущий набор вопросов.',
    sprint: 'Спринт: быстрый режим, где количество вопросов подстраивается под доступный набор.',
    marathon: 'Марафон: без таймера, продолжайте отвечать, пока не решите закончить.'
  };

  modeHint.textContent = hints[selectedMode] || hints.classic;

  updateGameHeader();
}

function applyTheme() {
  const appContainer = document.querySelector('.app-container');
  if (appContainer) {
    appContainer.style.background = 'rgba(15, 23, 42, 0.96)';
    appContainer.style.color = '#f8fafc';
  }
  document.body.setAttribute('data-theme', 'dark');
  safeStorageSet(STORAGE_KEYS.theme, 'dark');
}

function handleThemeChange() {
  applyTheme();
}

function getCurrentPage() {
  const welcomeScreen = document.getElementById('welcome-screen');
  const practiceSection = document.getElementById('practice-section');
  const historySection = document.getElementById('history-section');
  const creatorSection = document.getElementById('creator-section');
  const gameSection = document.getElementById('game-section');
  const statsSection = document.getElementById('stats-section');
  const librarySection = document.getElementById('library-section');

  if (welcomeScreen && welcomeScreen.style.display !== 'none') {
    return 'welcome';
  }
  if (practiceSection && practiceSection.style.display !== 'none') {
    return 'practice';
  }
  if (historySection && historySection.style.display !== 'none') {
    return 'history';
  }
  if (creatorSection && creatorSection.style.display !== 'none') {
    return 'creator';
  }
  if (gameSection && gameSection.style.display !== 'none') {
    return 'game';
  }
  if (statsSection && statsSection.style.display !== 'none') {
    return 'stats';
  }
  if (librarySection && librarySection.style.display !== 'none') {
    return 'library';
  }
  return 'welcome';
}

function updatePageNavigation() {
  const prevButton = document.getElementById('prev-page-btn');
  const nextButton = document.getElementById('next-page-btn');

  if (!prevButton || !nextButton) {
    return;
  }

  const currentPage = getCurrentPage();
  prevButton.disabled = currentPage === 'welcome';
  prevButton.textContent = '←';
  nextButton.textContent = currentPage === 'game' ? '✓' : '→';
}

function showPage(pageName, force = false) {
  const sections = {
    welcome: document.getElementById('welcome-screen'),
    practice: document.getElementById('practice-section'),
    history: document.getElementById('history-section'),
    creator: document.getElementById('creator-section'),
    game: document.getElementById('game-section'),
    stats: document.getElementById('stats-section'),
    library: document.getElementById('library-section')
  };

  const currentPage = getCurrentPage();
  if (!force && pageName !== currentPage) {
    previousPage = currentPage;
  }

  Object.values(sections).forEach((section) => {
    if (section) {
      section.style.display = 'none';
    }
  });

  if (pageName === 'welcome') {
    setSectionVisibility(sections.welcome, true, 'flex');
  } else if (pageName === 'practice') {
    setSectionVisibility(sections.practice, true);
    renderPracticeTests();
  } else if (pageName === 'history') {
    setSectionVisibility(sections.history, true);
  } else if (pageName === 'creator') {
    setSectionVisibility(sections.creator, true);
    syncEditingUI();
    showCreatorMode(activeCreatorMode || (editingSavedTestId ? 'editor' : ''));
  } else if (pageName === 'game') {
    setSectionVisibility(sections.game, true);
  } else if (pageName === 'stats') {
    setSectionVisibility(sections.stats, true);
  } else if (pageName === 'library') {
    setSectionVisibility(sections.library, true);
    renderSavedTests();
  }

  updatePageNavigation();
}

function goToPreviousPage() {
  const currentPage = getCurrentPage();
  if (currentPage === 'welcome') {
    return;
  }

  showPage('welcome', true);
}

function goToNextPage() {
  const currentPage = getCurrentPage();

  if (currentPage === 'welcome') {
    showPage('creator', true);
    return;
  }

  if (currentPage === 'creator') {
    if (questionsDatabase.length > 0) {
      startGame();
    } else {
      alert('Сначала сохраните хотя бы один вопрос.');
    }
    return;
  }

  if (currentPage === 'practice') {
    showPage('welcome', true);
    return;
  }

  if (currentPage === 'game') {
    finishLearning();
    return;
  }

  if (currentPage === 'stats') {
    if (activeFlow === 'practice') {
      showPage('practice', true);
    } else {
      showPage('creator', true);
    }
    return;
  }

  if (currentPage === 'library') {
    showPage('creator', true);
  }
}

function loadSavedTests() {
  try {
    loadAccounts();
    const activeAccount = getActiveAccount();
    if (activeAccount) {
      savedTests = Array.isArray(activeAccount.savedTests) ? sanitizeStoredTests(activeAccount.savedTests) : [];
      sharedTests = Array.isArray(activeAccount.sharedTests) ? sanitizeStoredTests(activeAccount.sharedTests) : [];
      accountHistory = Array.isArray(activeAccount.history) ? activeAccount.history : [];
      saveSavedTests();
      return;
    }

    const stored = safeStorageGet(STORAGE_KEYS.savedTests, null);
    savedTests = stored === null ? [] : sanitizeStoredTests(stored);

    const sharedStored = safeStorageGet(STORAGE_KEYS.sharedTests, null);
    sharedTests = sharedStored === null ? [] : sanitizeStoredTests(sharedStored);

    saveSavedTests();
  } catch (error) {
    console.error('Не удалось загрузить сохранённые тесты', error);
    savedTests = [];
    sharedTests = [];
    saveSavedTests();
  }
}

function saveSavedTests() {
  safeStorageSet(STORAGE_KEYS.savedTests, savedTests);
  safeStorageSet(STORAGE_KEYS.sharedTests, sharedTests);
  persistAccountData();
}

function getQuestionPreview(question) {
  if (!question || typeof question !== 'object') {
    return 'Пустой вопрос';
  }

  const text = sanitizeText(question.text || '', 80);
  const answerText = typeof question.correctAnswer === 'object'
    ? sanitizeText(question.correctAnswer?.text || '', 80)
    : sanitizeText(question.correctAnswer || '', 80);

  return text || answerText || 'Пустой вопрос';
}

function renderEditingQuestionsList() {
  const panel = document.getElementById('editing-questions-panel');
  const list = document.getElementById('editing-questions-list');
  if (!panel || !list) {
    return;
  }

  const shouldShow = Boolean(editingSavedTestId || questionsDatabase.length > 0);
  panel.style.display = shouldShow ? 'block' : 'none';

  if (!shouldShow) {
    list.innerHTML = '';
    return;
  }

  if (!questionsDatabase.length) {
    list.innerHTML = '<div class="saved-test-empty">В этом тесте пока нет вопросов.</div>';
    return;
  }

  list.innerHTML = questionsDatabase.map((question, index) => {
    const answerText = typeof question.correctAnswer === 'object'
      ? sanitizeText(question.correctAnswer?.text || '', 80)
      : sanitizeText(question.correctAnswer || '', 80);

    return `
      <div class="editing-question-item">
        <div class="editing-question-title">${index + 1}. ${escapeHtml(getQuestionPreview(question))}</div>
        <div class="editing-question-meta">Ответ: ${escapeHtml(answerText || '—')}</div>
        <div class="editing-question-actions">
          <button type="button" class="helper-btn" data-edit-question-index="${index}">Изменить</button>
        </div>
      </div>
    `;
  }).join('');
}

function syncEditingUI() {
  renderEditingQuestionsList();
  const addMorePanel = document.getElementById('add-more-questions-panel');
  if (addMorePanel && !editingSavedTestId) {
    addMorePanel.style.display = 'none';
  }
}

function focusCreatorEditorContext() {
  const creatorSection = document.getElementById('creator-section');
  const editingPanel = document.getElementById('editing-questions-panel');
  const saveBlock = document.querySelector('#creator-section .mode-block:last-of-type');

  if (!creatorSection || creatorSection.style.display === 'none') {
    return;
  }

  const target = editingSavedTestId || questionsDatabase.length > 0 ? editingPanel : saveBlock;
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function populateQuestionEditor(question, index) {
  if (!question || typeof question !== 'object') {
    return;
  }

  editingQuestionIndex = index;
  document.getElementById('q-text').value = question.text || '';
  document.getElementById('correct-ans').value = typeof question.correctAnswer === 'object'
    ? question.correctAnswer?.text || ''
    : question.correctAnswer || '';
  document.getElementById('question-type-select').value = question.type === 'matching' ? 'matching' : 'choice';

  const wrongAnswers = Array.isArray(question.wrongAnswers)
    ? question.wrongAnswers.map((item) => (typeof item === 'object' ? item?.text || '' : item || '')).filter(Boolean)
    : [];

  const wrongCount = Math.min(4, Math.max(2, wrongAnswers.length || 2));
  document.getElementById('wrong-count-select').value = String(wrongCount);
  document.getElementById('bulk-wrong-answers').value = wrongAnswers.join(', ');

  const inputs = Array.from(document.querySelectorAll('#wrong-answer-inputs .wrong-ans'));
  inputs.forEach((input, inputIndex) => {
    input.value = wrongAnswers[inputIndex] || '';
  });

  updateWrongAnswerInputs();
  updateQuestionTypeUI();
  showCreatorMode('manual');
  document.getElementById('q-text').focus();
}

function updateLibrarySaveButtonLabel() {
  const button = document.getElementById('save-library-btn');
  if (!button) {
    return;
  }

  button.textContent = editingSavedTestId ? 'Сохранить изменения' : 'Сохранить тест в библиотеку';
}

function shareTest(test) {
  if (!test) {
    return;
  }

  const text = `Тест: ${test.title || 'Без названия'}\nАвтор: ${test.author || 'Не указан'}\nВопросов: ${Array.isArray(test.questions) ? test.questions.length : 0}\n\nОткройте приложение и импортируйте этот тест из файла.`;

  const payload = {
    title: 'Поделиться тестом',
    text,
    files: []
  };

  if (navigator.share) {
    navigator.share(payload).catch(() => {});
    return;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Текст для поделиться скопирован. Теперь вставьте его в Telegram, WhatsApp или другое приложение.');
    }).catch(() => {
      alert('Не удалось скопировать текст.');
    });
  } else {
    alert('В этом браузере нет поддержки обмена.');
  }
}

function renderPracticeTests() {
  const list = document.getElementById('practice-tests-list');
  if (!list) {
    return;
  }

  const globalTests = sharedTests.filter((test) => Array.isArray(test.questions) && test.questions.length > 0);

  if (!globalTests.length) {
    list.innerHTML = '<div class="saved-test-empty">Пока нет глобальных тестов.</div>';
    return;
  }

  list.innerHTML = globalTests.map((test) => `
    <div class="saved-test-card">
      <div class="saved-test-header">
        <h4>${escapeHtml(test.title || 'Без названия')}</h4>
        <span class="saved-test-count">${test.questions?.length || 0} вопр.</span>
      </div>
      <div class="saved-test-meta">Автор: ${escapeHtml(test.author || 'Не указан')}</div>
      <div class="saved-test-meta">Сохранён: ${new Date(test.createdAt || Date.now()).toLocaleDateString('ru-RU')}</div>
      <div class="saved-test-actions">
        <button type="button" class="helper-btn" data-practice-test-id="${test.id}">Начать прохождение</button>
        <button type="button" class="helper-btn" data-share-test-id="${test.id}">Поделиться</button>
      </div>
    </div>
  `).join('');
}

function renderSavedTests() {
  const personalList = document.getElementById('saved-tests-list');
  const sharedList = document.getElementById('shared-tests-list');
  const searchValue = (document.getElementById('saved-tests-search').value || '').trim().toLowerCase();

  if (!personalList || !sharedList) {
    return;
  }

  const personalTests = savedTests.filter((test) => {
    const haystack = `${test.title} ${test.author}`.toLowerCase();
    return haystack.includes(searchValue);
  });

  const globalTests = sharedTests.filter((test) => {
    const haystack = `${test.title} ${test.author}`.toLowerCase();
    return haystack.includes(searchValue);
  });

  personalList.innerHTML = personalTests.length === 0
    ? '<div class="saved-test-empty">Пока нет ваших тестов.</div>'
    : personalTests.map((test) => renderTestCard(test, false)).join('');

  sharedList.innerHTML = globalTests.length === 0
    ? '<div class="saved-test-empty">Пока нет глобальных тестов.</div>'
    : globalTests.map((test) => renderTestCard(test, true)).join('');
}

function renderTestCard(test, canPractice = false) {
  return `
    <div class="saved-test-card">
      <div class="saved-test-header">
        <h4>${escapeHtml(test.title || 'Без названия')}</h4>
        <span class="saved-test-count">${test.questions?.length || 0} вопр.</span>
      </div>
      <div class="saved-test-meta">Автор: ${escapeHtml(test.author || 'Не указан')}</div>
      <div class="saved-test-meta">Сохранён: ${new Date(test.createdAt || Date.now()).toLocaleDateString('ru-RU')}</div>
      <div class="saved-test-actions">
        <button type="button" class="helper-btn" data-action="open" data-id="${test.id}" ${canPractice ? '' : 'disabled'}>${canPractice ? 'Пройти тест' : 'Только глобальные'}</button>
        <button type="button" class="helper-btn" data-action="edit" data-id="${test.id}">Изменить</button>
        <button type="button" class="helper-btn" data-action="share" data-id="${test.id}">Поделиться</button>
        <button type="button" class="switch-btn" data-action="delete" data-id="${test.id}">Удалить</button>
      </div>
    </div>
  `;
}

function handleEditingQuestionsListClick(event) {
  const button = event.target.closest('button[data-edit-question-index]');
  if (!button) {
    return;
  }

  const index = Number(button.getAttribute('data-edit-question-index'));
  if (Number.isInteger(index) && questionsDatabase[index]) {
    populateQuestionEditor(questionsDatabase[index], index);
  }
}

function handlePracticeTestsListClick(event) {
  const button = event.target.closest('button[data-practice-test-id], button[data-share-test-id]');
  if (!button) {
    return;
  }

  const testId = button.getAttribute('data-practice-test-id') || button.getAttribute('data-share-test-id');
  const test = sharedTests.find((item) => item.id === testId);
  if (!test) {
    return;
  }

  if (button.hasAttribute('data-share-test-id')) {
    shareTest(test);
    return;
  }

  startGame(test);
}

function handleSavedTestsListClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const testId = button.getAttribute('data-id');
  const test = savedTests.find((item) => item.id === testId) || sharedTests.find((item) => item.id === testId);

  if (!test) {
    return;
  }

  if (button.getAttribute('data-action') === 'share') {
    shareTest(test);
    return;
  }

  if (button.getAttribute('data-action') === 'delete') {
    savedTests = savedTests.filter((item) => item.id !== testId);
    sharedTests = sharedTests.filter((item) => item.id !== testId);
    if (editingSavedTestId === testId) {
      editingSavedTestId = null;
      updateLibrarySaveButtonLabel();
    }
    saveSavedTests();
    renderSavedTests();
    return;
  }

  if (button.getAttribute('data-action') === 'edit') {
    editingSavedTestId = testId;
    questionsDatabase = Array.isArray(test.questions) ? test.questions.map((item) => ({ ...item })) : [];
    activeCreatorMode = 'editor';
    document.getElementById('start-game-btn').style.display = 'block';
    document.getElementById('start-game-btn').textContent = `Запустить игру (${questionsDatabase.length} вопр.)`;
    document.getElementById('test-title-input').value = test.title || '';
    document.getElementById('test-author-input').value = test.author || '';
    updateLibrarySaveButtonLabel();
    syncEditingUI();
    showPage('creator');
    setTimeout(() => {
      renderEditingQuestionsList();
      const panel = document.getElementById('editing-questions-panel');
      if (panel) {
        panel.style.display = 'block';
      }
    }, 0);
    setTimeout(() => {
      renderEditingQuestionsList();
      const panel = document.getElementById('editing-questions-panel');
      if (panel) {
        panel.style.display = 'block';
      }
    }, 0);
    alert('Тест загружен для редактирования. Внесите изменения и сохраните их снова.');
    return;
  }

  if (!test.shared) {
    alert('Проходить можно только глобальные тесты.');
    return;
  }

  startGame(test);
}

function getSuggestedImportTitle(file) {
  const sourceName = file && typeof file.name === 'string' ? file.name : '';
  const baseName = sourceName.replace(/\.[^.]+$/, '').trim();
  return sanitizeText(baseName, 120) || 'Тест из файла';
}

function exportTestsToFile() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    savedTests,
    sharedTests
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'quiz-tests.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  alert('Тесты сохранены в файл. Откройте этот файл позже на этом или другом устройстве.');
}

function importTestsFromFile(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const importedSaved = Array.isArray(parsed.savedTests) ? parsed.savedTests : [];
      const importedShared = Array.isArray(parsed.sharedTests) ? parsed.sharedTests : [];

      savedTests = sanitizeStoredTests(importedSaved);
      sharedTests = sanitizeStoredTests(importedShared);
      saveSavedTests();
      renderSavedTests();
      renderPracticeTests();
      alert('Тесты успешно открыты из файла.');
    } catch (error) {
      console.error('Не удалось импортировать тесты', error);
      alert('Файл не подходит. Выберите JSON-файл с тестами.');
    }
  };
  reader.readAsText(file);
}

function saveCurrentTestToLibrary(options = {}) {
  if (!questionsDatabase.length) {
    alert('Сначала добавьте хотя бы один вопрос.');
    return;
  }

  const title = sanitizeText(options.title ?? document.getElementById('test-title-input').value.trim(), 120) || 'Без названия';
  const author = sanitizeText(options.author ?? document.getElementById('test-author-input').value.trim(), 120) || 'Не указан';
  const saveMode = options.saveMode ?? document.getElementById('save-mode-select')?.value ?? 'local';

  document.getElementById('test-title-input').value = title;
  document.getElementById('test-author-input').value = author;

  const updatedQuestions = questionsDatabase.map((item) => sanitizeQuestionEntry(item)).filter(Boolean);

  if (saveMode === 'shared') {
    const sharedTest = {
      id: createSafeId(),
      title,
      author,
      questions: updatedQuestions,
      createdAt: new Date().toISOString(),
      shared: true
    };
    sharedTests.unshift(sharedTest);
    localStorage.setItem('quiz-shared-tests', JSON.stringify(sharedTests));
  }

  if (editingSavedTestId) {
    const existingIndex = savedTests.findIndex((item) => item.id === editingSavedTestId);
    if (existingIndex >= 0) {
      savedTests[existingIndex] = {
        ...savedTests[existingIndex],
        title,
        author,
        questions: updatedQuestions,
        createdAt: savedTests[existingIndex].createdAt || new Date().toISOString(),
        shared: saveMode === 'shared'
      };
    }
  } else {
    const newTest = {
      id: createSafeId(),
      title,
      author,
      questions: updatedQuestions,
      createdAt: new Date().toISOString(),
      shared: saveMode === 'shared'
    };

    savedTests.unshift(newTest);
  }

  saveSavedTests();
  renderSavedTests();

  if (!options.silent) {
    showPage('library');
    alert(editingSavedTestId ? `Тест «${title}» обновлён.` : `Тест «${title}» сохранён в библиотеку.`);
  }

  editingSavedTestId = null;
  updateLibrarySaveButtonLabel();
  syncEditingUI();
}

function updatePlayModeSelectorUI() {
  document.querySelectorAll('.mode-toggle-btn').forEach((button) => {
    const modeValue = button.getAttribute('data-mode-toggle');
    const selectedMode = gameSettings.playMode === 'puzzle' ? 'puzzle' : (gameSettings.playMode === 'survey' ? 'survey' : '');
    const isActive = modeValue === selectedMode;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function updateCreatorModeChipUI() {
  document.querySelectorAll('.creator-mode-chip').forEach((button) => {
    const modeValue = button.getAttribute('data-creator-mode');
    const isActive = modeValue === (activeCreatorMode || 'manual');
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function showCreatorMode(mode) {
  const welcomeScreen = document.getElementById('welcome-screen');
  const creatorSection = document.getElementById('creator-section');
  const manualBlock = document.querySelector('[data-mode-group="manual"]');
  const fileBlock = document.querySelector('[data-mode-group="file"]');
  const pasteBlock = document.querySelector('[data-mode-group="paste"]');
  const editingPanel = document.getElementById('editing-questions-panel');
  const saveBlock = document.querySelector('#creator-section form > .mode-block:last-of-type');

  const resolvedMode = mode || activeCreatorMode || '';
  activeCreatorMode = resolvedMode;

  welcomeScreen.style.display = 'none';
  creatorSection.style.display = 'block';

  const addMorePanel = document.getElementById('add-more-questions-panel');
  if (addMorePanel) {
    addMorePanel.style.display = 'none';
  }

  const hasEditingContext = Boolean(editingSavedTestId) || questionsDatabase.length > 0;

  if (resolvedMode === 'editor') {
    if (manualBlock) manualBlock.style.display = 'none';
    if (fileBlock) fileBlock.style.display = 'none';
    if (pasteBlock) pasteBlock.style.display = 'none';
    if (editingPanel) editingPanel.style.display = 'block';
    if (saveBlock) saveBlock.style.display = 'block';
  } else if (resolvedMode) {
    if (manualBlock) manualBlock.style.display = resolvedMode === 'manual' ? 'block' : 'none';
    if (fileBlock) fileBlock.style.display = resolvedMode === 'file' ? 'block' : 'none';
    if (pasteBlock) pasteBlock.style.display = resolvedMode === 'paste' ? 'block' : 'none';
    if (editingPanel) editingPanel.style.display = 'none';
    if (saveBlock) saveBlock.style.display = 'block';
  } else if (hasEditingContext) {
    if (manualBlock) manualBlock.style.display = 'none';
    if (fileBlock) fileBlock.style.display = 'none';
    if (pasteBlock) pasteBlock.style.display = 'none';
    if (editingPanel) editingPanel.style.display = 'block';
    if (saveBlock) saveBlock.style.display = 'block';
  } else {
    if (manualBlock) manualBlock.style.display = 'none';
    if (fileBlock) fileBlock.style.display = 'none';
    if (pasteBlock) pasteBlock.style.display = 'none';
    if (editingPanel) editingPanel.style.display = 'none';
    if (saveBlock) saveBlock.style.display = 'none';
  }

  updatePlayModeSelectorUI();
  updateCreatorModeChipUI();
  updatePageNavigation();
}

function returnToEditor() {
  editingQuestionIndex = null;

  if (getCurrentPage() === 'game') {
    stopGame();
    return;
  }

  showPage('welcome', true);
}

function returnToFlow() {
  showPage('welcome', true);
}

function init() {
  const savedTheme = safeStorageGet(STORAGE_KEYS.theme, 'dark');
  const themeSelect = getElement('theme-select');
  if (themeSelect) {
    themeSelect.value = 'dark';
  }
  applyTheme();
  updateQuestionTypeUI();
  updateLibrarySaveButtonLabel();

  const settingsPanel = getElement('settings-panel');
  const settingsToggle = getElement('settings-toggle');
  if (settingsPanel && settingsToggle) {
    settingsPanel.classList.add('hidden');
    settingsToggle.addEventListener('click', () => {
      settingsPanel.classList.toggle('hidden');
    });
  }

  ['toggle-themes','toggle-stats'].forEach((id) => {
    bindIfExists(id, 'change', applySettingsUI);
  });

  bindIfExists('save-btn', 'click', saveQuestion);
  bindIfExists('open-practice-btn', 'click', () => {
    activeFlow = 'practice';
    showPage('practice');
  });
  bindIfExists('open-history-btn', 'click', () => showPage('history'));
  bindIfExists('open-creator-btn', 'click', () => {
    activeFlow = 'creator';
    showPage('creator');
  });
  bindIfExists('back-to-home-btn', 'click', () => {
    activeFlow = 'welcome';
    showPage('welcome');
  });
  bindIfExists('back-to-home-from-history-btn', 'click', () => {
    showPage('welcome');
  });
  bindIfExists('add-more-questions-btn', 'click', () => {
    const panel = getElement('add-more-questions-panel');
    if (panel) {
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
  });
  document.querySelectorAll('[data-add-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-add-mode');
      if (mode) {
        showCreatorMode(mode);
      }
    });
  });
  bindIfExists('save-library-btn', 'click', saveCurrentTestToLibrary);
  bindIfExists('export-tests-btn', 'click', exportTestsToFile);
  bindIfExists('import-tests-btn', 'click', () => {
    const input = document.getElementById('import-tests-file');
    if (input) {
      input.click();
    }
  });
  bindIfExists('import-tests-file', 'change', (event) => {
    const file = event.target.files?.[0];
    if (file) {
      importTestsFromFile(file);
      event.target.value = '';
    }
  });
  bindIfExists('clear-all-btn', 'click', clearAllQuestions);
  bindIfExists('start-game-btn', 'click', startGame);
  bindIfExists('start-reverse-survey-btn', 'click', () => startReverseSurvey());
  bindIfExists('finish-learning-btn', 'click', finishLearning);
  bindIfExists('back-to-editor-btn', 'click', returnToFlow);
  bindIfExists('view-library-btn', 'click', () => showPage('library'));
  bindIfExists('back-to-editor-from-library-btn', 'click', returnToFlow);
  bindIfExists('saved-tests-search', 'input', renderSavedTests);
  bindIfExists('practice-tests-list', 'click', handlePracticeTestsListClick);
  bindIfExists('saved-tests-list', 'click', handleSavedTestsListClick);
  bindIfExists('editing-questions-list', 'click', handleEditingQuestionsListClick);
  bindIfExists('prev-page-btn', 'click', goToPreviousPage);
  bindIfExists('next-page-btn', 'click', goToNextPage);
  document.querySelectorAll('#theme-select, #theme-select-top').forEach((select) => {
    select.addEventListener('change', handleThemeChange);
  });
  bindIfExists('practice-font-size-select', 'change', applyPracticeAppearanceSettings);
  bindIfExists('practice-font-size-select', 'input', applyPracticeAppearanceSettings);
  bindIfExists('practice-button-color-picker', 'input', applyPracticeAppearanceSettings);
  bindIfExists('practice-button-color-picker', 'change', applyPracticeAppearanceSettings);
  bindIfExists('practice-correct-button-color-picker', 'input', applyPracticeAppearanceSettings);
  bindIfExists('practice-correct-button-color-picker', 'change', applyPracticeAppearanceSettings);
  bindIfExists('practice-wrong-button-color-picker', 'input', applyPracticeAppearanceSettings);
  bindIfExists('practice-wrong-button-color-picker', 'change', applyPracticeAppearanceSettings);
  bindIfExists('practice-button-text-color-picker', 'input', applyPracticeAppearanceSettings);
  bindIfExists('practice-button-text-color-picker', 'change', applyPracticeAppearanceSettings);
  bindIfExists('practice-accent-color-picker', 'input', applyPracticeAppearanceSettings);
  bindIfExists('practice-accent-color-picker', 'change', applyPracticeAppearanceSettings);
  bindIfExists('scroll-to-top-btn', 'click', scrollToTop);
  bindIfExists('question-type-select', 'change', updateQuestionTypeUI);
  bindIfExists('wrong-count-select', 'change', updateWrongAnswerInputs);
  bindIfExists('question-time-select', 'change', updateGameModeUI);
  bindIfExists('game-mode-select', 'change', updateGameModeUI);
  bindIfExists('question-count-select', 'change', updateGameModeUI);
  bindIfExists('repeat-count-select', 'change', updateGameModeUI);
  bindIfExists('bulk-wrong-answers', 'input', syncBulkWrongAnswersToInputs);
  bindIfExists('font-size-select', 'change', applySettingsUI);
  ['button-color-picker','correct-button-color-picker','wrong-button-color-picker','button-text-color-picker','accent-orange-color-picker'].forEach((id) => {
    const element = getElement(id);
    if (element) {
      element.addEventListener('input', applySettingsUI);
      element.addEventListener('change', applySettingsUI);
    }
  });
  bindIfExists('open-manual-btn', 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showCreatorMode('manual');
  });
  bindIfExists('open-file-btn', 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showCreatorMode('file');
  });
  bindIfExists('open-paste-btn', 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showCreatorMode('paste');
  });
  bindIfExists('open-puzzle-btn', 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    gameSettings.playMode = 'puzzle';
    activeFlow = 'creator';
    showPage('creator');
    updatePlayModeSelectorUI();
  });
  bindIfExists('switch-to-survey-practice-btn', 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    gameSettings.playMode = 'survey';
    updatePlayModeSelectorUI();
  });
  bindIfExists('switch-to-puzzle-practice-btn', 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    gameSettings.playMode = 'puzzle';
    updatePlayModeSelectorUI();
  });
  bindIfExists('switch-to-survey-btn', 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    gameSettings.playMode = 'survey';
    updatePlayModeSelectorUI();
    showCreatorMode(activeCreatorMode || 'manual');
  });
  bindIfExists('switch-to-puzzle-btn', 'click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    gameSettings.playMode = 'puzzle';
    updatePlayModeSelectorUI();
    showCreatorMode(activeCreatorMode || 'manual');
  });
  bindIfExists('open-library-btn', 'click', () => showPage('library'));
  bindIfExists('generate-random-btn', 'click', generateRandomWrongAnswers);
  bindIfExists('generate-auto-test-btn', 'click', () => generateAutoTestFromPdf());
  bindIfExists('generate-paste-btn', 'click', () => generateFromPastedText());
  bindIfExists('download-paste-test-btn', 'click', () => downloadGeneratedTestFile());
  bindIfExists('answer-count-btn', 'click', () => {
    const statusEl = getElement('paste-status');
    const countEl = getElement('answer-count-select');
    if (statusEl && countEl) {
      statusEl.textContent = `Текущее количество неправильных вариантов: ${countEl.value}`;
    }
  });
  bindIfExists('auto-pdf-upload', 'change', (event) => {
    generateAutoTestFromPdf(event.target.files[0]);
  });
  document.querySelectorAll('.answer-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.getAttribute('data-answer-index'));
      if (!Number.isNaN(index)) {
        if (gameSettings.playMode === 'puzzle') {
          handlePuzzleSelection(index);
        } else {
          checkAnswer(index);
        }
      }
    });
  });

  loadSavedTests();
  renderSavedTests();
  renderPracticeTests();
  updateGameModeUI();
  updatePlayModeSelectorUI();
  applySettingsUI();
  applyPracticeAppearanceSettings();
  showPage('welcome');
  updatePageNavigation();
  updateGameHeader();
}

document.addEventListener('DOMContentLoaded', init);
