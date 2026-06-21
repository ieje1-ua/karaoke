const express = require('express');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
app.use(express.json());

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:data.db',
  authToken: process.env.TURSO_AUTH_TOKEN
});

let dbReady = false;

async function initDb() {
  if (dbReady) return;
  await db.executeMultiple(`
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
  dbReady = true;
}

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

// --- Auth ---

app.get('/api/auth/status', async (req, res) => {
  await initDb();
  const result = await db.execute({ sql: 'SELECT value FROM config WHERE key = ?', args: ['pin_hash'] });
  res.json({ pinSet: result.rows.length > 0 });
});

app.post('/api/auth/setup', async (req, res) => {
  await initDb();
  const existing = await db.execute({ sql: 'SELECT value FROM config WHERE key = ?', args: ['pin_hash'] });
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'PIN already configured' });
  }
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 characters' });
  }
  const hash = bcrypt.hashSync(pin, 10);
  await db.execute({ sql: 'INSERT INTO config (key, value) VALUES (?, ?)', args: ['pin_hash', hash] });
  res.json({ success: true });
});

app.post('/api/auth/verify', async (req, res) => {
  await initDb();
  const result = await db.execute({ sql: 'SELECT value FROM config WHERE key = ?', args: ['pin_hash'] });
  if (result.rows.length === 0) {
    return res.status(400).json({ error: 'No PIN configured' });
  }
  const { pin } = req.body;
  if (bcrypt.compareSync(pin, result.rows[0].value)) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Incorrect PIN' });
  }
});

// --- Songs ---

app.get('/api/songs', async (req, res) => {
  await initDb();
  const result = await db.execute('SELECT * FROM songs ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/songs', async (req, res) => {
  await initDb();
  const { title, artist, original_key, lowest_note, highest_note, semitone_shift } = req.body;
  if (!title || !artist || !original_key || !lowest_note || !highest_note) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (noteToMidi(lowest_note) === null || noteToMidi(highest_note) === null) {
    return res.status(400).json({ error: 'Invalid note format. Use format like C4, F#3, etc.' });
  }
  const shift = parseInt(semitone_shift) || 0;
  const result = await db.execute({
    sql: 'INSERT INTO songs (title, artist, original_key, lowest_note, highest_note, semitone_shift) VALUES (?, ?, ?, ?, ?, ?)',
    args: [title, artist, original_key, lowest_note, highest_note, shift]
  });
  const song = await db.execute({ sql: 'SELECT * FROM songs WHERE id = ?', args: [Number(result.lastInsertRowid)] });
  res.json(song.rows[0]);
});

app.delete('/api/songs/:id', async (req, res) => {
  await initDb();
  await db.execute({ sql: 'DELETE FROM songs WHERE id = ?', args: [parseInt(req.params.id)] });
  res.json({ success: true });
});

app.put('/api/songs/:id', async (req, res) => {
  await initDb();
  const { title, artist, original_key, lowest_note, highest_note, semitone_shift } = req.body;
  if (!title || !artist || !original_key || !lowest_note || !highest_note) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (noteToMidi(lowest_note) === null || noteToMidi(highest_note) === null) {
    return res.status(400).json({ error: 'Invalid note format' });
  }
  const shift = parseInt(semitone_shift) || 0;
  const id = parseInt(req.params.id);
  await db.execute({
    sql: 'UPDATE songs SET title=?, artist=?, original_key=?, lowest_note=?, highest_note=?, semitone_shift=? WHERE id=?',
    args: [title, artist, original_key, lowest_note, highest_note, shift, id]
  });
  const song = await db.execute({ sql: 'SELECT * FROM songs WHERE id = ?', args: [id] });
  res.json(song.rows[0]);
});

// --- Vocal range ---

app.get('/api/vocal-range', async (req, res) => {
  await initDb();
  const result = await db.execute('SELECT * FROM songs');
  const songs = result.rows;
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

// --- Recommendation ---

app.post('/api/recommend', async (req, res) => {
  await initDb();
  const { lowest_note, highest_note } = req.body;
  if (!lowest_note || !highest_note) {
    return res.status(400).json({ error: 'Provide lowest and highest notes of the song' });
  }

  const songLow = noteToMidi(lowest_note);
  const songHigh = noteToMidi(highest_note);
  if (songLow === null || songHigh === null) {
    return res.status(400).json({ error: 'Invalid note format' });
  }

  const result = await db.execute('SELECT * FROM songs');
  const songs = result.rows;
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

if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.listen(PORT, () => console.log(`Karaoke Transposition app running on http://localhost:${PORT}`));
}

module.exports = app;
