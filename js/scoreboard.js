// Scoreboard — game-over name entry + leaderboard, backed by the /api server.
//
// Degrades gracefully: if the backend isn't reachable (e.g. the game is opened
// straight from a file:// URL with no server running), the name form and
// leaderboard are hidden and only the "Play Again" button is shown, so the
// base game keeps working with zero backend.

const Scoreboard = (function () {
  // Where the REST API lives. When the game is served by our Node server this
  // is same-origin (/api). Allow an override for hosting the API elsewhere.
  const API_BASE = (typeof window !== 'undefined' && window.ORBIT_API_BASE) ||
    ((location.protocol === 'http:' || location.protocol === 'https:') ? '/api' : null);

  const LAST_NAME_KEY = 'orbit-scoreboard-name';

  let els = null;
  let handled = false;        // rising-edge guard so we only react once per game over
  let submitting = false;
  let lastRounds = 0;

  function $(id) { return document.getElementById(id); }

  function cacheEls() {
    els = {
      panel:       $('game-over'),
      form:        $('score-form'),
      nameInput:   $('score-name'),
      saveBtn:     $('save-score-btn'),
      skipBtn:     $('skip-score-btn'),
      msg:         $('score-msg'),
      leaderboard: $('leaderboard'),
      list:        $('leaderboard-list'),
      restartBtn:  $('restart-btn'),
    };
  }

  function setMsg(text, kind) {
    if (!els.msg) return;
    els.msg.hidden = !text;
    els.msg.textContent = text || '';
    els.msg.className = 'score-msg' + (kind ? ' ' + kind : '');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // --- networking ------------------------------------------------------

  async function fetchScores() {
    const res = await fetch(API_BASE + '/scores', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return Array.isArray(data.scores) ? data.scores : [];
  }

  async function postScore(name, rounds) {
    const res = await fetch(API_BASE + '/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, rounds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data; // { score, rank }
  }

  // --- rendering -------------------------------------------------------

  function renderListInto(listEl, scores, highlight) {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!scores.length) {
      const li = document.createElement('li');
      li.className = 'lb-empty';
      li.textContent = 'No scores yet — be the first!';
      listEl.appendChild(li);
      return;
    }
    scores.forEach((s) => {
      const li = document.createElement('li');
      const isMine = highlight &&
        s.name === highlight.name && Number(s.rounds) === Number(highlight.rounds);
      if (isMine) li.className = 'lb-mine';
      li.innerHTML =
        '<span class="lb-name">' + escapeHtml(s.name) + '</span>' +
        '<span class="lb-rounds">' + escapeHtml(s.rounds) + '</span>';
      listEl.appendChild(li);
    });
  }

  function renderLeaderboard(scores, highlight) {
    renderListInto(els.list, scores, highlight);
  }

  async function loadLeaderboard(highlight) {
    try {
      const scores = await fetchScores();
      renderLeaderboard(scores, highlight);
      els.leaderboard.hidden = false;
      return true;
    } catch (_) {
      els.leaderboard.hidden = true;
      return false;
    }
  }

  // Public helper: fetch + render into an arbitrary <ol>/<ul>. Returns true
  // on success, false if the backend is unreachable. Used by the pause screen.
  async function loadInto(listEl) {
    if (!listEl) return false;
    if (!API_BASE) return false;
    try {
      const scores = await fetchScores();
      renderListInto(listEl, scores, null);
      return true;
    } catch (_) {
      return false;
    }
  }

  // --- game-over flow --------------------------------------------------

  // Show the offline variant: no form, no leaderboard, just restart.
  function showOffline() {
    if (els.form) els.form.hidden = true;
    if (els.leaderboard) els.leaderboard.hidden = true;
    setMsg('', null);
    els.restartBtn.hidden = false;
  }

  // Show the dev-mode variant: this run is tainted, no submission, just
  // a "did not count" notice and restart. Leaderboard still rendered for
  // context if the backend is reachable.
  function showDevTainted() {
    if (els.form) els.form.hidden = true;
    setMsg('🛡 Dev mode was active — this run did not count', 'err');
    els.restartBtn.hidden = false;
  }

  // Called every frame while gameOver is true; acts only on the rising edge.
  async function notifyGameOver(rounds, devTainted) {
    if (handled) return;
    handled = true;
    lastRounds = rounds;

    if (!els) cacheEls();

    // Dev-mode run: never submit, never collect a name. Optionally render
    // the leaderboard for reference.
    if (devTainted) {
      showDevTainted();
      if (API_BASE) await loadLeaderboard(null);
      else if (els.leaderboard) els.leaderboard.hidden = true;
      return;
    }

    // No backend available at all → offline mode.
    if (!API_BASE) { showOffline(); return; }

    // Fresh form each game over.
    els.form.hidden = false;
    els.saveBtn.disabled = false;
    els.skipBtn.disabled = false;
    els.restartBtn.hidden = true;
    submitting = false;
    setMsg('', null);
    try { els.nameInput.value = localStorage.getItem(LAST_NAME_KEY) || ''; } catch (_) {}

    // Pull the current leaderboard. If the server is unreachable, go offline.
    const ok = await loadLeaderboard(null);
    if (!ok) showOffline();
  }

  async function submit() {
    if (submitting) return;
    const name = (els.nameInput.value || '').trim();
    submitting = true;
    els.saveBtn.disabled = true;
    els.skipBtn.disabled = true;
    setMsg('Saving…', null);

    try {
      const { score } = await postScore(name, lastRounds);
      try { localStorage.setItem(LAST_NAME_KEY, score.name); } catch (_) {}
      els.form.hidden = true;
      setMsg('Score saved as ' + score.name + '!', 'ok');
      await loadLeaderboard(score);
      els.restartBtn.hidden = false;
    } catch (err) {
      // Let the player retry or skip.
      submitting = false;
      els.saveBtn.disabled = false;
      els.skipBtn.disabled = false;
      setMsg('Could not save score. Try again or skip.', 'err');
    }
  }

  function skip() {
    restart();
  }

  function restart() {
    // Globals provided by world.js / input.js.
    generateWorld();
    Input.togglePause(false);
    els.panel.hidden = true;
  }

  function reset() {
    // Clears the rising-edge guard so the next game over re-triggers the flow.
    handled = false;
  }

  function init() {
    cacheEls();
    if (els.form) els.form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    if (els.skipBtn) els.skipBtn.addEventListener('click', skip);
    if (els.restartBtn) els.restartBtn.addEventListener('click', restart);
  }

  return { init, notifyGameOver, reset, loadInto, hasBackend: () => !!API_BASE };
})();
