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
      original_key TEXT DEFAULT '',
      semitone_shift INTEGER NOT NULL DEFAULT 0,
      octave_down INTEGER NOT NULL DEFAULT 0,
      deezer_id INTEGER,
      album_cover TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  try { await db.execute('ALTER TABLE songs ADD COLUMN octave_down INTEGER NOT NULL DEFAULT 0'); } catch {}
  dbReady = true;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function effectiveShift(song) {
  return song.semitone_shift + (song.octave_down ? -12 : 0);
}

const FLATS_TO_SHARPS = { 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B' };

function keyToIndex(key) {
  let base = key.replace(/m$/, '');
  if (FLATS_TO_SHARPS[base]) base = FLATS_TO_SHARPS[base];
  return NOTES.indexOf(base);
}

function indexToKey(idx) {
  return NOTES[((idx % 12) + 12) % 12];
}

function circularDistance(a, b) {
  const diff = Math.abs(a - b);
  return Math.min(diff, 12 - diff);
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

// --- Deezer search proxy ---

app.get('/api/search', async (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) return res.json({ data: [] });
  try {
    const response = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=6`);
    const data = await response.json();
    const results = (data.data || []).map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artist?.name || '',
      album: track.album?.title || '',
      cover: track.album?.cover_small || '',
      coverMedium: track.album?.cover_medium || ''
    }));
    res.json({ data: results });
  } catch {
    res.json({ data: [] });
  }
});

// --- Songs ---

app.get('/api/songs', async (req, res) => {
  try {
    await initDb();
    const result = await db.execute('SELECT * FROM songs ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error cargando canciones: ' + err.message });
  }
});

app.post('/api/songs', async (req, res) => {
  try {
    await initDb();
    const { title, artist, original_key, semitone_shift, octave_down, deezer_id, album_cover } = req.body || {};
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }
    const shift = parseInt(semitone_shift) || 0;
    const octDown = octave_down ? 1 : 0;
    const result = await db.execute({
      sql: 'INSERT INTO songs (title, artist, original_key, semitone_shift, octave_down, deezer_id, album_cover) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [title, artist, original_key || '', shift, octDown, deezer_id || null, album_cover || '']
    });
    const song = await db.execute({ sql: 'SELECT * FROM songs WHERE id = ?', args: [Number(result.lastInsertRowid)] });
    res.json(song.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error guardando cancion: ' + err.message });
  }
});

app.delete('/api/songs/:id', async (req, res) => {
  try {
    await initDb();
    await db.execute({ sql: 'DELETE FROM songs WHERE id = ?', args: [parseInt(req.params.id)] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Error eliminando: ' + err.message });
  }
});

app.put('/api/songs/:id', async (req, res) => {
  try {
    await initDb();
    const { title, artist, original_key, semitone_shift, octave_down } = req.body || {};
    if (!title || !artist) {
      return res.status(400).json({ error: 'Title and artist are required' });
    }
    const shift = parseInt(semitone_shift) || 0;
    const octDown = octave_down ? 1 : 0;
    const id = parseInt(req.params.id);
    await db.execute({
      sql: 'UPDATE songs SET title=?, artist=?, original_key=?, semitone_shift=?, octave_down=? WHERE id=?',
      args: [title, artist, original_key || '', shift, octDown, id]
    });
    const song = await db.execute({ sql: 'SELECT * FROM songs WHERE id = ?', args: [id] });
    res.json(song.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando: ' + err.message });
  }
});

// --- Vocal profile ---

app.get('/api/vocal-profile', async (req, res) => {
  await initDb();
  const result = await db.execute('SELECT * FROM songs');
  const songs = result.rows;

  if (songs.length === 0) {
    return res.json({ estimated: false });
  }

  const songsWithKeys = songs.filter(s => s.original_key && keyToIndex(s.original_key) !== -1);
  const effectiveKeys = songsWithKeys.map(s => {
    const ki = keyToIndex(s.original_key);
    return ((ki + effectiveShift(s)) % 12 + 12) % 12;
  });

  const effShifts = songs.map(s => effectiveShift(s));
  const avgShift = effShifts.reduce((a, b) => a + b, 0) / effShifts.length;

  const keyDistribution = {};
  effectiveKeys.forEach(k => {
    const name = NOTES[k];
    keyDistribution[name] = (keyDistribution[name] || 0) + 1;
  });

  const originalKeyDist = {};
  songsWithKeys.forEach(s => {
    originalKeyDist[s.original_key] = (originalKeyDist[s.original_key] || 0) + 1;
  });

  const shiftDistribution = {};
  effShifts.forEach(s => {
    const label = s === 0 ? '0' : (s > 0 ? `+${s}` : `${s}`);
    shiftDistribution[label] = (shiftDistribution[label] || 0) + 1;
  });

  res.json({
    estimated: true,
    songCount: songs.length,
    songsWithKeys: songsWithKeys.length,
    averageShift: Math.round(avgShift * 10) / 10,
    effectiveKeyDistribution: keyDistribution,
    originalKeyDistribution: originalKeyDist,
    shiftDistribution
  });
});

// --- Recommendation ---

app.post('/api/recommend', async (req, res) => {
  await initDb();
  const { original_key } = req.body;

  const result = await db.execute('SELECT * FROM songs');
  const songs = result.rows;

  if (songs.length === 0) {
    return res.json({ recommendation: null, message: 'Registra canciones primero para obtener recomendaciones' });
  }

  const effShifts = songs.map(s => effectiveShift(s));
  const avgShift = Math.round(effShifts.reduce((a, b) => a + b, 0) / effShifts.length);

  if (!original_key || keyToIndex(original_key) === -1) {
    return res.json({
      recommendation: {
        semitones: avgShift,
        confidence: 'low',
        method: 'average',
        message: `Sin tonalidad, se usa tu ajuste medio: ${avgShift >= 0 ? '+' : ''}${avgShift} semitonos`,
        songCount: songs.length
      }
    });
  }

  const songKeyIdx = keyToIndex(original_key);
  const isMinor = original_key.endsWith('m');
  const songsWithKeys = songs.filter(s => s.original_key && keyToIndex(s.original_key) !== -1);

  if (songsWithKeys.length === 0) {
    return res.json({
      recommendation: {
        semitones: avgShift,
        confidence: 'low',
        method: 'average',
        message: `Sin datos de tonalidad en tus canciones, se usa tu ajuste medio: ${avgShift >= 0 ? '+' : ''}${avgShift} semitonos`,
        songCount: songs.length
      }
    });
  }

  const effectiveKeys = songsWithKeys.map(s => {
    const ki = keyToIndex(s.original_key);
    return ((ki + effectiveShift(s)) % 12 + 12) % 12;
  });

  let bestShift = 0;
  let bestScore = Infinity;

  for (let shift = -6; shift <= 6; shift++) {
    const newKey = ((songKeyIdx + shift) % 12 + 12) % 12;

    let score = 0;
    for (const ek of effectiveKeys) {
      score += circularDistance(newKey, ek);
    }
    score += Math.abs(shift) * 0.4;

    if (score < bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }

  const newKeyIdx = ((songKeyIdx + bestShift) % 12 + 12) % 12;
  const newKeyName = NOTES[newKeyIdx] + (isMinor ? 'm' : '');

  let direction;
  if (bestShift === 0) direction = 'Sin cambio';
  else if (bestShift > 0) direction = `Subir ${bestShift} semitono${bestShift > 1 ? 's' : ''}`;
  else direction = `Bajar ${Math.abs(bestShift)} semitono${Math.abs(bestShift) > 1 ? 's' : ''}`;

  res.json({
    recommendation: {
      semitones: bestShift,
      direction,
      original_key: original_key,
      new_key: newKeyName,
      confidence: songsWithKeys.length >= 3 ? 'high' : 'medium',
      method: 'key-pattern',
      songCount: songs.length,
      songsAnalyzed: songsWithKeys.length
    }
  });
});

if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.listen(PORT, () => console.log(`Karaoke Transposition app running on http://localhost:${PORT}`));
}

module.exports = app;
