/* ==========================================================================
   accounts.js - player accounts and the score table.

   Accounts live in localStorage on this machine. A passcode is never stored:
   only a PBKDF2-SHA256 derivation of it with a random per-account salt, so
   reading the saved data does not reveal anybody's passcode.

   This is a classroom leaderboard, not a real authentication system. There is
   no server to verify against when running offline, so anyone who can edit
   this machine's browser storage can edit the table. Do not reuse a passcode
   that matters anywhere else - see LEADERBOARD.md.
   ========================================================================== */
(function (global) {
  'use strict';

  const KEY = 'tt-burger-accounts';
  const SESSION = 'tt-burger-session';
  const ITERATIONS = 150000;
  const NAME_MAX = 14;

  let remote = null;               // set by Leaderboard when a server is in use
  let current = null;              // { name } of whoever is signed in

  /* ---- storage ------------------------------------------------------- */

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : null;
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};                   // private window, or corrupt data
    }
  }

  function save(all) {
    try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* no store */ }
  }

  /* ---- hashing ------------------------------------------------------- */

  function bytesToHex(buf) {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
    return s;
  }

  function randomSalt() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return bytesToHex(b);
  }

  /** PBKDF2-SHA256 of the passcode against the account's own salt. */
  function derive(passcode, saltHex) {
    const enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits({
          name: 'PBKDF2', salt: enc.encode(saltHex),
          iterations: ITERATIONS, hash: 'SHA-256'
        }, key, 256);
      })
      .then(bytesToHex);
  }

  /** Constant-time-ish compare, so a wrong passcode does not leak by timing. */
  function same(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  /* ---- validation ---------------------------------------------------- */

  function cleanName(name) {
    return String(name || '').trim().slice(0, NAME_MAX);
  }

  function nameProblem(name) {
    if (name.length < 2) return 'NAME NEEDS AT LEAST 2 CHARACTERS';
    if (name.length > NAME_MAX) return 'NAME IS TOO LONG';
    if (!/^[A-Za-z0-9 _-]+$/.test(name)) return 'LETTERS, NUMBERS, SPACE, - AND _ ONLY';
    return null;
  }

  function passProblem(pass) {
    if (String(pass || '').length < 4) return 'PASSCODE NEEDS AT LEAST 4 CHARACTERS';
    return null;
  }

  const Accounts = {
    NAME_MAX: NAME_MAX,

    /** Point the module at a server; all calls then go through it. */
    useRemote: function (r) { remote = r; },
    isRemote: function () { return !!remote; },

    current: function () { return current; },

    /** Resume a session from a previous run, if the account still exists. */
    restore: function () {
      let name = null;
      try { name = localStorage.getItem(SESSION); } catch (e) { return null; }
      if (!name) return null;
      if (remote) { current = { name: name }; return current; }
      const all = load();
      if (!all[name]) return null;
      current = { name: name };
      return current;
    },

    signUp: function (name, pass) {
      name = cleanName(name);
      const np = nameProblem(name) || passProblem(pass);
      if (np) return Promise.resolve({ ok: false, error: np });
      if (remote) return remote.signUp(name, pass).then(function (r) {
        if (r.ok) Accounts._enter(name);
        return r;
      });
      const all = load();
      if (all[name]) return Promise.resolve({ ok: false, error: 'THAT NAME IS TAKEN' });
      const salt = randomSalt();
      return derive(pass, salt).then(function (hash) {
        all[name] = { salt: salt, hash: hash, iter: ITERATIONS, best: {}, wins: 0, created: Date.now() };
        save(all);
        Accounts._enter(name);
        return { ok: true };
      });
    },

    signIn: function (name, pass) {
      name = cleanName(name);
      if (!name) return Promise.resolve({ ok: false, error: 'ENTER YOUR NAME' });
      if (remote) return remote.signIn(name, pass).then(function (r) {
        if (r.ok) Accounts._enter(name);
        return r;
      });
      const all = load();
      const acct = all[name];
      // derive either way, so a missing account does not answer faster
      const salt = acct ? acct.salt : randomSalt();
      return derive(pass, salt).then(function (hash) {
        if (!acct || !same(hash, acct.hash)) {
          return { ok: false, error: 'NAME OR PASSCODE IS WRONG' };
        }
        Accounts._enter(name);
        return { ok: true };
      });
    },

    _enter: function (name) {
      current = { name: name };
      try { localStorage.setItem(SESSION, name); } catch (e) { /* no store */ }
    },

    signOut: function () {
      current = null;
      try { localStorage.removeItem(SESSION); } catch (e) { /* no store */ }
    },

    /** Guests play without an account and are never put on the board. */
    playAsGuest: function () {
      current = null;
      try { localStorage.removeItem(SESSION); } catch (e) { /* no store */ }
    },

    /**
     * Record a finished run. Only a personal best per map and mode is kept,
     * which is what the board shows.
     */
    submit: function (score, map, mode, won) {
      if (!current || !score) return Promise.resolve({ ok: false });
      if (remote) return remote.submit(current.name, score, map, mode, won);
      const all = load();
      const acct = all[current.name];
      if (!acct) return Promise.resolve({ ok: false });
      const slot = map + '|' + mode;
      acct.best = acct.best || {};
      if (!acct.best[slot] || score > acct.best[slot]) acct.best[slot] = score;
      if (won) acct.wins = (acct.wins || 0) + 1;
      acct.played = (acct.played || 0) + 1;
      acct.last = Date.now();
      save(all);
      return Promise.resolve({ ok: true });
    },

    /**
     * The table. Ranked on each player's best score for the given map and
     * mode, or on their best anywhere when neither is given.
     */
    table: function (map, mode) {
      if (remote) return remote.table(map, mode);
      const all = load();
      const rows = Object.keys(all).map(function (name) {
        const a = all[name];
        const best = a.best || {};
        let score = 0;
        if (map && mode) {
          score = best[map + '|' + mode] || 0;
        } else {
          Object.keys(best).forEach(function (k) { if (best[k] > score) score = best[k]; });
        }
        return { name: name, score: score, wins: a.wins || 0, played: a.played || 0 };
      });
      rows.sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); });
      return Promise.resolve(rows);
    },

    /** Only ever used to wipe this machine's own data. */
    wipeLocal: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem(SESSION); } catch (e) { /* */ }
      current = null;
    }
  };

  global.Accounts = Accounts;
})(window);
