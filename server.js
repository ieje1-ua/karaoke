const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    original_key TEXT NOT NULL,
    lowest_note TEXT NOT NULL,
    highest_note TEXT NOT NULL,
    semitone_shift INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteToMidi(noteStr) {
  const match = noteStr.match(/^([A-G]#?)(\d)$/);
  if (!match) return null;
  const [, note, octave] = match;
  const noteIndex = NOTES.indexOf(note);
  if (noteIndex === -1) return null;
  return noteIndex + (parseInt(octave) + 1) * 12;
}

function midiToNote(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return NOTES[noteIndex] + octave;
}

function transposeNote(noteStr, semitones) {
  const midi = noteToMidi(noteStr);
  if (midi === null) return noteStr;
  return midiToNote(midi + semitones);
}

// --- Auth endpoints ---

app.get('/api/auth/status', (req, res) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('pin_hash');
  res.json({ pinSet: !!row });
});

app.post('/api/auth/setup', (req, res) => {
  const existing = db.prepare('SELECT value FROM config WHERE key = ?').get('pin_hash');
  if (existing) {
    return res.status(400).json({ error: 'PIN already configured' });
  }
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 characters' });
  }
  const hash = bcrypt.hashSync(pin, 10);
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('pin_hash', hash);
  res.json({ success: true });
});

app.post('/api/auth/verify', (req, res) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('pin_hash');
  if (!row) {
    return res.status(400).json({ error: 'No PIN configured' });
  }
  const { pin } = req.body;
  if (bcrypt.compareSync(pin, row.value)) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Incorrect PIN' });
  }
});

// --- Songs endpoints ---

app.get('/api/songs', (req, res) => {
  const songs = db.prepare('SELECT * FROM songs ORDER BY created_at DESC').all();
  res.json(songs);
});

app.post('/api/songs', (req, res) => {
  const { title, artist, original_key, lowest_note, highest_note, semitone_shift } = req.body;
  if (!title || !artist || !original_key || !lowest_note || !highest_note) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (noteToMidi(lowest_note) === null || noteToMidi(highest_note) === null) {
    return res.status(400).json({ error: 'Invalid note format. Use format like C4, F#3, etc.' });
  }
  const shift = parseInt(semitone_shift) || 0;
  const stmt = db.prepare(
    'INSERT INTO songs (title, artist, original_key, lowest_note, highest_note, semitone_shift) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(title, artist, original_key, lowest_note, highest_note, shift);
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(result.lastInsertRowid);
  res.json(song);
});

app.delete('/api/songs/:id', (req, res) => {
  db.prepare('DELETE FROM songs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.put('/api/songs/:id', (req, res) => {
  const { title, artist, original_key, lowest_note, highest_note, semitone_shift } = req.body;
  if (!title || !artist || !original_key || !lowest_note || !highest_note) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (noteToMidi(lowest_note) === null || noteToMidi(highest_note) === null) {
    return res.status(400).json({ error: 'Invalid note format' });
  }
  const shift = parseInt(semitone_shift) || 0;
  db.prepare(
    'UPDATE songs SET title=?, artist=?, original_key=?, lowest_note=?, highest_note=?, semitone_shift=? WHERE id=?'
  ).run(title, artist, original_key, lowest_note, highest_note, shift, req.params.id);
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  res.json(song);
});

// --- Vocal range analysis ---

app.get('/api/vocal-range', (req, res) => {
  const songs = db.prepare('SELECT * FROM songs').all();
  if (songs.length === 0) {
    return res.json({ estimated: false, message: 'Add songs to estimate your vocal range' });
  }

  let lowestMidi = Infinity;
  let highestMidi = -Infinity;

  for (const song of songs) {
    const transposedLow = noteToMidi(song.lowest_note) + song.semitone_shift;
    const transposedHigh = noteToMidi(song.highest_note) + song.semitone_shift;
    if (transposedLow < lowestMidi) lowestMidi = transposedLow;
    if (transposedHigh > highestMidi) highestMidi = transposedHigh;
  }

  res.json({
    estimated: true,
    lowest: midiToNote(lowestMidi),
    highest: midiToNote(highestMidi),
    lowestMidi,
    highestMidi,
    range: highestMidi - lowestMidi,
    songCount: songs.length
  });
});

// --- Transposition recommendation ---

app.post('/api/recommend', (req, res) => {
  const { lowest_note, highest_note } = req.body;
  if (!lowest_note || !highest_note) {
    return res.status(400).json({ error: 'Provide lowest and highest notes of the song' });
  }

  const songLow = noteToMidi(lowest_note);
  const songHigh = noteToMidi(highest_note);
  if (songLow === null || songHigh === null) {
    return res.status(400).json({ error: 'Invalid note format' });
  }

  const songs = db.prepare('SELECT * FROM songs').all();
  if (songs.length === 0) {
    return res.json({ recommendation: null, message: 'Add songs first to get recommendations' });
  }

  let vocalLow = Infinity;
  let vocalHigh = -Infinity;
  for (const song of songs) {
    const tLow = noteToMidi(song.lowest_note) + song.semitone_shift;
    const tHigh = noteToMidi(song.highest_note) + song.semitone_shift;
    if (tLow < vocalLow) vocalLow = tLow;
    if (tHigh > vocalHigh) vocalHigh = tHigh;
  }

  let bestShift = 0;
  let bestScore = Infinity;

  for (let shift = -12; shift <= 12; shift++) {
    const newLow = songLow + shift;
    const newHigh = songHigh + shift;

    let score = 0;
    if (newLow < vocalLow) score += (vocalLow - newLow) * 3;
    if (newHigh > vocalHigh) score += (newHigh - vocalHigh) * 3;

    score += Math.abs(shift) * 0.5;

    const vocalCenter = (vocalLow + vocalHigh) / 2;
    const songCenter = (newLow + newHigh) / 2;
    score += Math.abs(songCenter - vocalCenter) * 0.3;

    if (score < bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  const transposedLow = midiToNote(songLow + bestShift);
  const transposedHigh = midiToNote(songHigh + bestShift);

  let direction;
  if (bestShift === 0) direction = 'No change needed';
  else if (bestShift > 0) direction = `Raise ${bestShift} semitone${bestShift > 1 ? 's' : ''}`;
  else direction = `Lower ${Math.abs(bestShift)} semitone${Math.abs(bestShift) > 1 ? 's' : ''}`;

  const newKey = req.body.original_key
    ? transposeNote(req.body.original_key.replace(/m$/, ''), bestShift) + (req.body.original_key.endsWith('m') ? 'm' : '')
    : null;

  res.json({
    recommendation: {
      semitones: bestShift,
      direction,
      transposed_range: { low: transposedLow, high: transposedHigh },
      new_key: newKey,
      vocal_range: { low: midiToNote(vocalLow), high: midiToNote(vocalHigh) },
      fits_range: (songLow + bestShift) >= vocalLow && (songHigh + bestShift) <= vocalHigh
    }
  });
});

app.listen(PORT, () => {
  console.log(`Karaoke Transposition app running on http://localhost:${PORT}`);
});
