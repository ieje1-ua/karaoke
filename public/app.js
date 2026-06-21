const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEYS = [
  '', 'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B',
  'Cm', 'C#m/Dbm', 'Dm', 'D#m/Ebm', 'Em', 'Fm', 'F#m/Gbm', 'Gm', 'G#m/Abm', 'Am', 'A#m/Bbm', 'Bm'
];
const KEY_VALUES = [
  '', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'A#m', 'Bm'
];

let songs = [];
let searchTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  populateKeySelectors();
  checkAuth();
  document.getElementById('pin-input').addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); });
  document.getElementById('pin-confirm').addEventListener('keydown', e => { if (e.key === 'Enter') handleAuth(); });
  document.addEventListener('click', e => {
    document.querySelectorAll('.search-results').forEach(r => {
      if (!r.parentElement.contains(e.target)) r.innerHTML = '';
    });
  });
});

function populateKeySelectors() {
  document.querySelectorAll('#add-key, #rec-key, #edit-key').forEach(sel => {
    sel.innerHTML = KEYS.map((label, i) =>
      label === '' ? '<option value="">-- Sin especificar --</option>' : `<option value="${KEY_VALUES[i]}">${label}</option>`
    ).join('');
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
    if (pin.length < 4) { error.textContent = 'El PIN debe tener al menos 4 caracteres'; return; }
    if (pin !== confirm.value) { error.textContent = 'Los PINs no coinciden'; return; }
    const res = await fetch('/api/auth/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();
    if (data.success) enterApp();
    else error.textContent = data.error;
  } else {
    const res = await fetch('/api/auth/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (res.ok) enterApp();
    else error.textContent = 'PIN incorrecto';
  }
}

function enterApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = '';
  loadSongs();
}

// --- Nav ---

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  document.getElementById('section-' + name).style.display = '';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-section="${name}"]`).classList.add('active');
  if (name === 'dashboard') refreshDashboard();
  if (name === 'songs') renderSongs();
  if (name === 'profile') loadProfile();
}

// --- Search ---

function onSearchInput(input, resultsId) {
  clearTimeout(searchTimer);
  const q = input.value.trim();
  const container = document.getElementById(resultsId);
  if (q.length < 2) { container.innerHTML = ''; return; }
  searchTimer = setTimeout(() => searchSongs(q, resultsId), 300);
}

async function searchSongs(q, resultsId) {
  const container = document.getElementById(resultsId);
  container.innerHTML = '<div class="search-loading">Buscando...</div>';
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      container.innerHTML = '<div class="search-empty">Sin resultados</div>';
      return;
    }
    const prefix = resultsId.startsWith('add') ? 'add' : 'rec';
    container.innerHTML = data.data.map(track => `
      <div class="search-item" onclick="selectTrack('${prefix}', ${JSON.stringify(track).replace(/'/g, "\\'").replace(/"/g, '&quot;')})">
        <img class="search-item-cover" src="${esc(track.cover)}" alt="" onerror="this.style.display='none'">
        <div class="search-item-info">
          <div class="search-item-title">${esc(track.title)}</div>
          <div class="search-item-artist">${esc(track.artist)}</div>
        </div>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div class="search-empty">Error de busqueda</div>';
  }
}

function selectTrack(prefix, track) {
  document.getElementById(prefix + '-search').style.display = 'none';
  document.getElementById(prefix + '-results').innerHTML = '';
  document.getElementById(prefix + '-selected').style.display = '';
  document.getElementById(prefix + '-cover').src = track.coverMedium || track.cover || '';
  document.getElementById(prefix + '-sel-title').textContent = track.title;
  document.getElementById(prefix + '-sel-artist').textContent = track.artist;
  if (prefix === 'add') {
    document.getElementById('add-deezer-id').value = track.id;
    document.getElementById('add-album-cover').value = track.coverMedium || track.cover || '';
  }
}

function clearAddSelection() {
  document.getElementById('add-search').style.display = '';
  document.getElementById('add-search').value = '';
  document.getElementById('add-selected').style.display = 'none';
  document.getElementById('add-deezer-id').value = '';
  document.getElementById('add-album-cover').value = '';
}

function clearRecSelection() {
  document.getElementById('rec-search').style.display = '';
  document.getElementById('rec-search').value = '';
  document.getElementById('rec-selected').style.display = 'none';
  document.getElementById('recommendation-result').style.display = 'none';
}

// --- Songs CRUD ---

async function loadSongs() {
  const res = await fetch('/api/songs');
  songs = await res.json();
  refreshDashboard();
}

function renderSongs() {
  const container = document.getElementById('songs-list');
  const noSongs = document.getElementById('no-songs');
  const term = (document.getElementById('filter-songs').value || '').toLowerCase();

  const filtered = songs.filter(s =>
    s.title.toLowerCase().includes(term) || s.artist.toLowerCase().includes(term)
  );

  if (songs.length === 0) {
    container.style.display = 'none';
    noSongs.style.display = '';
    return;
  }
  noSongs.style.display = 'none';
  container.style.display = '';

  container.innerHTML = filtered.map(song => {
    const shift = song.semitone_shift === 0 ? 'Original' : (song.semitone_shift > 0 ? `+${song.semitone_shift}` : `${song.semitone_shift}`);
    const coverHtml = song.album_cover
      ? `<img class="song-card-cover" src="${esc(song.album_cover)}" alt="" onerror="this.style.display='none'">`
      : '';
    return `
      <div class="song-card">
        ${coverHtml}
        <div class="song-info">
          <h4>${esc(song.title)}</h4>
          <div class="song-artist">${esc(song.artist)}</div>
          <div class="song-meta">
            ${song.original_key ? `<span class="song-tag">Tono: ${esc(song.original_key)}</span>` : ''}
            <span class="song-tag">${shift} st</span>
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

async function addSong() {
  const title = document.getElementById('add-sel-title').textContent;
  const artist = document.getElementById('add-sel-artist').textContent;
  if (!title || !artist) { showToast('Busca y selecciona una cancion primero', 'error'); return; }

  const body = {
    title,
    artist,
    original_key: document.getElementById('add-key').value,
    semitone_shift: parseInt(document.getElementById('add-semitones').value) || 0,
    deezer_id: document.getElementById('add-deezer-id').value || null,
    album_cover: document.getElementById('add-album-cover').value || ''
  };

  const res = await fetch('/api/songs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    const song = await res.json();
    songs.unshift(song);
    showToast('Cancion registrada', 'success');
    clearAddSelection();
    document.getElementById('add-key').value = '';
    document.getElementById('add-semitones').value = '0';
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
  document.getElementById('edit-key').value = song.original_key || '';
  document.getElementById('edit-semitones').value = song.semitone_shift;
  document.getElementById('edit-modal').style.display = '';
}

function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; }

async function updateSong(e) {
  e.preventDefault();
  const id = document.getElementById('edit-song-id').value;
  const body = {
    title: document.getElementById('edit-title').value,
    artist: document.getElementById('edit-artist').value,
    original_key: document.getElementById('edit-key').value,
    semitone_shift: parseInt(document.getElementById('edit-semitones').value) || 0
  };
  const res = await fetch(`/api/songs/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    const updated = await res.json();
    const idx = songs.findIndex(s => s.id === updated.id);
    if (idx >= 0) songs[idx] = updated;
    closeEditModal();
    renderSongs();
    showToast('Cancion actualizada', 'success');
  }
}

function adjustSemitone(inputId, delta) {
  const input = document.getElementById(inputId);
  let val = parseInt(input.value) || 0;
  input.value = Math.max(-12, Math.min(12, val + delta));
}

// --- Recommendation ---

async function getRecommendation() {
  const title = document.getElementById('rec-sel-title').textContent;
  if (!title) { showToast('Busca y selecciona una cancion', 'error'); return; }

  const body = { original_key: document.getElementById('rec-key').value || '' };
  const res = await fetch('/api/recommend', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  const container = document.getElementById('recommendation-result');
  const content = document.getElementById('result-content');

  if (!data.recommendation) {
    content.innerHTML = `<div class="empty-state" style="padding:1.5rem"><p>${data.message}</p></div>`;
    container.style.display = '';
    return;
  }

  const r = data.recommendation;
  const shiftDisplay = r.semitones === 0 ? '0' : (r.semitones > 0 ? `+${r.semitones}` : `${r.semitones}`);

  const confidenceLabel = { high: 'Alta', medium: 'Media', low: 'Baja' }[r.confidence] || r.confidence;
  const confidenceClass = r.confidence;

  content.innerHTML = `
    <div class="result-main">
      <div class="result-shift">${shiftDisplay}</div>
      <div>
        <div class="result-direction">${r.direction || (r.message || '')}</div>
        ${r.new_key ? `<div class="result-detail">Tonalidad resultante: <b>${r.new_key}</b></div>` : ''}
      </div>
    </div>
    <div class="result-grid">
      ${r.original_key ? `<div class="result-item"><div class="result-item-label">Tonalidad original</div><div class="result-item-value">${r.original_key}</div></div>` : ''}
      ${r.new_key ? `<div class="result-item"><div class="result-item-label">Tu tonalidad</div><div class="result-item-value">${r.new_key}</div></div>` : ''}
      <div class="result-item"><div class="result-item-label">Canciones analizadas</div><div class="result-item-value">${r.songCount}</div></div>
      <div class="result-item"><div class="result-item-label">Confianza</div><div class="result-item-value confidence-${confidenceClass}">${confidenceLabel}</div></div>
    </div>
    ${r.method === 'average' ? `<div class="result-fit no-fit">Indica la tonalidad original para una recomendacion mas precisa</div>` : ''}
    ${r.confidence === 'medium' ? `<div class="result-fit no-fit">Registra mas canciones con tonalidad para mejorar la precision</div>` : ''}
    ${r.confidence === 'high' && r.method === 'key-pattern' ? `<div class="result-fit fits">Recomendacion basada en tu patron de ${r.songsAnalyzed} canciones</div>` : ''}
  `;
  container.style.display = '';
}

// --- Dashboard ---

async function refreshDashboard() {
  document.getElementById('stat-songs').textContent = songs.length;

  const res = await fetch('/api/vocal-profile');
  const profile = await res.json();

  if (profile.estimated) {
    const avg = profile.averageShift;
    document.getElementById('stat-avg-shift').textContent = (avg >= 0 ? '+' : '') + avg + ' st';

    const topKey = Object.entries(profile.effectiveKeyDistribution || {}).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('stat-top-key').textContent = topKey ? topKey[0] : '--';
  } else {
    document.getElementById('stat-avg-shift').textContent = '--';
    document.getElementById('stat-top-key').textContent = '--';
  }

  const list = document.getElementById('recent-songs-list');
  const recent = songs.slice(0, 5);
  if (recent.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:1rem">Sin canciones registradas</p>';
  } else {
    list.innerHTML = recent.map(s => {
      const shift = s.semitone_shift === 0 ? 'Original' : (s.semitone_shift > 0 ? `+${s.semitone_shift}` : `${s.semitone_shift}`);
      return `
        <div class="song-mini">
          ${s.album_cover ? `<img class="song-mini-cover" src="${esc(s.album_cover)}" alt="" onerror="this.style.display='none'">` : ''}
          <div class="song-mini-info">
            <span class="song-mini-title">${esc(s.title)}</span>
            <span class="song-mini-artist">${esc(s.artist)}</span>
          </div>
          <span class="song-mini-shift">${shift} st</span>
        </div>`;
    }).join('');
  }
}

// --- Profile ---

async function loadProfile() {
  const res = await fetch('/api/vocal-profile');
  const profile = await res.json();

  if (!profile.estimated) {
    document.getElementById('profile-content').style.display = 'none';
    document.getElementById('profile-empty').style.display = '';
    return;
  }
  document.getElementById('profile-content').style.display = '';
  document.getElementById('profile-empty').style.display = 'none';

  document.getElementById('profile-song-count').textContent = profile.songCount;
  const avg = profile.averageShift;
  document.getElementById('profile-avg-shift').textContent = (avg >= 0 ? '+' : '') + avg + ' st';
  document.getElementById('profile-with-keys').textContent = profile.songsWithKeys;

  renderDistribution('shift-distribution', profile.shiftDistribution || {});
  renderDistribution('key-distribution', profile.effectiveKeyDistribution || {});
}

function renderDistribution(containerId, data) {
  const container = document.getElementById(containerId);
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = sorted.length > 0 ? sorted[0][1] : 1;

  if (sorted.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Sin datos</p>';
    return;
  }
  container.innerHTML = sorted.map(([label, count]) => `
    <div class="dist-bar">
      <span class="dist-bar-label">${esc(label)}</span>
      <div class="dist-bar-track">
        <div class="dist-bar-fill" style="width:${(count / max * 100).toFixed(0)}%"></div>
      </div>
      <span class="dist-bar-count">${count}</span>
    </div>
  `).join('');
}

// --- Utils ---

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + (type || '');
  setTimeout(() => toast.className = 'toast', 3000);
}
