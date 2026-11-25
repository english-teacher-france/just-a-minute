(() => {
  'use strict';

  const DECISION_SECONDS = 5;

  // --- État ---
  const state = {
    topics: [],
    index: 0,            // position dans la liste mélangée
    duration: 60,
    mode: 'mobile',
    skipUsed: false,
    phase: 'ready',      // ready | decision | running | paused | ended
    decisionLeft: DECISION_SECONDS,
    timeLeft: 60,
    interval: null,
    presIndex: -1        // -1 = "Are you ready?"
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
    timer: $('timer-display'),
    decision: $('decision-display'),
    decisionCount: $('decision-count'),
    btnSkip: $('btn-skip'),
    btnStartNow: $('btn-start-now'),
    btnPause: $('btn-pause'),
    presTopic: $('pres-topic'),
    overlay: $('settings-overlay'),
    selDuration: $('select-duration'),
    selMode: $('select-mode')
  };

  // --- Utilitaires ---
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function showScreen(name) {
    Object.values(el.screens).forEach(s => s.classList.remove('active'));
    el.screens[name].classList.add('active');
  }

  function stopTimer() {
    clearInterval(state.interval);
    state.interval = null;
  }

  function currentTopic() {
    return state.topics[state.index % state.topics.length];
  }

  function nextTopic() {
    state.index = (state.index + 1) % state.topics.length;
    // Remélange quand on a fait le tour complet
    if (state.index === 0) state.topics = shuffle(state.topics);
  }

  // --- Chargement des sujets ---
  async function loadTopics() {
    try {
      const res = await fetch('topics.txt', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const text = await res.text();
      const list = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (!list.length) throw new Error('vide');
      state.topics = shuffle(list);
    } catch (e) {
      state.topics = ['Erreur : topics.txt introuvable'];
      console.error('Chargement topics.txt impossible', e);
    }
  }

  // --- Mode mobile : déroulement d'une manche ---
  function resetRound() {
    stopTimer();
    state.skipUsed = false;
    state.phase = 'ready';
    el.readyText.textContent = 'Es-tu prêt ?';
    showScreen('ready');
  }

  function startRound() {
    state.skipUsed = false;
    showScreen('game');
    showTopicAndDecision();
  }

  function showTopicAndDecision() {
    stopTimer();
    state.phase = 'decision';
    state.decisionLeft = DECISION_SECONDS;
    state.timeLeft = state.duration;

    el.topic.textContent = currentTopic();
    el.timer.classList.add('hidden');
    el.timer.classList.remove('warning');
    el.decision.classList.remove('hidden');
    el.decisionCount.textContent = state.decisionLeft;

    el.btnSkip.classList.remove('hidden');
    el.btnSkip.disabled = state.skipUsed;
    el.btnSkip.textContent = state.skipUsed
      ? 'Sujet déjà passé'
      : 'Passer le sujet (1 fois)';
    el.btnStartNow.classList.remove('hidden');
    el.btnPause.classList.add('hidden');

    state.interval = setInterval(() => {
      state.decisionLeft--;
      el.decisionCount.textContent = state.decisionLeft;
      if (state.decisionLeft <= 0) startTimer();
    }, 1000);
  }

  function skipTopic() {
    if (state.phase !== 'decision' || state.skipUsed) return;
    state.skipUsed = true;
    nextTopic();
    showTopicAndDecision();
  }

  function startTimer() {
    stopTimer();
    state.phase = 'running';
    state.timeLeft = state.duration;

    el.decision.classList.add('hidden');
    el.btnSkip.classList.add('hidden');
    el.btnStartNow.classList.add('hidden');
    el.btnPause.classList.remove('hidden');
    el.btnPause.textContent = '⏸ Pause';
    el.timer.classList.remove('hidden');
    renderTimer();

    state.interval = setInterval(tick, 1000);
  }

  function tick() {
    state.timeLeft--;
    renderTimer();
    if (state.timeLeft <= 0) endRound();
  }

  function renderTimer() {
    el.timer.textContent = state.timeLeft;
    el.timer.classList.toggle('warning', state.timeLeft <= 10);
  }

  function togglePause() {
    if (state.phase === 'running') {
      stopTimer();
      state.phase = 'paused';
      el.btnPause.textContent = '▶ Reprendre';
    } else if (state.phase === 'paused') {
      state.phase = 'running';
      el.btnPause.textContent = '⏸ Pause';
      state.interval = setInterval(tick, 1000);
    }
  }

  function endRound() {
    stopTimer();
    state.phase = 'ended';
    if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
    showScreen('end');
  }

  function nextPlayer() {
    nextTopic();
    resetRound();
  }

  // --- Mode présentation ---
  function enterPresentation() {
    stopTimer();
    state.presIndex = -1;
    renderPresentation();
    showScreen('presentation');
  }

  function renderPresentation() {
    el.presTopic.textContent = state.presIndex < 0
      ? 'Are you ready?'
      : state.topics[state.presIndex];
  }

  function presNext() {
    state.presIndex++;
    if (state.presIndex >= state.topics.length) {
      state.topics = shuffle(state.topics);
      state.presIndex = 0;
    }
    renderPresentation();
  }

  function presPrev() {
    if (state.presIndex > -1) state.presIndex--;
    renderPresentation();
  }

  // --- Changement de mode ---
  function applyMode(mode) {
    state.mode = mode;
    el.app.classList.toggle('mode-presentation', mode === 'presentation');
    el.app.classList.toggle('mode-mobile', mode === 'mobile');
    if (mode === 'presentation') enterPresentation();
    else resetRound();
  }

  // --- Événements ---
  $('btn-ready').addEventListener('click', startRound);
  el.btnSkip.addEventListener('click', skipTopic);
  el.btnStartNow.addEventListener('click', startTimer);
  el.btnPause.addEventListener('click', togglePause);
  $('btn-next-player').addEventListener('click', nextPlayer);
  $('btn-next').addEventListener('click', presNext);
  $('btn-prev').addEventListener('click', presPrev);

  $('btn-settings').addEventListener('click', () => {
    // Met la manche en pause à l'ouverture des paramètres
    if (state.phase === 'running') togglePause();
    el.overlay.classList.remove('hidden');
  });
  $('btn-close-settings').addEventListener('click', () => {
    el.overlay.classList.add('hidden');
  });

  el.selDuration.addEventListener('change', e => {
    state.duration = parseInt(e.target.value, 10);
    localStorage.setItem('jam-duration', state.duration);
  });
  el.selMode.addEventListener('change', e => {
    applyMode(e.target.value);
    localStorage.setItem('jam-mode', e.target.value);
  });

  // Flèches du clavier en mode présentation
  document.addEventListener('keydown', e => {
    if (state.mode !== 'presentation') return;
    if (e.key === 'ArrowRight' || e.key === ' ') presNext();
    if (e.key === 'ArrowLeft') presPrev();
  });

  // --- Démarrage ---
  async function init() {
    await loadTopics();

    const savedDuration = parseInt(localStorage.getItem('jam-duration'), 10);
    if ([30, 40, 50, 60].includes(savedDuration)) {
      state.duration = savedDuration;
      el.selDuration.value = savedDuration;
    }
    const savedMode = localStorage.getItem('jam-mode');
    if (savedMode === 'presentation') el.selMode.value = savedMode;

    applyMode(el.selMode.value);
  }

  init();
})();
