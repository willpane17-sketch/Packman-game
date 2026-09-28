/* ==========================================================================
   server.js - the optional shared leaderboard.

   Run this on ONE machine and everyone else plays against the same table:

       node server.js

   It serves the game itself as well as the API, so players just open
   http://<that machine>:3000 - same origin, nothing to configure.

   No dependencies: Node's own modules only. Accounts are stored in
   leaderboard.json beside this file, with passcodes kept as a scrypt hash
   and a per-account salt, never in the clear.

   This is a classroom leaderboard on a trusted network. It speaks plain HTTP,
   so a passcode is readable by anyone who can watch the traffic. Nobody
   should use a passcode here that they use anywhere else.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const STORE = path.join(ROOT, 'leaderboard.json');

const NAME_RE = /^[A-Za-z0-9 _-]{2,14}$/;
const PASS_MIN = 4;
const MAX_BODY = 8 * 1024;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

/* ---- storage ---------------------------------------------------------- */

let data = { players: {} };
try {
  if (fs.existsSync(STORE)) data = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  if (!data || typeof data !== 'object' || !data.players) data = { players: {} };
} catch (e) {
  console.error('Could not read ' + STORE + ', starting empty:', e.message);
  data = { players: {} };
}

let saveQueued = false;
function save() {
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(function () {
    saveQueued = false;
    const tmp = STORE + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
      fs.renameSync(tmp, STORE);           // atomic, so a crash cannot truncate it
    } catch (e) {
      console.error('Could not save:', e.message);
    }
  }, 250);
}

/* ---- passcodes -------------------------------------------------------- */

function hash(pass, salt) {
  return new Promise(function (resolve, reject) {
    crypto.scrypt(pass, salt, SCRYPT.keylen, SCRYPT, function (err, key) {
      if (err) reject(err); else resolve(key.toString('hex'));
    });
  });
}

function sameHash(a, b) {
  const x = Buffer.from(String(a), 'hex');
  const y = Buffer.from(String(b), 'hex');
  if (x.length !== y.length || !x.length) return false;
  return crypto.timingSafeEqual(x, y);
}

/* ---- a plain guard against passcode guessing -------------------------- */

const attempts = new Map();                // ip -> { n, until }
function throttled(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() > a.until) { attempts.delete(ip); return false; }
  return a.n >= 10;
}
function noteFailure(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n++;
  a.until = Date.now() + 60000;
  attempts.set(ip, a);
}
function clearFailures(ip) { attempts.delete(ip); }

/* ---- helpers ---------------------------------------------------------- */

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    const chunks = [];
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too big')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.json': 'application/json',
  '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8'
};

function serveFile(req, res) {
  let rel = decodeURIComponent((req.url.split('?')[0] || '/'));
  if (rel === '/') rel = '/index.html';
  const full = path.join(ROOT, path.normalize(rel));
  // never serve outside the game folder, and never the score file
  if (!full.startsWith(ROOT + path.sep) || path.basename(full) === 'leaderboard.json') {
    send(res, 404, { ok: false, error: 'not found' });
    return;
  }
  fs.readFile(full, function (err, buf) {
    if (err) { send(res, 404, { ok: false, error: 'not found' }); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

/* ---- the API ---------------------------------------------------------- */

function rows(map, mode) {
  return Object.keys(data.players).map(function (name) {
    const p = data.players[name];
    const best = p.best || {};
    let score = 0;
    if (map && mode) {
      score = best[map + '|' + mode] || 0;
    } else {
      Object.keys(best).forEach(function (k) { if (best[k] > score) score = best[k]; });
    }
    return { name: name, score: score, wins: p.wins || 0, played: p.played || 0 };
  }).sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name); })
    .slice(0, 50);
}

const server = http.createServer(function (req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const url = req.url.split('?')[0];

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end();
    return;
  }

  if (url === '/api/leaderboard' && req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    send(res, 200, { ok: true, rows: rows(q.get('map'), q.get('mode')) });
    return;
  }

  if (url === '/api/register' && req.method === 'POST') {
    readBody(req).then(function (b) {
      const name = String(b.name || '').trim();
      const pass = String(b.pass || '');
      if (!NAME_RE.test(name)) return send(res, 200, { ok: false, error: 'NAME MUST BE 2-14 LETTERS, NUMBERS, SPACE, - OR _' });
      if (pass.length < PASS_MIN) return send(res, 200, { ok: false, error: 'PASSCODE NEEDS AT LEAST 4 CHARACTERS' });
      if (data.players[name]) return send(res, 200, { ok: false, error: 'THAT NAME IS TAKEN' });
      const salt = crypto.randomBytes(16).toString('hex');
      hash(pass, salt).then(function (h) {
        data.players[name] = { salt: salt, hash: h, best: {}, wins: 0, played: 0, created: Date.now() };
        save();
        console.log('new player:', name);
        send(res, 200, { ok: true });
      });
    }).catch(function () { send(res, 400, { ok: false, error: 'BAD REQUEST' }); });
    return;
  }

  if (url === '/api/login' && req.method === 'POST') {
    if (throttled(ip)) { send(res, 429, { ok: false, error: 'TOO MANY TRIES - WAIT A MINUTE' }); return; }
    readBody(req).then(function (b) {
      const name = String(b.name || '').trim();
      const pass = String(b.pass || '');
      const p = data.players[name];
      // hash either way so a missing name does not answer faster
      const salt = p ? p.salt : crypto.randomBytes(16).toString('hex');
      hash(pass, salt).then(function (h) {
        if (!p || !sameHash(h, p.hash)) {
          noteFailure(ip);
          return send(res, 200, { ok: false, error: 'NAME OR PASSCODE IS WRONG' });
        }
        clearFailures(ip);
        send(res, 200, { ok: true });
      });
    }).catch(function () { send(res, 400, { ok: false, error: 'BAD REQUEST' }); });
    return;
  }

  if (url === '/api/score' && req.method === 'POST') {
    readBody(req).then(function (b) {
      const name = String(b.name || '').trim();
      const score = Number(b.score);
      const p = data.players[name];
      if (!p) return send(res, 200, { ok: false, error: 'NO SUCH PLAYER' });
      if (!Number.isFinite(score) || score < 0 || score > 100000000) {
        return send(res, 200, { ok: false, error: 'BAD SCORE' });
      }
      const slot = String(b.map || '?') + '|' + String(b.mode || '?');
      p.best = p.best || {};
      if (!p.best[slot] || score > p.best[slot]) p.best[slot] = Math.round(score);
      if (b.won) p.wins = (p.wins || 0) + 1;
      p.played = (p.played || 0) + 1;
      p.last = Date.now();
      save();
      send(res, 200, { ok: true });
    }).catch(function () { send(res, 400, { ok: false, error: 'BAD REQUEST' }); });
    return;
  }

  if (url.startsWith('/api/')) { send(res, 404, { ok: false, error: 'not found' }); return; }
  serveFile(req, res);
});

server.listen(PORT, function () {
  console.log('Burger Munch leaderboard running.');
  console.log('  On this machine:  http://localhost:' + PORT);
  const nets = require('os').networkInterfaces();
  Object.keys(nets).forEach(function (n) {
    (nets[n] || []).forEach(function (a) {
      if (a.family === 'IPv4' && !a.internal) {
        console.log('  On the network:   http://' + a.address + ':' + PORT);
      }
    });
  });
  console.log('\nScores are saved to ' + STORE);
});
