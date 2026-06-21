const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'
];

let songs = [];
let authenticated = false;

function noteToMidi(noteStr) {
  const match = noteStr.match(/^([A-G]#?)(\d)$/);
  if (!match) return null;
  const [, note, octave] = match;
  const idx = NOTES.indexOf(note);
  if (idx === -1) return null;
  return idx + (parseInt(octave) + 1) * 12;
}

function midiToNote(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const idx = midi % 12;
  return NOTES[idx] + octave;
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  populateNoteSelectors();
  populateKeySelectors();
  checkAuth();

  document.getElementById('pin-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAuth();
  });
  document.getElementById('pin-confirm').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAuth();
  });
});

function populateNoteSelectors() {
  const noteSelects = document.querySelectorAll(
    '#song-low-note, #song-high-note, #rec-low-note, #rec-high-note, #edit-low-note, #edit-high-note'
  );
  noteSelects.forEach(sel => {
    const first = sel.querySelector('option');
    sel.innerHTML = '';
    if (first) sel.appendChild(first);
    NOTES.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      sel.appendChild(opt);
    });
  });
}

function populateKeySelectors() {
  const keySelects = document.querySelectorAll('#song-key, #rec-key, #edit-key');
  keySelects.forEach(sel => {
    const first = sel.querySelector('option');
    sel.innerHTML = '';
    if (first) sel.appendChild(first);
    KEYS.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      sel.appendChild(opt);
    });
  });
}

// --- Auth ---
async function checkAuth() {
  const res = await fetch('/api/auth/status');
  const data = await res.json();
  const subtitle = document.getElementById('auth-subtitle');
  const confirm = document.getElementById('pin-confirm');
  const btn = document.getElementById('auth-btn');

  if (!data.pinSet) {
    subtitle.textContent = 'Configura tu PIN de acceso';
    confirm.style.display = '';
    btn.textContent = 'Crear PIN';
  } else {
    subtitle.textContent = 'Introduce tu PIN para acceder';
    confirm.style.display = 'none';
    btn.textContent = 'Acceder';
  }
}

async function handleAuth() {
  const pin = document.getElementById('pin-input').value;
  const confirm = document.getElementById('pin-confirm');
  const error = document.getElementById('auth-error');
  error.textContent = '';

  if (confirm.style.display !== 'none') {
    if (pin.length < 4) {
      error.textContent = 'El PIN debe tener al menos 4 caracteres';
      return;
    }
    if (pin !== confirm.value) {
      error.textContent = 'Los PINs no coinciden';
      return;
    }
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success) {
      enterApp();
    } else {
      error.textContent = data.error;
    }
  } else {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (res.ok) {
      enterApp();
    } else {
      error.textContent = 'PIN incorrecto';
      document.getElementById('pin-input').classList.add('shake');
      setTimeout(() => document.getElementById('pin-input').classList.remove('shake'), 500);
    }
  }
}

function enterApp() {
  authenticated = true;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = '';
  loadSongs();
}

// --- Navigation ---
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  document.getElementById('section-' + name).style.display = '';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-section="${name}"]`).classList.add('active');

  if (name === 'dashboard') refreshDashboard();
  if (name === 'songs') renderSongs();
  if (name === 'profile') loadProfile();
}

// --- Songs ---
async function loadSongs() {
  const res = await fetch('/api/songs');
  songs = await res.json();
  refreshDashboard();
}

function renderSongs() {
  const container = document.getElementById('songs-list');
  const noSongs = document.getElementById('no-songs');
  const searchTerm = (document.getElementById('search-songs').value || '').toLowerCase();

  const filtered = songs.filter(s =>
    s.title.toLowerCase().includes(searchTerm) ||
    s.artist.toLowerCase().includes(searchTerm)
  );

  if (songs.length === 0) {
    container.style.display = 'none';
    noSongs.style.display = '';
    return;
  }

  noSongs.style.display = 'none';
  container.style.display = '';

  container.innerHTML = filtered.map(song => {
    const shiftLabel = song.semitone_shift === 0 ? 'Original'
      : song.semitone_shift > 0 ? `+${song.semitone_shift} st` : `${song.semitone_shift} st`;
    return `
      <div class="song-card">
        <div class="song-info">
          <h4>${esc(song.title)}</h4>
          <div class="song-artist">${esc(song.artist)}</div>
          <div class="song-meta">
            <span class="song-tag">Tono: ${esc(song.original_key)}</span>
            <span class="song-tag">Rango: ${esc(song.lowest_note)} - ${esc(song.highest_note)}</span>
            <span class="song-tag">${shiftLabel}</span>
          </div>
        </div>
        <div class="song-actions">
          <button class="btn-icon" onclick="editSong(${song.id})" title="Editar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon danger" onclick="deleteSong(${song.id})" title="Eliminar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function filterSongs() {
  renderSongs();
}

async function addSong(e) {
  e.preventDefault();
  const lowNote = document.getElementById('song-low-note').value;
  const lowOctave = document.getElementById('song-low-octave').value;
  const highNote = document.getElementById('song-high-note').value;
  const highOctave = document.getElementById('song-high-octave').value;

  if (!lowNote || !lowOctave || !highNote || !highOctave) {
    showToast('Completa todas las notas', 'error');
    return;
  }

  const lowest = lowNote + lowOctave;
  const highest = highNote + highOctave;

  if (noteToMidi(lowest) >= noteToMidi(highest)) {
    showToast('La nota grave debe ser mas baja que la aguda', 'error');
    return;
  }

  const body = {
    title: document.getElementById('song-title').value,
    artist: document.getElementById('song-artist').value,
    original_key: document.getElementById('song-key').value,
    lowest_note: lowest,
    highest_note: highest,
    semitone_shift: parseInt(document.getElementById('song-semitones').value) || 0
  };

  const res = await fetch('/api/songs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    const song = await res.json();
    songs.unshift(song);
    showToast('Cancion registrada correctamente', 'success');
    document.getElementById('add-song-form').reset();
    document.getElementById('song-semitones').value = '0';
  } else {
    const data = await res.json();
    showToast(data.error || 'Error al registrar', 'error');
  }
}

async function deleteSong(id) {
  if (!confirm('¿Eliminar esta cancion?')) return;
  await fetch(`/api/songs/${id}`, { method: 'DELETE' });
  songs = songs.filter(s => s.id !== id);
  renderSongs();
  showToast('Cancion eliminada', 'success');
}

function editSong(id) {
  const song = songs.find(s => s.id === id);
  if (!song) return;

  document.getElementById('edit-song-id').value = song.id;
  document.getElementById('edit-title').value = song.title;
  document.getElementById('edit-artist').value = song.artist;
  document.getElementById('edit-key').value = song.original_key;
  document.getElementById('edit-semitones').value = song.semitone_shift;

  const lowMatch = song.lowest_note.match(/^([A-G]#?)(\d)$/);
  const highMatch = song.highest_note.match(/^([A-G]#?)(\d)$/);
  if (lowMatch) {
    document.getElementById('edit-low-note').value = lowMatch[1];
    document.getElementById('edit-low-octave').value = lowMatch[2];
  }
  if (highMatch) {
    document.getElementById('edit-high-note').value = highMatch[1];
    document.getElementById('edit-high-octave').value = highMatch[2];
  }

  document.getElementById('edit-modal').style.display = '';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
}

async function updateSong(e) {
  e.preventDefault();
  const id = document.getElementById('edit-song-id').value;
  const lowNote = document.getElementById('edit-low-note').value;
  const lowOctave = document.getElementById('edit-low-octave').value;
  const highNote = document.getElementById('edit-high-note').value;
  const highOctave = document.getElementById('edit-high-octave').value;

  const body = {
    title: document.getElementById('edit-title').value,
    artist: document.getElementById('edit-artist').value,
    original_key: document.getElementById('edit-key').value,
    lowest_note: lowNote + lowOctave,
    highest_note: highNote + highOctave,
    semitone_shift: parseInt(document.getElementById('edit-semitones').value) || 0
  };

  const res = await fetch(`/api/songs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.ok) {
    const updated = await res.json();
    const idx = songs.findIndex(s => s.id === updated.id);
    if (idx >= 0) songs[idx] = updated;
    closeEditModal();
    renderSongs();
    showToast('Cancion actualizada', 'success');
  } else {
    const data = await res.json();
    showToast(data.error || 'Error al actualizar', 'error');
  }
}

function adjustSemitone(delta) {
  const input = document.getElementById('song-semitones');
  let val = parseInt(input.value) || 0;
  val = Math.max(-12, Math.min(12, val + delta));
  input.value = val;
}

function adjustEditSemitone(delta) {
  const input = document.getElementById('edit-semitones');
  let val = parseInt(input.value) || 0;
  val = Math.max(-12, Math.min(12, val + delta));
  input.value = val;
}

// --- Recommendation ---
async function getRecommendation(e) {
  e.preventDefault();
  const lowNote = document.getElementById('rec-low-note').value;
  const lowOctave = document.getElementById('rec-low-octave').value;
  const highNote = document.getElementById('rec-high-note').value;
  const highOctave = document.getElementById('rec-high-octave').value;

  if (!lowNote || !lowOctave || !highNote || !highOctave) {
    showToast('Completa todas las notas', 'error');
    return;
  }

  const lowest = lowNote + lowOctave;
  const highest = highNote + highOctave;

  if (noteToMidi(lowest) >= noteToMidi(highest)) {
    showToast('La nota grave debe ser mas baja que la aguda', 'error');
    return;
  }

  const body = {
    lowest_note: lowest,
    highest_note: highest,
    original_key: document.getElementById('rec-key').value || undefined
  };

  const res = await fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  const container = document.getElementById('recommendation-result');
  const content = document.getElementById('result-content');

  if (!data.recommendation) {
    content.innerHTML = `<div class="empty-state"><p>${data.message}</p></div>`;
    container.style.display = '';
    return;
  }

  const r = data.recommendation;
  const shiftDisplay = r.semitones === 0 ? '0' : (r.semitones > 0 ? `+${r.semitones}` : `${r.semitones}`);

  content.innerHTML = `
    <div class="result-main">
      <div class="result-shift">${shiftDisplay}</div>
      <div>
        <div class="result-direction">${r.direction}</div>
        <div class="result-detail">${r.new_key ? `Nueva tonalidad: ${r.new_key}` : ''}</div>
      </div>
    </div>
    <div class="result-grid">
      <div class="result-item">
        <div class="result-item-label">Rango original</div>
        <div class="result-item-value">${lowest} - ${highest}</div>
      </div>
      <div class="result-item">
        <div class="result-item-label">Rango transpuesto</div>
        <div class="result-item-value">${r.transposed_range.low} - ${r.transposed_range.high}</div>
      </div>
      <div class="result-item">
        <div class="result-item-label">Tu nota mas grave</div>
        <div class="result-item-value">${r.vocal_range.low}</div>
      </div>
      <div class="result-item">
        <div class="result-item-label">Tu nota mas aguda</div>
        <div class="result-item-value">${r.vocal_range.high}</div>
      </div>
    </div>
    <div class="result-fit ${r.fits_range ? 'fits' : 'no-fit'}">
      ${r.fits_range
        ? 'La cancion encaja dentro de tu rango vocal estimado'
        : 'La cancion podria quedar ligeramente fuera de tu rango comodo'}
    </div>
  `;
  container.style.display = '';
}

// --- Dashboard ---
async function refreshDashboard() {
  document.getElementById('stat-songs').textContent = songs.length;

  const res = await fetch('/api/vocal-range');
  const range = await res.json();

  if (range.estimated) {
    document.getElementById('stat-range').textContent = `${range.lowest} - ${range.highest}`;
    document.getElementById('stat-semitones').textContent = range.range + ' st';
    renderPiano('dashboard-piano', range.lowestMidi, range.highestMidi);
    document.getElementById('dashboard-range-label').textContent =
      `${range.lowest} a ${range.highest} (${range.range} semitonos)`;
  } else {
    document.getElementById('stat-range').textContent = '--';
    document.getElementById('stat-semitones').textContent = '--';
    document.getElementById('dashboard-piano').innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Registra canciones para ver tu rango</p>';
    document.getElementById('dashboard-range-label').textContent = '';
  }

  const recentList = document.getElementById('recent-songs-list');
  const recent = songs.slice(0, 5);
  if (recent.length === 0) {
    recentList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:1rem">Sin canciones registradas</p>';
  } else {
    recentList.innerHTML = recent.map(s => {
      const shift = s.semitone_shift === 0 ? 'Original' : (s.semitone_shift > 0 ? `+${s.semitone_shift} st` : `${s.semitone_shift} st`);
      return `
        <div class="song-mini">
          <div class="song-mini-info">
            <span class="song-mini-title">${esc(s.title)}</span>
            <span class="song-mini-artist">${esc(s.artist)}</span>
          </div>
          <span class="song-mini-shift">${shift}</span>
        </div>
      `;
    }).join('');
  }
}

// --- Profile ---
async function loadProfile() {
  const res = await fetch('/api/vocal-range');
  const range = await res.json();

  if (!range.estimated) {
    document.getElementById('profile-content').style.display = 'none';
    document.getElementById('profile-empty').style.display = '';
    return;
  }

  document.getElementById('profile-content').style.display = '';
  document.getElementById('profile-empty').style.display = 'none';

  document.getElementById('profile-low').textContent = range.lowest;
  document.getElementById('profile-high').textContent = range.highest;
  document.getElementById('profile-range-semitones').textContent = range.range + ' semitonos';
  document.getElementById('profile-song-count').textContent = range.songCount;

  renderPiano('profile-piano', range.lowestMidi, range.highestMidi);

  const dist = {};
  songs.forEach(s => {
    const key = s.original_key;
    dist[key] = (dist[key] || 0) + 1;
  });

  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

  const distContainer = document.getElementById('songs-distribution');
  if (sorted.length === 0) {
    distContainer.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Sin datos</p>';
  } else {
    distContainer.innerHTML = sorted.map(([key, count]) => `
      <div class="dist-bar">
        <span class="dist-bar-label">${esc(key)}</span>
        <div class="dist-bar-track">
          <div class="dist-bar-fill" style="width:${(count / maxCount * 100).toFixed(0)}%"></div>
        </div>
        <span class="dist-bar-count">${count}</span>
      </div>
    `).join('');
  }
}

// --- Piano visualization ---
function renderPiano(containerId, lowMidi, highMidi) {
  const container = document.getElementById(containerId);
  const startMidi = Math.max(24, lowMidi - 5);
  const endMidi = Math.min(96, highMidi + 5);

  let html = '';
  for (let midi = startMidi; midi <= endMidi; midi++) {
    const noteIdx = midi % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(noteIdx);
    const inRange = midi >= lowMidi && midi <= highMidi;
    const isEdge = midi === lowMidi || midi === highMidi;

    let cls = 'piano-key';
    if (isBlack) cls += ' black';
    if (inRange) cls += ' in-range';
    if (isEdge) cls += ' low-note';

    const note = midiToNote(midi);
    html += `<div class="${cls}" title="${note}"></div>`;
  }
  container.innerHTML = html;
}

// --- Utilities ---
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + (type || '');
  setTimeout(() => toast.className = 'toast', 3000);
}
