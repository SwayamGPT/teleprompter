// Renderer: editor, smooth auto-scroll, settings and hotkeys.
(() => {
  const $ = (id) => document.getElementById(id);
  const api = window.prompter;

  const els = {
    script: $('script'), content: $('content'), prompter: $('prompter'),
    play: $('btn-play'), mode: $('btn-mode'), speedVal: $('speed-val'),
    countdown: $('countdown'), progress: $('progress-bar'), pill: $('capture-pill'),
    opacity: $('opacity'), mirror: $('opt-mirror'), guide: $('opt-guide'),
    countdownOpt: $('opt-countdown'), clickThrough: $('opt-click-through'),
    protect: $('opt-protect'), words: $('word-count'),
    ctBanner: $('click-through-banner'), osWarning: $('os-warning'),
  };

  // ---------- Persisted settings ----------
  const DEFAULTS = {
    text: '', speed: 8, fontSize: 40, opacity: 100,
    mirror: false, guide: true, countdown: true,
  };
  const STORE_KEY = 'stealth-teleprompter';
  let s = { ...DEFAULTS };
  try { s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; } catch {}
  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {}
    }, 250);
  };

  // ---------- State ----------
  const GUIDE_RATIO = 0.30;      // reading line sits 30% down the window
  const PX_PER_SPEED = 9;        // speed 1 = 9 px/s
  let mode = 'edit';
  let playing = false;
  let offset = 0;
  let maxOffset = 0;
  let lastTs = 0;
  let countdownTimer = null;

  // ---------- Script rendering ----------
  function escapeHtml(t) {
    return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function cleanMarkdown(line) {
    return line
      .replace(/^\s{0,3}#{1,6}\s+/, '')     // headings
      .replace(/^\s*[-*+]\s+/, '• ')         // bullets
      .replace(/(\*\*|__)(.+?)\1/g, '$2')    // bold
      .replace(/(\*|_)(\S.*?\S|\S)\1/g, '$2'); // italics
  }

  function renderScript() {
    const paras = s.text
      .replace(/\r\n?/g, '\n')
      .split(/\n\s*\n/)
      .map((p) => p.split('\n').map(cleanMarkdown).join(' ').trim())
      .filter(Boolean);

    const body = paras.length
      ? paras.map((p) => `<p>${escapeHtml(p).replace(/\[([^\]]+)\]/g, '<span class="cue">[$1]</span>')}</p>`).join('')
      : '<p class="cue">[No script yet — press Esc and paste one in]</p>';

    els.content.innerHTML =
      `<div class="spacer-top"></div>${body}<p class="end" id="end-marker">— end —</p><div class="spacer-bottom"></div>`;
    layout();
  }

  function layout() {
    document.documentElement.style.setProperty('--font-size', `${s.fontSize}px`);
    const h = els.prompter.clientHeight || window.innerHeight - 36;
    const guideY = h * GUIDE_RATIO;
    const spacer = els.content.querySelector('.spacer-top');
    // Put the first line's middle on the reading line.
    if (spacer) spacer.style.height = `${Math.max(0, guideY - s.fontSize * 0.75)}px`;
    const end = $('end-marker');
    maxOffset = end ? Math.max(0, end.offsetTop - guideY + s.fontSize * 0.5) : 0;
    offset = Math.min(offset, maxOffset);
    paint();
  }

  function paint() {
    els.content.style.transform = `translateY(${-offset}px)`;
    els.progress.style.width = maxOffset ? `${(offset / maxOffset) * 100}%` : '0';
  }

  // ---------- Playback ----------
  function tick(ts) {
    if (!playing) return;
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    offset += s.speed * PX_PER_SPEED * dt;
    if (offset >= maxOffset) { offset = maxOffset; paint(); setPlaying(false); return; }
    paint();
    requestAnimationFrame(tick);
  }

  function setPlaying(on) {
    if (on && mode !== 'prompt') return;
    if (on && offset >= maxOffset) offset = 0;
    cancelCountdown();
    if (on && s.countdown && offset === 0) return runCountdown();
    playing = on;
    els.play.textContent = on ? '❚❚' : '▶';
    lastTs = 0;
    if (on) requestAnimationFrame(tick);
  }

  function runCountdown() {
    let n = 3;
    els.countdown.hidden = false;
    els.countdown.textContent = n;
    els.play.textContent = '❚❚';
    countdownTimer = setInterval(() => {
      n -= 1;
      if (n > 0) { els.countdown.textContent = n; return; }
      cancelCountdown();
      playing = true;
      lastTs = 0;
      requestAnimationFrame(tick);
    }, 800);
  }

  function cancelCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    els.countdown.hidden = true;
  }

  const togglePlay = () => setPlaying(!(playing || countdownTimer));

  function nudge(lines) {
    offset = Math.min(maxOffset, Math.max(0, offset + lines * s.fontSize * 1.45));
    paint();
  }

  function restart() {
    setPlaying(false);
    offset = 0;
    paint();
  }

  function changeSpeed(d) {
    s.speed = Math.min(40, Math.max(1, s.speed + d));
    els.speedVal.textContent = s.speed;
    save();
  }

  function changeFont(d) {
    // keep the same relative position in the script when resizing
    const ratio = maxOffset ? offset / maxOffset : 0;
    s.fontSize = Math.min(120, Math.max(16, s.fontSize + d));
    layout();
    offset = ratio * maxOffset;
    paint();
    save();
  }

  // ---------- Modes ----------
  function setMode(m) {
    mode = m;
    document.body.classList.toggle('mode-edit', m === 'edit');
    document.body.classList.toggle('mode-prompt', m === 'prompt');
    els.mode.textContent = m === 'edit' ? 'Start prompting' : 'Edit script';
    if (m === 'prompt') {
      s.text = els.script.value;
      save();
      renderScript();
      els.prompter.focus();
    } else {
      setPlaying(false);
      els.script.focus();
    }
  }

  // ---------- UI wiring ----------
  function updateWordCount() {
    const words = (els.script.value.match(/\S+/g) || []).length;
    // ~140 spoken words per minute is a comfortable presenting pace
    const mins = words / 140;
    els.words.textContent = words
      ? `${words} words · ${mins < 1 ? '<1' : '~' + Math.round(mins)} min`
      : '';
  }

  function applyToggles() {
    document.body.classList.toggle('mirror', s.mirror);
    document.body.classList.toggle('no-guide', !s.guide);
    els.mirror.checked = s.mirror;
    els.guide.checked = s.guide;
    els.countdownOpt.checked = s.countdown;
    els.opacity.value = s.opacity;
    els.speedVal.textContent = s.speed;
    api.setOpacity(s.opacity / 100);
  }

  els.script.value = s.text;
  updateWordCount();
  applyToggles();

  els.script.addEventListener('input', () => { s.text = els.script.value; updateWordCount(); save(); });
  els.mode.onclick = () => setMode(mode === 'edit' ? 'prompt' : 'edit');
  els.play.onclick = togglePlay;
  $('btn-restart').onclick = restart;
  $('btn-slower').onclick = () => changeSpeed(-1);
  $('btn-faster').onclick = () => changeSpeed(1);
  $('btn-font-down').onclick = () => changeFont(-4);
  $('btn-font-up').onclick = () => changeFont(4);
  $('btn-min').onclick = () => api.minimize();
  $('btn-close').onclick = () => api.close();
  $('btn-open').onclick = async () => {
    const text = await api.openScript();
    if (text == null) return;
    els.script.value = s.text = text;
    updateWordCount();
    save();
  };

  els.opacity.oninput = () => { s.opacity = Number(els.opacity.value); api.setOpacity(s.opacity / 100); save(); };
  els.mirror.onchange = () => { s.mirror = els.mirror.checked; applyToggles(); save(); };
  els.guide.onchange = () => { s.guide = els.guide.checked; applyToggles(); save(); };
  els.countdownOpt.onchange = () => { s.countdown = els.countdownOpt.checked; save(); };
  els.protect.onchange = () => api.setProtection(els.protect.checked);
  els.clickThrough.onchange = () => api.setClickThrough(els.clickThrough.checked);

  // Click the text to pause/resume; wheel to scroll manually.
  els.prompter.addEventListener('click', togglePlay);
  els.prompter.addEventListener('wheel', (e) => {
    e.preventDefault();
    offset = Math.min(maxOffset, Math.max(0, offset + e.deltaY * 0.6));
    paint();
  }, { passive: false });

  window.addEventListener('resize', layout);

  // Local keyboard shortcuts.
  window.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); return changeFont(4); }
    if (ctrl && e.key === '-') { e.preventDefault(); return changeFont(-4); }
    if (ctrl && e.key === 'Enter') { e.preventDefault(); return setMode(mode === 'edit' ? 'prompt' : 'edit'); }
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); return $('btn-open').click(); }
    if (mode !== 'prompt') return;
    switch (e.key) {
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'ArrowUp': e.preventDefault(); changeSpeed(1); break;
      case 'ArrowDown': e.preventDefault(); changeSpeed(-1); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); nudge(-3); break;
      case 'ArrowRight': case 'PageDown': e.preventDefault(); nudge(3); break;
      case 'Home': e.preventDefault(); restart(); break;
      case 'm': case 'M': s.mirror = !s.mirror; applyToggles(); save(); break;
      case 'Escape': setMode('edit'); break;
    }
  });

  // Global hotkeys (forwarded from the main process).
  api.onShortcut((action) => {
    if (action === 'toggle-play') {
      if (mode !== 'prompt') setMode('prompt');
      togglePlay();
    } else if (action === 'speed-up') changeSpeed(1);
    else if (action === 'speed-down') changeSpeed(-1);
    else if (action === 'rewind') nudge(-3);
    else if (action === 'forward') nudge(3);
    else if (action === 'restart') restart();
  });

  // Capture-protection / click-through state from the main process.
  api.onState((st) => {
    els.protect.checked = st.protectedFromCapture;
    els.clickThrough.checked = st.clickThrough;
    els.ctBanner.hidden = !st.clickThrough;

    // Badge reflects what Windows actually reports, not what we asked for.
    const a = st.actualAffinity;
    let label, ok, warn = '';
    if (!st.protectedFromCapture) {
      label = 'VISIBLE in capture'; ok = false;
    } else if (st.platform !== 'win32' && st.platform !== 'darwin') {
      label = 'Not hidden on this OS'; ok = false;
      warn = 'This OS does not support hiding windows from capture — the script WILL be visible in recordings.';
    } else if (st.platform === 'darwin' || !st.verifiable) {
      label = 'Hidden (unverified)'; ok = true;
    } else if (a === 0x11) {
      label = 'Hidden from capture ✓'; ok = true;
    } else if (a === 0x01) {
      label = 'Shows as black box'; ok = false;
      warn = 'Windows only allowed "black box" mode (Windows 10 older than version 2004). Update Windows for full invisibility.';
    } else {
      label = 'NOT hidden'; ok = false;
      warn = 'Windows refused to hide this window from capture. Try restarting the app; if it persists, please report your Windows version.';
    }
    els.pill.textContent = label;
    els.pill.className = `pill ${ok ? 'ok' : 'bad'}`;
    if (!warn && st.platform === 'win32' && st.windowsBuild && st.windowsBuild < 19041 && st.protectedFromCapture) {
      warn = 'Windows older than 10 (2004): recordings will show a black box here instead of hiding it.';
    }
    els.osWarning.textContent = warn;
    els.osWarning.hidden = !warn;
    layout();
  });

  if (s.text) els.script.setSelectionRange(0, 0);
  els.script.focus();
})();
