# Accounts and the leaderboard

The game asks who is playing before it starts. Sign in and your scores go on
the board; **Play as guest** skips all of it and saves nothing.

There are two ways to run the board, and the game works out which by itself.

## 1. On one machine (nothing to set up)

Open the game the normal way and it keeps accounts and scores in that
browser's own storage. Everyone who plays on that PC shares the table, which
is all an offline copy can honestly do - there is nothing for it to talk to.

Good for a single machine everyone takes turns on. The card says
*This machine only*.

## 2. Shared and live across the room

Run the server on **one** machine:

```bash
node server.js
```

It prints its address:

```
  On this machine:  http://localhost:3000
  On the network:   http://192.168.1.50:3000
```

Everyone else opens that network address in a browser. That is the whole
setup - the server hands out the game and the scores together, so the game
sees it automatically and the card says *Shared board*. The table refreshes
every eight seconds, so a score set on one machine shows up on the others
without anyone reloading.

To play through the desktop app instead of a browser:

```bash
npm start -- --server=http://192.168.1.50:3000
```

Scores are written to `leaderboard.json` next to `server.js`. It is
gitignored, so nobody's accounts end up in the repository. Delete that file
to wipe the board.

`PORT=8080 node server.js` if 3000 is taken.

## How the board is ranked

Each player keeps a **personal best per map and per difficulty**, and the
table ranks those - so Tilted Towers on Extreme has its own top ten,
separate from Dusty Divot on Easy. The board follows whichever map and mode
are selected. Playing badly never pushes your own best down.

## About the passcodes

**Do not use a password you use anywhere else.**

What is done properly:

- A passcode is never stored anywhere, in the browser or on the server. Only
  a hash of it is kept, with a random salt per account - PBKDF2-SHA256 at
  150,000 iterations in the browser, scrypt on the server.
- Comparisons are timing-safe, and signing in with a name that does not exist
  takes the same work as one that does, so the reply cannot be used to find
  out who has an account.
- The server gives the same message for a wrong name and a wrong passcode,
  limits a machine to ten failed attempts a minute, will not serve
  `leaderboard.json` to a browser, and refuses paths that try to climb out of
  the game folder.

What is not, and cannot be here:

- The server speaks plain HTTP. On a shared network, anyone who can watch the
  traffic can read a passcode as it is sent. Doing this properly needs HTTPS
  and a certificate, which is well beyond a classroom game.
- With no server, there is nothing to verify against. Anyone who can open
  the browser's developer tools on that machine can edit its stored scores.
- There are no sessions or tokens. The server takes a score submission on the
  strength of the name attached to it, so on a shared board someone could
  post a score as somebody else if they wanted to.

It is a leaderboard for a game, built to show the right habits - salted
hashing, timing-safe comparison, no plaintext anywhere. It is not something
to trust with anything that matters.
