/* ==========================================================================
   quiz.js - the digital forensics question gate.
   A power-up is collected but does nothing until its question is answered.
   Level 3 year 2 cyber security: ACPO principles, acquisition and imaging,
   evidence handling, artefacts, anti-forensics and the relevant UK law.
   The game freezes while a question is up, so nobody dies while reading.
   ========================================================================== */
(function (global) {
  'use strict';

  /* Each entry: the question, four options, the index of the right one, and
     a line of feedback shown afterwards so a wrong answer still teaches. */
  const BANK = [
    { t: 'ACPO',
      q: 'ACPO principle 1 says that no action taken should do what?',
      a: ['Change data that may later be relied on in court',
          'Take longer than 24 hours',
          'Be carried out without a warrant',
          'Be performed on a live machine'],
      c: 0,
      why: 'Principle 1 is about preserving the evidence exactly as found.' },

    { t: 'ACPO',
      q: 'Under ACPO principle 3, what must exist for all processes applied to evidence?',
      a: ['A signed confession', 'An audit trail a third party could repeat',
          'A copy held by the defence', 'A police officer present'],
      c: 1,
      why: 'An independent examiner following your record must reach the same result.' },

    { t: 'ACPO',
      q: 'ACPO principle 2 allows access to original data only when the person is what?',
      a: ['A police officer', 'Over 18',
          'Competent to do so and able to explain their actions in court',
          'Supervised by two colleagues'],
      c: 2,
      why: 'Competence plus the ability to justify what you did and why.' },

    { t: 'ACPO',
      q: 'Who does ACPO principle 4 place overall responsibility on?',
      a: ['The forensic lab', 'The person in charge of the investigation',
          'The arresting officer', 'The court'],
      c: 1,
      why: 'The case officer must ensure the law and the principles are followed.' },

    { t: 'VOLATILITY',
      q: 'In the order of volatility, which should be collected FIRST?',
      a: ['Hard disk contents', 'Archived backups',
          'CPU registers and cache', 'Remote logging data'],
      c: 2,
      why: 'Most volatile first: registers and cache vanish almost instantly.' },

    { t: 'VOLATILITY',
      q: 'Which of these is volatile evidence?',
      a: ['A file saved on the SSD', 'The contents of RAM',
          'A DVD in the drive', 'The Windows registry on disk'],
      c: 1,
      why: 'RAM is lost the moment the machine loses power.' },

    { t: 'VOLATILITY',
      q: 'Pulling the plug on a running suspect machine would destroy which evidence?',
      a: ['Running processes and network connections', 'Deleted files in unallocated space',
          'The partition table', 'File slack'],
      c: 0,
      why: 'Live state only exists in memory; disk artefacts survive a shutdown.' },

    { t: 'ACQUISITION',
      q: 'What is the purpose of a write blocker?',
      a: ['To speed up imaging', 'To encrypt the evidence drive',
          'To stop the examining machine writing to the evidence drive',
          'To wipe the destination disk'],
      c: 2,
      why: 'It allows reads but blocks writes, so the original is unchanged.' },

    { t: 'ACQUISITION',
      q: 'A forensic image should be which kind of copy?',
      a: ['A copy of the user documents folder', 'A bit-for-bit copy of the whole device',
          'A zip of every visible file', 'A screenshot of the file listing'],
      c: 1,
      why: 'Only a bit-for-bit image captures deleted data, slack and unallocated space.' },

    { t: 'ACQUISITION',
      q: 'Which is true of the E01 format compared with a raw dd image?',
      a: ['It stores case metadata and hashes inside the image',
          'It can only hold one partition', 'It is always smaller than the disk',
          'It cannot be verified'],
      c: 0,
      why: 'E01 embeds metadata and integrity hashes; dd is a plain raw stream.' },

    { t: 'ACQUISITION',
      q: 'When is a LIVE acquisition necessary rather than a dead one?',
      a: ['When the disk is small', 'When the machine is switched off',
          'When full disk encryption is mounted and unlocked',
          'When the suspect has confessed'],
      c: 2,
      why: 'Shut it down and the volume relocks, so the data is captured while mounted.' },

    { t: 'INTEGRITY',
      q: 'Why is a hash taken before AND after imaging a drive?',
      a: ['To compress the image', 'To show the copy is identical to the original',
          'To index the files for searching', 'To password protect the evidence'],
      c: 1,
      why: 'Matching hashes prove nothing changed during acquisition.' },

    { t: 'INTEGRITY',
      q: 'How many bits does a SHA-256 hash produce?',
      a: ['128', '160', '256', '512'],
      c: 2,
      why: 'SHA-256 gives 256 bits; MD5 gives 128 and SHA-1 gives 160.' },

    { t: 'INTEGRITY',
      q: 'Why are MD5 and SHA-1 now avoided for new forensic work?',
      a: ['They are too slow', 'Practical collision attacks exist against them',
          'They only work on text files', 'They need an internet connection'],
      c: 1,
      why: 'A collision means two different inputs share a hash, weakening the proof.' },

    { t: 'INTEGRITY',
      q: 'If the hash of an image no longer matches the original, what does that mean?',
      a: ['The image is compressed', 'The evidence integrity can no longer be shown',
          'The drive is encrypted', 'The case is automatically closed'],
      c: 1,
      why: 'A mismatch means the data changed, so the copy cannot be relied on.' },

    { t: 'CUSTODY',
      q: 'What does a chain of custody record?',
      a: ['Who had the evidence, when, and what they did with it',
          'The suspect previous convictions', 'The cost of the investigation',
          'The make and model of the examiner computer'],
      c: 0,
      why: 'Unbroken continuity from seizure to court, with every handover logged.' },

    { t: 'CUSTODY',
      q: 'A break in the chain of custody most likely results in what?',
      a: ['A longer sentence', 'The evidence being ruled inadmissible',
          'A retake of the image', 'A fine for the examiner'],
      c: 1,
      why: 'If continuity cannot be shown, the court may not accept the evidence.' },

    { t: 'CUSTODY',
      q: 'Locard exchange principle states that:',
      a: ['Every contact leaves a trace', 'All evidence must be hashed',
          'Digital evidence expires after a year', 'Only originals are admissible'],
      c: 0,
      why: 'Contact between two things transfers material - the basis of trace evidence.' },

    { t: 'ARTEFACTS',
      q: 'What is file slack?',
      a: ['Free space at the start of a disk',
          'The space between the end of a file and the end of its last cluster',
          'A backup copy of the file', 'Space used by the page file'],
      c: 1,
      why: 'Slack can hold fragments of whatever occupied those sectors before.' },

    { t: 'ARTEFACTS',
      q: 'File carving recovers files by looking for what?',
      a: ['File names in the directory', 'Header and footer signatures in raw data',
          'Registry keys', 'Shortcut files'],
      c: 1,
      why: 'Carving ignores the file system and matches magic numbers instead.' },

    { t: 'ARTEFACTS',
      q: 'The bytes FF D8 FF at the start of a file indicate which type?',
      a: ['PNG', 'PDF', 'JPEG', 'ZIP'],
      c: 2,
      why: 'JPEG starts FF D8 FF; PNG is 89 50 4E 47 and ZIP is 50 4B 03 04.' },

    { t: 'ARTEFACTS',
      q: 'On an NTFS volume, which structure holds a record for every file?',
      a: ['The Master File Table', 'The FAT', 'The boot sector', 'The page file'],
      c: 0,
      why: 'The $MFT holds metadata, timestamps and often small files themselves.' },

    { t: 'ARTEFACTS',
      q: 'MAC times on a file refer to which three timestamps?',
      a: ['Made, Archived, Copied', 'Modified, Accessed, Created',
          'Moved, Altered, Closed', 'Marked, Assigned, Checked'],
      c: 1,
      why: 'Comparing them can reveal tampering or when a file was really used.' },

    { t: 'ARTEFACTS',
      q: 'Windows Prefetch files are useful because they show:',
      a: ['Which websites were visited', 'That a program was executed and when',
          'Who logged in', 'Which files were deleted'],
      c: 1,
      why: 'A .pf file in C:\\Windows\\Prefetch is evidence of execution.' },

    { t: 'ARTEFACTS',
      q: 'Which registry hive holds local user account information?',
      a: ['SAM', 'SOFTWARE', 'NTUSER.DAT', 'SYSTEM'],
      c: 0,
      why: 'The SAM hive stores local accounts and password hashes.' },

    { t: 'ARTEFACTS',
      q: 'EXIF metadata in a photograph may reveal:',
      a: ['The file owner bank details', 'Camera model, date taken and GPS coordinates',
          'The printer used', 'The number of times it was opened'],
      c: 1,
      why: 'EXIF is a rich source of location and device evidence.' },

    { t: 'ARTEFACTS',
      q: 'On modern Windows, a file sent to the Recycle Bin creates which pair?',
      a: ['$I and $R files', '.tmp and .bak files', 'A and B files', '$MFT entries only'],
      c: 0,
      why: '$I holds the original path and deletion time; $R holds the content.' },

    { t: 'ARTEFACTS',
      q: 'Unallocated space on a disk is best described as:',
      a: ['Space reserved by the operating system',
          'Clusters not currently assigned to a file, which may hold deleted data',
          'The swap partition', 'Space taken by system restore'],
      c: 1,
      why: 'Deleting usually unlinks the file, leaving the data until it is overwritten.' },

    { t: 'ANTI-FORENSICS',
      q: 'Steganography is the practice of:',
      a: ['Encrypting a disk', 'Hiding data inside another file such as an image',
          'Deleting log files', 'Spoofing a MAC address'],
      c: 1,
      why: 'The carrier looks normal; least significant bit embedding is common.' },

    { t: 'ANTI-FORENSICS',
      q: 'Which technique makes deleted data genuinely unrecoverable?',
      a: ['Emptying the Recycle Bin', 'Quick formatting the drive',
          'Overwriting the sectors with new data', 'Renaming the files'],
      c: 2,
      why: 'Only overwriting destroys the underlying data; the rest just unlink it.' },

    { t: 'ANTI-FORENSICS',
      q: 'Timestomping refers to:',
      a: ['Deleting the system clock', 'Altering file timestamps to mislead an examiner',
          'Synchronising logs across servers', 'Rebooting to clear RAM'],
      c: 1,
      why: 'Cross-checking $MFT records against other artefacts can expose it.' },

    { t: 'LAW',
      q: 'Which Act makes unauthorised access to computer material an offence in the UK?',
      a: ['Data Protection Act 2018', 'Computer Misuse Act 1990',
          'Freedom of Information Act 2000', 'Fraud Act 2006'],
      c: 1,
      why: 'Section 1 of the CMA 1990 covers unauthorised access.' },

    { t: 'LAW',
      q: 'Under the Computer Misuse Act, which section covers unauthorised acts intended to impair a computer?',
      a: ['Section 1', 'Section 2', 'Section 3', 'Section 5'],
      c: 2,
      why: 'Section 3 covers impairing operation, such as a denial of service attack.' },

    { t: 'LAW',
      q: 'Which UK legislation can compel a suspect to hand over an encryption key?',
      a: ['RIPA 2000', 'PACE 1984', 'GDPR', 'Computer Misuse Act 1990'],
      c: 0,
      why: 'Section 49 of RIPA 2000 allows a disclosure notice to be served.' },

    { t: 'LAW',
      q: 'Which Act primarily governs police powers of search and seizure in England and Wales?',
      a: ['PACE 1984', 'Computer Misuse Act 1990', 'Digital Economy Act 2017',
          'Official Secrets Act 1989'],
      c: 0,
      why: 'The Police and Criminal Evidence Act 1984 and its codes of practice.' },

    { t: 'LAW',
      q: 'Personal data found during an investigation must be handled in line with:',
      a: ['The Computer Misuse Act 1990', 'The Data Protection Act 2018 and UK GDPR',
          'The Malicious Communications Act', 'The Theft Act 1968'],
      c: 1,
      why: 'Lawful basis, minimisation and security still apply to case data.' },

    { t: 'MOBILE',
      q: 'Why is a seized phone placed in a Faraday bag?',
      a: ['To keep it charged', 'To stop it being remotely wiped or altered over the network',
          'To protect it from water', 'To hide it from the suspect'],
      c: 1,
      why: 'Blocking the signal preserves the device exactly as seized.' },

    { t: 'MOBILE',
      q: 'Which mobile extraction gets the most data including deleted items?',
      a: ['Manual examination', 'Logical extraction',
          'Physical extraction', 'Screenshots of each app'],
      c: 2,
      why: 'A physical extraction images the flash memory, not just live files.' },

    { t: 'NETWORK',
      q: 'A PCAP file captured during an incident contains:',
      a: ['Disk images', 'Recorded network packets',
          'Registry exports', 'Memory dumps'],
      c: 1,
      why: 'Tools such as Wireshark replay and analyse the captured traffic.' },

    { t: 'NETWORK',
      q: 'Which tool is used for memory (RAM) analysis?',
      a: ['Wireshark', 'Volatility', 'Nmap', 'Hashcat'],
      c: 1,
      why: 'Volatility parses a memory image for processes, connections and injected code.' },

    { t: 'NETWORK',
      q: 'Why is accurate time synchronisation important across logged systems?',
      a: ['It saves disk space', 'It lets events on different machines be correlated',
          'It speeds up the network', 'It is required for encryption'],
      c: 1,
      why: 'Without a shared reference you cannot build a reliable timeline.' },

    { t: 'ANALYSIS',
      q: 'Static malware analysis means:',
      a: ['Running the sample in a sandbox', 'Examining the file without executing it',
          'Interviewing the user', 'Reimaging the machine'],
      c: 1,
      why: 'Strings, headers and disassembly, with no execution risk.' },

    { t: 'ANALYSIS',
      q: 'Why is analysis carried out on a working copy rather than the original image?',
      a: ['It is faster', 'To preserve the original evidence unaltered',
          'The original will not open', 'To save storage'],
      c: 1,
      why: 'The verified master image is kept untouched for the court.' },

    { t: 'REPORTING',
      q: 'A forensic report should be written so that:',
      a: ['Only other examiners can follow it',
          'A non-technical reader can understand the findings and how they were reached',
          'It hides the tools used', 'It states the suspect is guilty'],
      c: 1,
      why: 'Clear, impartial and repeatable - the examiner reports facts, not verdicts.' },

    { t: 'REPORTING',
      q: 'An expert witness duty is owed primarily to:',
      a: ['The client who pays them', 'The court', 'The police', 'The defendant'],
      c: 1,
      why: 'That duty overrides any obligation to whoever instructed them.' }
  ];

  const COOLDOWN = 0;              // the game's own 20s clock paces the questions
  const COLORS = {
    panel: '#0b1f1a', edge: '#7ef0ff', dim: '#8fb8b0',
    right: '#7ee07a', wrong: '#ff5a5a', pick: '#ffd447'
  };

  let pool = [];                   // shuffled question indices not yet used
  let cur = null;                  // the question on screen
  let sel = 0;
  let phase = 'ask';               // 'ask' then 'reveal'
  let held = 0;                    // seconds the reveal has been up
  let done = null;                 // callback once the player moves on
  let cooldown = 0;
  let stats = { asked: 0, right: 0 };

  function refill() {
    pool = BANK.map(function (_, i) { return i; });
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
  }
  refill();

  /* The options are shuffled every time a question comes up. Written out in
     order the right answer sat in the same slot far too often, which teaches
     the slot rather than the subject. */
  function shuffled(e) {
    const order = e.a.map(function (_, i) { return i; });
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    return {
      t: e.t, q: e.q, why: e.why,
      a: order.map(function (i) { return e.a[i]; }),
      c: order.indexOf(e.c)
    };
  }

  function wrap(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + ' ' + words[i] : words[i];
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  const Quiz = {
    /** True while a question is on screen - the game freezes on this. */
    active: function () { return cur !== null; },

    /** Questions are spaced out so two power-ups in a row are not two quizzes. */
    ready: function () { return cooldown <= 0; },

    tick: function (dt) {
      if (cooldown > 0) cooldown -= dt;
      if (cur && phase === 'reveal') held += dt;
    },

    ask: function (onDone) {
      if (!pool.length) refill();
      cur = shuffled(BANK[pool.pop()]);
      sel = 0;
      phase = 'ask';
      held = 0;
      done = onDone || null;
      stats.asked++;
    },

    move: function (d) {
      if (!cur || phase !== 'ask') return;
      sel = (sel + d + cur.a.length) % cur.a.length;
    },

    pick: function (i) {
      if (!cur || phase !== 'ask') return;
      if (i < 0 || i >= cur.a.length) return;
      sel = i;
      Quiz.confirm();
    },

    /** Enter: locks the answer in, then on a second press closes the card. */
    confirm: function () {
      if (!cur) return false;
      if (phase === 'ask') {
        phase = 'reveal';
        held = 0;
        if (sel === cur.c) stats.right++;
        return true;
      }
      if (held < 0.35) return true;              // no accidental double tap
      const correct = sel === cur.c;
      const cb = done;
      cur = null; done = null;
      cooldown = COOLDOWN;
      if (cb) cb(correct);
      return true;
    },

    score: function () { return { asked: stats.asked, right: stats.right }; },
    reset: function () { stats = { asked: 0, right: 0 }; cooldown = 0; },

    draw: function (ctx, W, H, UNIT) {
      if (!cur) return;
      const pad = 14 * UNIT;
      const cardW = Math.min(W - 16 * UNIT, 300 * UNIT);
      const x = (W - cardW) / 2;

      ctx.save();
      ctx.fillStyle = 'rgba(2, 8, 7, 0.88)';
      ctx.fillRect(0, 0, W, H);

      // measure first so the card is exactly as tall as its content
      ctx.font = 'bold ' + Math.round(8 * UNIT) + 'px "Press Start 2P", monospace';
      const qLines = wrap(ctx, cur.q, cardW - pad * 2);
      ctx.font = 'bold ' + Math.round(7 * UNIT) + 'px "Press Start 2P", monospace';
      const opt = cur.a.map(function (o, i) {
        return wrap(ctx, (i + 1) + '. ' + o, cardW - pad * 2 - 6 * UNIT);
      });
      const whyLines = phase === 'reveal' ? wrap(ctx, cur.why, cardW - pad * 2) : [];

      const lh = 11 * UNIT, olh = 10 * UNIT;
      let bodyH = 20 * UNIT + qLines.length * lh + 6 * UNIT;
      opt.forEach(function (l) { bodyH += l.length * olh + 7 * UNIT; });
      bodyH += 14 * UNIT + whyLines.length * olh + (phase === 'reveal' ? 10 * UNIT : 0);
      const cardH = bodyH + pad * 2;
      const y = Math.max(8 * UNIT, (H - cardH) / 2);

      ctx.fillStyle = COLORS.panel;
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = COLORS.edge;
      ctx.lineWidth = 2 * UNIT;
      ctx.strokeRect(x + UNIT, y + UNIT, cardW - 2 * UNIT, cardH - 2 * UNIT);

      let cy = y + pad + 8 * UNIT;
      ctx.textAlign = 'left';
      ctx.font = 'bold ' + Math.round(6 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = COLORS.dim;
      ctx.fillText('DIGITAL FORENSICS / ' + cur.t, x + pad, cy);
      ctx.textAlign = 'right';
      ctx.fillText('RIGHT = POWER-UP', x + cardW - pad, cy);
      ctx.textAlign = 'left';
      cy += 14 * UNIT;

      ctx.font = 'bold ' + Math.round(8 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffffff';
      qLines.forEach(function (l) { ctx.fillText(l, x + pad, cy); cy += lh; });
      cy += 6 * UNIT;

      ctx.font = 'bold ' + Math.round(7 * UNIT) + 'px "Press Start 2P", monospace';
      opt.forEach(function (lines, i) {
        let fill = COLORS.dim;
        if (phase === 'ask') fill = i === sel ? COLORS.pick : COLORS.dim;
        else if (i === cur.c) fill = COLORS.right;
        else if (i === sel) fill = COLORS.wrong;
        if (phase === 'ask' && i === sel) {
          ctx.fillStyle = 'rgba(255, 212, 71, 0.14)';
          ctx.fillRect(x + pad - 4 * UNIT, cy - 8 * UNIT,
            cardW - pad * 2 + 8 * UNIT, lines.length * olh + 4 * UNIT);
        }
        ctx.fillStyle = fill;
        lines.forEach(function (l, k) {
          ctx.fillText(k ? '   ' + l : l, x + pad + 6 * UNIT, cy);
          cy += olh;
        });
        cy += 7 * UNIT;
      });

      cy += 6 * UNIT;
      if (phase === 'reveal') {
        ctx.fillStyle = sel === cur.c ? COLORS.right : COLORS.wrong;
        ctx.font = 'bold ' + Math.round(8 * UNIT) + 'px "Press Start 2P", monospace';
        ctx.fillText(sel === cur.c ? 'CORRECT - POWER-UP!'
                                   : 'WRONG - SETBACK', x + pad, cy);
        cy += 12 * UNIT;
        ctx.font = 'bold ' + Math.round(7 * UNIT) + 'px "Press Start 2P", monospace';
        ctx.fillStyle = COLORS.dim;
        whyLines.forEach(function (l) { ctx.fillText(l, x + pad, cy); cy += olh; });
        cy += 4 * UNIT;
      }

      ctx.textAlign = 'center';
      ctx.font = 'bold ' + Math.round(6 * UNIT) + 'px "Press Start 2P", monospace';
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(phase === 'ask' ? 'UP / DOWN OR 1-4     ENTER TO ANSWER'
                                   : 'ENTER TO CARRY ON',
        x + cardW / 2, y + cardH - pad + 2 * UNIT);
      ctx.restore();
    }
  };

  Quiz.count = BANK.length;
  global.Quiz = Quiz;
})(window);
