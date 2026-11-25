(() => {
  'use strict';

  const HIDDEN_SECONDS = 3;    // lecture du sujet, sans indication à l'écran
  const DECISION_SECONDS = 5;  // compte à rebours animé
  const DEFAULT_DURATION = 30;

  // --- État de l'application ---
  const state = {
    topics: [],
    index: 0,          // position du sujet courant dans la liste mélangée
    duration: DEFAULT_DURATION,
    mode: 'mobile',
    skipUsed: false,
    presIndex: -1,     // -1 = affichage "Are you ready?"
    timerId: null,
    hiddenTimeoutId: null,
    remaining: 0,
    paused: false,
    phase: 'ready'     // ready | reading | decision | running | end
  };

  // --- Raccourcis DOM ---
  const $ = id => document.getElementById(id);
  const el = {
    app: $('app'),
    screens: {
      ready: $('screen-ready'),
      game: $('screen-game'),
      end: $('screen-end'),
      presentation: $('screen-presentation')
    },
    readyText: $('ready-text'),
    topic: $('topic'),
    presTopic: $('pres-topic'),
    timer: $('timer-display'),
    decision: $('decision-display'),
    decisionBar: $('decision-bar'),
    btnReady: $('btn-ready'),
    btnSkip: $('btn-skip'),
    btnStartNow: $('btn-start-now'),
    btnPause: $('btn-pause'),
    btnNextPlayer: $('btn-next-player'),
    btnPrev: $('btn-prev'),
    btnNext: $('btn-next'),
    btnSettings: $('btn-settings'),
    btnCloseSettings: $('btn-close-settings'),
    overlay: $('settings-overlay'),
    selDuration: $('select-duration'),
    selMode: $('select-mode')
  };

  // --- Utilitaires ---
  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  async function loadTopics() {
    try {
      const res = await fetch('topics.txt', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const list = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (list.length === 0) throw new Error('Fichier vide');
      state.topics = shuffle(list);
    } catch (err) {
      console.error('Impossible de charger topics.txt :', err);
      state.topics = shuffle(['My family', 'Football', 'Pizza', 'Summer holidays']);
    }
  }

  function currentTopic() {
    return state.topics[state.index % state.topics.length];
  }

  function nextTopic() {
    state.index = (state.index + 1) % state.topics.length;
  }

  // --- Ajustement automatique de la taille du texte ---
  // Le texte revient à la ligne UNIQUEMENT entre les mots (jamais au milieu
  // d'un mot). On cherche la plus grande police pour laquelle :
  //   1. le mot le plus long tient sur une ligne (largeur utile),
  //   2. le bloc complet tient dans la hauteur disponible.
  const FIT_SAFETY_X = 4;    // px de sécurité horizontale (arrondis de rendu)
  const FIT_SCALE = 0.95;    // légère réduction finale
  const FIT_MAX_PX = 280;    // taille maximale
  const FIT_MIN_PX = 12;     // taille minimale

  function fitText(container) {
    const span = container.firstElementChild;
    if (!span) return;

    // Largeur utile = largeur du conteneur moins son padding réel
    const cs = getComputedStyle(container);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const maxW = container.clientWidth - padX - FIT_SAFETY_X;
    const maxH = container.clientHeight;
    if (maxW <= 0 || maxH <= 0) return; // conteneur masqué

    // Contraint le bloc à la largeur utile pour que le retour à la ligne
    // se fasse entre les mots à chaque taille testée.
    span.style.width = maxW + 'px';

    const fits = size => {
      container.style.fontSize = size + 'px';
      // scrollWidth > clientWidth => un mot dépasse (trop long pour la ligne)
      return span.scrollWidth <= span.clientWidth + 1 && span.offsetHeight <= maxH;
    };

    let min = FIT_MIN_PX;
    let max = Math.min(maxH, FIT_MAX_PX);
    while (min < max) {
      const mid = Math.ceil((min + max) / 2);
      if (fits(mid)) {
        min = mid;
      } else {
        max = mid - 1;
      }
    }

    let finalSize = Math.max(FIT_MIN_PX, Math.floor(min * FIT_SCALE));
    // Ne pas appliquer la réduction si la taille de base ne tient déjà pas
    container.style.fontSize = finalSize + 'px';
  }

  function setTopicText(container, text) {
    container.firstElementChild.textContent = text;
    requestAnimationFrame(() => fitText(container));
  }

  function refit() {
    if (el.screens.game.classList.contains('active')) fitText(el.topic);
    if (el.screens.presentation.classList.contains('active')) fitText(el.presTopic);
  }

  function showScreen(name) {
    Object.values(el.screens).forEach(s => s.classList.remove('active'));
    el.screens[name].classList.add('active');
    requestAnimationFrame(refit);
  }

  function stopTimer() {
    clearInterval(state.timerId);
    clearTimeout(state.hiddenTimeoutId);
    state.timerId = null;
    state.hiddenTimeoutId = null;
  }

  // --- Mode mobile : déroulement d'une manche ---
  function resetToReady() {
    stopTimer();
    state.phase = 'ready';
    state.skipUsed = false;
    state.paused = false;
    el.readyText.textContent = 'Es-tu prêt ?';
    showScreen('ready');
  }

  function startRound() {
    state.skipUsed = false;
    showTopicAndDecision();
  }

  // Phase 1 : 3 s cachées (sujet seul), phase 2 : 5 s avec animation.
  function showTopicAndDecision() {
    stopTimer();
    state.phase = 'reading';

    el.timer.classList.add('hidden');
    el.decision.classList.add('hidden');
    el.decisionBar.classList.remove('running');

    el.btnSkip.classList.remove('hidden');
    el.btnSkip.disabled = state.skipUsed;
    el.btnSkip.textContent = state.skipUsed
      ? 'Sujet déjà passé'
      : 'Passer le sujet (1 fois)';
    el.btnStartNow.classList.remove('hidden');
    el.btnPause.classList.add('hidden');

    showScreen('game');
    setTopicText(el.topic, currentTopic());

    state.hiddenTimeoutId = setTimeout(startDecisionCountdown, HIDDEN_SECONDS * 1000);
  }

  function startDecisionCountdown() {
    state.phase = 'decision';
    el.decision.classList.remove('hidden');
    el.decisionBar.style.animationDuration = DECISION_SECONDS + 's';
    // Relance l'animation CSS depuis le début
    el.decisionBar.classList.remove('running');
    void el.decisionBar.offsetWidth;
    el.decisionBar.classList.add('running');

    // La barre de décision modifie la hauteur disponible : on réajuste
    requestAnimationFrame(refit);

    state.hiddenTimeoutId = setTimeout(startTimer, DECISION_SECONDS * 1000);
  }

  function skipTopic() {
    if ((state.phase !== 'reading' && state.phase !== 'decision') || state.skipUsed) return;
    state.skipUsed = true;
    nextTopic();
    showTopicAndDecision();
  }

  function startTimer() {
    stopTimer();
    state.phase = 'running';
    state.paused = false;
    state.remaining = state.duration;

    el.decision.classList.add('hidden');
    el.decisionBar.classList.remove('running');
    el.btnSkip.classList.add('hidden');
    el.btnStartNow.classList.add('hidden');
    el.btnPause.classList.remove('hidden');
    el.btnPause.textContent = '⏸ Pause';
    el.timer.classList.remove('hidden');
    renderTimer();
    requestAnimationFrame(refit);

    state.timerId = setInterval(() => {
      if (state.paused) return;
      state.remaining--;
      renderTimer();
      if (state.remaining <= 0) endRound();
    }, 1000);
  }

  function renderTimer() {
    el.timer.textContent = Math.max(state.remaining, 0);
    el.timer.classList.toggle('danger', state.remaining <= 10);
  }

  function togglePause() {
    if (state.phase !== 'running') return;
    state.paused = !state.paused;
    el.btnPause.textContent = state.paused ? '▶ Reprendre' : '⏸ Pause';
  }

  function endRound() {
    stopTimer();
    state.phase = 'end';
    nextTopic(); // le prochain joueur aura un nouveau sujet
    showScreen('end');
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  // --- Mode présentation ---
  function renderPresentation() {
    setTopicText(
      el.presTopic,
      state.presIndex < 0 ? 'Are you ready?' : state.topics[state.presIndex]
    );
  }

  function presNext() {
    state.presIndex = (state.presIndex + 1) % state.topics.length;
    renderPresentation();
  }

  function presPrev() {
    if (state.presIndex <= 0) {
      state.presIndex = -1;
    } else {
      state.presIndex--;
    }
    renderPresentation();
  }

  // --- Changement de mode ---
  function applyMode(mode) {
    state.mode = mode;
    stopTimer();
    el.app.classList.toggle('mode-presentation', mode === 'presentation');
    el.app.classList.toggle('mode-mobile', mode === 'mobile');

    if (mode === 'presentation') {
      state.presIndex = -1;
      showScreen('presentation');
      renderPresentation();
    } else {
      resetToReady();
    }
  }

  // --- Événements ---
  el.btnReady.addEventListener('click', startRound);
  el.btnSkip.addEventListener('click', skipTopic);
  el.btnStartNow.addEventListener('click', startTimer);
  el.btnPause.addEventListener('click', togglePause);
  el.btnNextPlayer.addEventListener('click', resetToReady);
  el.btnNext.addEventListener('click', presNext);
  el.btnPrev.addEventListener('click', presPrev);

  el.btnSettings.addEventListener('click', () => el.overlay.classList.remove('hidden'));
  el.btnCloseSettings.addEventListener('click', () => el.overlay.classList.add('hidden'));
  el.overlay.addEventListener('click', e => {
    if (e.target === el.overlay) el.overlay.classList.add('hidden');
  });

  el.selDuration.addEventListener('change', () => {
    state.duration = parseInt(el.selDuration.value, 10);
    localStorage.setItem('jam-duration', state.duration);
  });

  el.selMode.addEventListener('change', () => {
    localStorage.setItem('jam-mode', el.selMode.value);
    applyMode(el.selMode.value);
  });

  // Raccourcis clavier en mode présentation
  document.addEventListener('keydown', e => {
    if (state.mode !== 'presentation') return;
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      presNext();
    }
    if (e.key === 'ArrowLeft') presPrev();
  });

  // Réajuster le texte si la fenêtre change de taille / d'orientation
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);

  // --- Démarrage ---
  async function init() {
    await loadTopics();

    const savedDuration = parseInt(localStorage.getItem('jam-duration'), 10);
    state.duration = [30, 40, 50, 60].includes(savedDuration)
      ? savedDuration
      : DEFAULT_DURATION;
    el.selDuration.value = state.duration;

    const savedMode = localStorage.getItem('jam-mode');
    if (savedMode === 'presentation') el.selMode.value = savedMode;

    applyMode(el.selMode.value);
  }

  init();
})();
