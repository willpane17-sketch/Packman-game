/* ==========================================================================
   leaderboard.js - the sign-in gate and the score table it shows.

   Drives the HTML overlay rather than the canvas, so names and passcodes are
   typed into real inputs with a real keyboard, and styles it to match the
   arcade shell. Talks to Accounts for everything to do with who is playing.

   With a server configured (see LEADERBOARD.md) the table is shared and live.
   Without one it is this machine's own table, which is all an offline copy
   of the game can honestly offer.
   ========================================================================== */
(function (global) {
  'use strict';

  const POLL = 8000;               // how often a shared board refreshes
  const SHOWN = 10;

  let el = {};
  let busy = false;
  let pollTimer = null;
  let scope = { map: null, mode: null };
  let onReady = null;

  /* ---- optional server ------------------------------------------------ */

  const LOCAL_LABEL = 'This machine only · see LEADERBOARD.md to share one';
  let backendLabel = LOCAL_LABEL;

  function serverUrl() {
    // ?server=http://host:port on the URL, or a value saved from last time
    try {
      const q = new URLSearchParams(location.search).get('server');
      if (q) { localStorage.setItem('tt-burger-server', q); return q; }
      return localStorage.getItem('tt-burger-server');
    } catch (e) { return null; }
  }

  /**
   * Work out where scores live. An explicit ?server= wins. Otherwise, if the
   * page came over http it may have been served by server.js itself, so ask:
   * a real answer means the board is shared, anything else means this machine
   * only - which is also what an offline file:// copy always gets.
   */
  function resolveBackend() {
    const explicit = serverUrl();
    if (explicit) {
      Accounts.useRemote(makeRemote(explicit));
      backendLabel = 'Shared board · ' + explicit;
      return Promise.resolve();
    }
    if (location.protocol !== 'http:' && location.protocol !== 'https:') {
      backendLabel = LOCAL_LABEL;
      return Promise.resolve();
    }
    return fetch('api/leaderboard')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.ok) {
          Accounts.useRemote(makeRemote(location.origin));
          backendLabel = 'Shared board · ' + location.origin;
        } else {
          backendLabel = LOCAL_LABEL;
        }
      })
      .catch(function () { backendLabel = LOCAL_LABEL; });
  }

  function makeRemote(base) {
    function call(path, body) {
      return fetch(base.replace(/\/$/, '') + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
      }).then(function (r) { return r.json(); })
        .catch(function () { return { ok: false, error: 'CANNOT REACH THE SERVER' }; });
    }
    return {
      signUp: function (name, pass) { return call('/api/register', { name: name, pass: pass }); },
      signIn: function (name, pass) { return call('/api/login', { name: name, pass: pass }); },
      submit: function (name, score, map, mode, won) {
        return call('/api/score', { name: name, score: score, map: map, mode: mode, won: !!won });
      },
      table: function (map, mode) {
        const q = map && mode ? '?map=' + encodeURIComponent(map) + '&mode=' + encodeURIComponent(mode) : '';
        return call('/api/leaderboard' + q).then(function (r) {
          return (r && r.rows) || [];
        });
      }
    };
  }

  /* ---- rendering ------------------------------------------------------ */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function paint(rows) {
    if (!el.list) return;
    const me = Accounts.current();
    const live = rows.filter(function (r) { return r.score > 0; }).slice(0, SHOWN);
    if (!live.length) {
      el.list.innerHTML = '<li class="empty">No scores yet &mdash; be the first</li>';
      return;
    }
    el.list.innerHTML = live.map(function (r, i) {
      const mine = me && r.name === me.name ? ' class="me"' : '';
      return '<li' + mine + '><span class="pos">' + (i + 1) +
        '</span><span class="nm">' + esc(r.name) +
        '</span><span class="sc">' + String(r.score).padStart(6, '0') + '</span></li>';
    }).join('');
  }

  function refresh() {
    if (!Accounts) return Promise.resolve();
    return Accounts.table(scope.map, scope.mode).then(paint).catch(function () { /* offline */ });
  }

  function setScope(map, mode, label) {
    scope = { map: map, mode: mode };
    if (el.scopeLabel) el.scopeLabel.textContent = label ? '· ' + label : '';
    return refresh();
  }

  /* ---- the gate ------------------------------------------------------- */

  function fail(msg) {
    if (el.error) el.error.textContent = msg || '';
  }

  function lock(on) {
    busy = on;
    [el.signIn, el.signUp, el.guest].forEach(function (b) { if (b) b.disabled = on; });
  }

  function finish() {
    if (el.gate) el.gate.hidden = true;
    stopPolling();
    updateWho();
    if (onReady) { const f = onReady; onReady = null; f(); }
  }

  function handle(promise) {
    lock(true);
    fail('');
    promise.then(function (r) {
      lock(false);
      if (r && r.ok) { finish(); return; }
      fail((r && r.error) || 'THAT DID NOT WORK');
    }).catch(function () {
      lock(false);
      fail('SOMETHING WENT WRONG - TRY AGAIN');
    });
  }

  function startPolling() {
    stopPolling();
    if (!Accounts.isRemote()) return;              // a local table cannot change
    pollTimer = setInterval(refresh, POLL);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function updateWho() {
    if (!el.who) return;
    const me = Accounts.current();
    el.who.hidden = false;
    el.who.textContent = me ? me.name : 'Guest · sign in';
    el.who.title = me ? 'Signed in as ' + me.name + ' - click to sign out' : 'Click to sign in';
  }

  const Leaderboard = {
    /** Wire up the overlay. `ready` runs once the player is through it. */
    init: function (ready) {
      el = {
        gate: document.getElementById('gate'),
        form: document.getElementById('gate-form'),
        name: document.getElementById('gate-name'),
        pass: document.getElementById('gate-pass'),
        error: document.getElementById('gate-error'),
        signIn: document.getElementById('gate-in'),
        signUp: document.getElementById('gate-new'),
        guest: document.getElementById('gate-guest'),
        list: document.getElementById('gate-board-list'),
        scopeLabel: document.getElementById('gate-board-scope'),
        where: document.getElementById('gate-where'),
        who: document.getElementById('who'),
        boardBtn: document.getElementById('board-btn')
      };
      onReady = ready || null;

      if (el.form) {
        el.form.addEventListener('submit', function (e) {
          e.preventDefault();
          if (busy) return;
          handle(Accounts.signIn(el.name.value, el.pass.value));
        });
      }
      if (el.signUp) {
        el.signUp.addEventListener('click', function () {
          if (busy) return;
          handle(Accounts.signUp(el.name.value, el.pass.value));
        });
      }
      if (el.guest) {
        el.guest.addEventListener('click', function () {
          Accounts.playAsGuest();
          finish();
        });
      }
      if (el.who) {
        el.who.addEventListener('click', function () {
          if (Accounts.current()) Accounts.signOut();
          Leaderboard.open();
        });
      }
      if (el.boardBtn) {
        el.boardBtn.addEventListener('click', function () { Leaderboard.open(); });
      }

      return resolveBackend().then(function () {
        if (el.where) el.where.textContent = backendLabel;
        // already signed in from last time? straight through
        if (Accounts.restore()) { finish(); return; }
        Leaderboard.open();
      });
    },

    open: function () {
      if (!el.gate) return;
      el.gate.hidden = false;
      fail('');
      if (el.pass) el.pass.value = '';
      const me = Accounts.current();
      if (me && el.name) el.name.value = me.name;
      refresh();
      startPolling();
      if (el.name && !el.name.value) el.name.focus();
      else if (el.pass) el.pass.focus();
    },

    isOpen: function () { return !!(el.gate && !el.gate.hidden); },

    setScope: setScope,
    refresh: refresh,

    /** Called when a run ends. */
    submit: function (score, map, mode, won) {
      if (!Accounts.current()) return Promise.resolve({ ok: false });
      return Accounts.submit(score, map, mode, won).then(function (r) {
        refresh();
        return r;
      });
    },

    who: function () {
      const me = Accounts.current();
      return me ? me.name : null;
    },

    updateWho: updateWho
  };

  global.Leaderboard = Leaderboard;
})(window);
