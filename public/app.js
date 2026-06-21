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
let lastSearchResults = { add: [], rec: [] };
let selectedTrack = { add: null, rec: null };

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
  try {
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
  } catch (err) {
    console.error('Auth check failed:', err);
  }
}

async function handleAuth() {
  const pin = document.getElementById('pin-input').value;
  const confirm = document.getElementById('pin-confirm');
  const error = document.getElementById('auth-error');
  error.textContent = '';

  try {
    if (confirm.style.display !== 'none') {
      if (pin.length < 4) { error.textContent = 'El PIN debe tener al menos 4 caracteres'; return; }
      if (pin !== confirm.value) { error.textContent = 'Los PINs no coinciden'; return; }
      var result = await postJSON('/api/auth/setup', { pin: pin });
      if (result.data.success) enterApp();
      else error.textContent = result.data.error;
    } else {
      var result = await postJSON('/api/auth/verify', { pin: pin });
      if (result.ok) enterApp();
      else error.textContent = 'PIN incorrecto';
    }
  } catch (err) {
    error.textContent = 'Error de conexion';
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
  const prefix = resultsId.startsWith('add') ? 'add' : 'rec';
  container.innerHTML = '<div class="search-loading">Buscando...</div>';
  try {
    const res = await fetch('/api/search?q=' + encodeURIComponent(q));
    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      container.innerHTML = '<div class="search-empty">Sin resultados</div>';
      return;
    }
    lastSearchResults[prefix] = data.data;
    container.innerHTML = data.data.map(function(track, idx) {
      return '<div class="search-item" data-prefix="' + prefix + '" data-idx="' + idx + '">' +
        '<img class="search-item-cover" src="' + esc(track.cover) + '" alt="" onerror="this.style.display=\'none\'">' +
        '<div class="search-item-info">' +
          '<div class="search-item-title">' + esc(track.title) + '</div>' +
          '<div class="search-item-artist">' + esc(track.artist) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    container.querySelectorAll('.search-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var p = this.getAttribute('data-prefix');
        var i = parseInt(this.getAttribute('data-idx'));
        selectTrack(p, lastSearchResults[p][i]);
      });
    });
  } catch (err) {
    container.innerHTML = '<div class="search-empty">Error de busqueda</div>';
  }
}

function selectTrack(prefix, track) {
  selectedTrack[prefix] = track;
  document.getElementById(prefix + '-search').style.display = 'none';
  document.getElementById(prefix + '-results').innerHTML = '';
  document.getElementById(prefix + '-selected').style.display = '';
  document.getElementById(prefix + '-cover').src = track.coverMedium || track.cover || '';
  document.getElementById(prefix + '-sel-title').textContent = track.title;
  document.getElementById(prefix + '-sel-artist').textContent = track.artist;
}

function clearAddSelection() {
  selectedTrack.add = null;
  document.getElementById('add-search').style.display = '';
  document.getElementById('add-search').value = '';
  document.getElementById('add-selected').style.display = 'none';
}

function clearRecSelection() {
  selectedTrack.rec = null;
  document.getElementById('rec-search').style.display = '';
  document.getElementById('rec-search').value = '';
  document.getElementById('rec-selected').style.display = 'none';
  document.getElementById('recommendation-result').style.display = 'none';
}

// --- Songs CRUD ---

async function loadSongs() {
  try {
    const res = await fetch('/api/songs');
    songs = await res.json();
    refreshDashboard();
  } catch (err) {
    showToast('Error cargando canciones', 'error');
  }
}

function renderSongs() {
  const container = document.getElementById('songs-list');
  const noSongs = document.getElementById('no-songs');
  const term = (document.getElementById('filter-songs').value || '').toLowerCase();

  const filtered = songs.filter(function(s) {
    return s.title.toLowerCase().includes(term) || s.artist.toLowerCase().includes(term);
  });

  if (songs.length === 0) {
    container.style.display = 'none';
    noSongs.style.display = '';
    return;
  }
  noSongs.style.display = 'none';
  container.style.display = '';

  container.innerHTML = filtered.map(function(song) {
    var shift = song.semitone_shift === 0 ? 'Original' : (song.semitone_shift > 0 ? '+' + song.semitone_shift : '' + song.semitone_shift);
    var coverHtml = song.album_cover
      ? '<img class="song-card-cover" src="' + esc(song.album_cover) + '" alt="" onerror="this.style.display=\'none\'">'
      : '';
    return '<div class="song-card">' +
      coverHtml +
      '<div class="song-info">' +
        '<h4>' + esc(song.title) + '</h4>' +
        '<div class="song-artist">' + esc(song.artist) + '</div>' +
        '<div class="song-meta">' +
          (song.original_key ? '<span class="song-tag">Tono: ' + esc(song.original_key) + '</span>' : '') +
          '<span class="song-tag">' + shift + ' st</span>' +
          (song.octave_down ? '<span class="song-tag tag-octave">8va baja</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="song-actions">' +
        '<button class="btn-icon" onclick="editSong(' + song.id + ')" title="Editar">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>' +
        '<button class="btn-icon danger" onclick="deleteSong(' + song.id + ')" title="Eliminar">' +
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function addSong() {
  try {
    var track = selectedTrack.add;
    if (!track) { showToast('Busca y selecciona una cancion primero', 'error'); return; }

    var payload = {
      title: String(track.title || ''),
      artist: String(track.artist || ''),
      original_key: document.getElementById('add-key').value || '',
      semitone_shift: parseInt(document.getElementById('add-semitones').value) || 0,
      octave_down: !!document.getElementById('add-octave-down').checked,
      deezer_id: track.id ? Number(track.id) : null,
      album_cover: String(track.coverMedium || track.cover || '')
    };

    var result = await postJSON('/api/songs', payload);

    if (result.ok) {
      songs.unshift(result.data);
      showToast('Cancion registrada', 'success');
      clearAddSelection();
      document.getElementById('add-key').value = '';
      document.getElementById('add-semitones').value = '0';
      document.getElementById('add-octave-down').checked = false;
    } else {
      showToast(result.data.error || 'Error al registrar', 'error');
    }
  } catch (err) {
    showToast('Error de conexion: ' + err.message, 'error');
  }
}

async function deleteSong(id) {
  if (!confirm('¿Eliminar esta cancion?')) return;
  try {
    await fetch('/api/songs/' + id, { method: 'DELETE' });
    songs = songs.filter(function(s) { return s.id !== id; });
    renderSongs();
    showToast('Cancion eliminada', 'success');
  } catch (err) {
    showToast('Error al eliminar', 'error');
  }
}

function editSong(id) {
  var song = songs.find(function(s) { return s.id === id; });
  if (!song) return;
  document.getElementById('edit-song-id').value = song.id;
  document.getElementById('edit-title').value = song.title;
  document.getElementById('edit-artist').value = song.artist;
  document.getElementById('edit-key').value = song.original_key || '';
  document.getElementById('edit-semitones').value = song.semitone_shift;
  document.getElementById('edit-octave-down').checked = !!song.octave_down;
  document.getElementById('edit-modal').style.display = '';
}

function closeEditModal() { document.getElementById('edit-modal').style.display = 'none'; }

async function updateSong(e) {
  e.preventDefault();
  try {
    var id = document.getElementById('edit-song-id').value;
    var body = {
      title: document.getElementById('edit-title').value,
      artist: document.getElementById('edit-artist').value,
      original_key: document.getElementById('edit-key').value,
      semitone_shift: parseInt(document.getElementById('edit-semitones').value) || 0,
      octave_down: document.getElementById('edit-octave-down').checked
    };
    var result = await putJSON('/api/songs/' + id, body);
    if (result.ok) {
      var idx = songs.findIndex(function(s) { return s.id === result.data.id; });
      if (idx >= 0) songs[idx] = result.data;
      closeEditModal();
      renderSongs();
      showToast('Cancion actualizada', 'success');
    } else {
      showToast('Error al actualizar', 'error');
    }
  } catch (err) {
    showToast('Error de conexion', 'error');
  }
}

function adjustSemitone(inputId, delta) {
  var input = document.getElementById(inputId);
  var val = parseInt(input.value) || 0;
  input.value = Math.max(-12, Math.min(12, val + delta));
}

// --- Recommendation ---

async function getRecommendation() {
  try {
    var track = selectedTrack.rec;
    if (!track) { showToast('Busca y selecciona una cancion', 'error'); return; }

    var result = await postJSON('/api/recommend', { original_key: document.getElementById('rec-key').value || '' });
    var data = result.data;
    var container = document.getElementById('recommendation-result');
    var content = document.getElementById('result-content');

    if (!data.recommendation) {
      content.innerHTML = '<div class="empty-state" style="padding:1.5rem"><p>' + data.message + '</p></div>';
      container.style.display = '';
      return;
    }

    var r = data.recommendation;
    var shiftDisplay = r.semitones === 0 ? '0' : (r.semitones > 0 ? '+' + r.semitones : '' + r.semitones);
    var confidenceLabel = { high: 'Alta', medium: 'Media', low: 'Baja' }[r.confidence] || r.confidence;

    content.innerHTML =
      '<div class="result-main">' +
        '<div class="result-shift">' + shiftDisplay + '</div>' +
        '<div>' +
          '<div class="result-direction">' + (r.direction || r.message || '') + '</div>' +
          (r.new_key ? '<div class="result-detail">Tonalidad resultante: <b>' + r.new_key + '</b></div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="result-grid">' +
        (r.original_key ? '<div class="result-item"><div class="result-item-label">Tonalidad original</div><div class="result-item-value">' + r.original_key + '</div></div>' : '') +
        (r.new_key ? '<div class="result-item"><div class="result-item-label">Tu tonalidad</div><div class="result-item-value">' + r.new_key + '</div></div>' : '') +
        '<div class="result-item"><div class="result-item-label">Canciones analizadas</div><div class="result-item-value">' + r.songCount + '</div></div>' +
        '<div class="result-item"><div class="result-item-label">Confianza</div><div class="result-item-value confidence-' + r.confidence + '">' + confidenceLabel + '</div></div>' +
      '</div>' +
      (r.method === 'average' ? '<div class="result-fit no-fit">Indica la tonalidad original para una recomendacion mas precisa</div>' : '') +
      (r.confidence === 'medium' ? '<div class="result-fit no-fit">Registra mas canciones con tonalidad para mejorar la precision</div>' : '') +
      (r.confidence === 'high' && r.method === 'key-pattern' ? '<div class="result-fit fits">Recomendacion basada en tu patron de ' + r.songsAnalyzed + ' canciones</div>' : '');

    container.style.display = '';
  } catch (err) {
    showToast('Error al obtener recomendacion', 'error');
  }
}

// --- Dashboard ---

async function refreshDashboard() {
  document.getElementById('stat-songs').textContent = songs.length;
  try {
    var res = await fetch('/api/vocal-profile');
    var profile = await res.json();

    if (profile.estimated) {
      var avg = profile.averageShift;
      document.getElementById('stat-avg-shift').textContent = (avg >= 0 ? '+' : '') + avg + ' st';
      var entries = Object.entries(profile.effectiveKeyDistribution || {});
      entries.sort(function(a, b) { return b[1] - a[1]; });
      document.getElementById('stat-top-key').textContent = entries.length > 0 ? entries[0][0] : '--';
    } else {
      document.getElementById('stat-avg-shift').textContent = '--';
      document.getElementById('stat-top-key').textContent = '--';
    }
  } catch (err) {
    console.error('Profile load error:', err);
  }

  var list = document.getElementById('recent-songs-list');
  var recent = songs.slice(0, 5);
  if (recent.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;padding:1rem">Sin canciones registradas</p>';
  } else {
    list.innerHTML = recent.map(function(s) {
      var shift = s.semitone_shift === 0 ? 'Original' : (s.semitone_shift > 0 ? '+' + s.semitone_shift : '' + s.semitone_shift);
      return '<div class="song-mini">' +
        (s.album_cover ? '<img class="song-mini-cover" src="' + esc(s.album_cover) + '" alt="" onerror="this.style.display=\'none\'">' : '') +
        '<div class="song-mini-info">' +
          '<span class="song-mini-title">' + esc(s.title) + '</span>' +
          '<span class="song-mini-artist">' + esc(s.artist) + '</span>' +
        '</div>' +
        '<span class="song-mini-shift">' + shift + ' st' + (s.octave_down ? ' ↓8va' : '') + '</span>' +
      '</div>';
    }).join('');
  }
}

// --- Profile ---

async function loadProfile() {
  try {
    var res = await fetch('/api/vocal-profile');
    var profile = await res.json();

    if (!profile.estimated) {
      document.getElementById('profile-content').style.display = 'none';
      document.getElementById('profile-empty').style.display = '';
      return;
    }
    document.getElementById('profile-content').style.display = '';
    document.getElementById('profile-empty').style.display = 'none';

    document.getElementById('profile-song-count').textContent = profile.songCount;
    var avg = profile.averageShift;
    document.getElementById('profile-avg-shift').textContent = (avg >= 0 ? '+' : '') + avg + ' st';
    document.getElementById('profile-with-keys').textContent = profile.songsWithKeys;

    renderDistribution('shift-distribution', profile.shiftDistribution || {});
    renderDistribution('key-distribution', profile.effectiveKeyDistribution || {});
  } catch (err) {
    console.error('Profile error:', err);
  }
}

function renderDistribution(containerId, data) {
  var container = document.getElementById(containerId);
  var sorted = Object.entries(data).sort(function(a, b) { return b[1] - a[1]; });
  var max = sorted.length > 0 ? sorted[0][1] : 1;

  if (sorted.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">Sin datos</p>';
    return;
  }
  container.innerHTML = sorted.map(function(entry) {
    return '<div class="dist-bar">' +
      '<span class="dist-bar-label">' + esc(entry[0]) + '</span>' +
      '<div class="dist-bar-track"><div class="dist-bar-fill" style="width:' + (entry[1] / max * 100).toFixed(0) + '%"></div></div>' +
      '<span class="dist-bar-count">' + entry[1] + '</span>' +
    '</div>';
  }).join('');
}

// --- Utils ---

function sendJSON(method, url, data) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onload = function() {
      var json;
      try { json = JSON.parse(xhr.responseText); } catch (e) { json = {}; }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: json });
    };
    xhr.onerror = function() { reject(new Error('Error de red')); };
    xhr.send(JSON.stringify(data));
  });
}

function postJSON(url, data) { return sendJSON('POST', url, data); }
function putJSON(url, data) { return sendJSON('PUT', url, data); }

function esc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function showToast(message, type) {
  var toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast show ' + (type || '');
  setTimeout(function() { toast.className = 'toast'; }, 3000);
}
