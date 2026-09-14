/* ==========================================================
   GEOTRACK PRO — Main Engine
   Online + Offline Tracking | Premium Hacker Terminal
   ========================================================== */

/* ============ STATE ============ */
const state = {
  watchId: null,
  map: null,
  marker: null,
  pathLine: null,
  trackPoints: [],
  totalDistance: 0,
  maxSpeed: 0,
  speedSamples: [],
  startTime: null,
  uptimeTimer: null,
  isTracking: false,
  mode: 'online', // 'online' | 'offline'
  networkOnline: navigator.onLine,
  lastPosition: null,
};

const deviceId = 'DEV-' + Math.random().toString(36).substring(2, 11).toUpperCase();
const sessionId = 'SES-' + Date.now().toString(36).toUpperCase();

/* ============ LOGGER ============ */
function log(msg, type = 'info') {
  const logEl = document.getElementById('log');
  const t = new Date().toLocaleTimeString('en-GB');
  const line = document.createElement('div');
  line.className = 'log-line ' + type;
  line.innerHTML = `<span class="t">[${t}]</span>${msg}`;
  logEl.appendChild(line);
  while (logEl.children.length > 120) logEl.removeChild(logEl.firstChild);
  logEl.scrollTop = logEl.scrollHeight;
}

/* ============ CLOCK ============ */
function tickClock() {
  const now = new Date();
  document.getElementById('clock').innerText = now.toLocaleTimeString('en-GB');
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  document.getElementById('dateVal').innerText = `${d}.${m}.${y}`;
}
setInterval(tickClock, 1000);
tickClock();

/* ============ NETWORK DETECTION ============ */
function updateNetworkUI() {
  const chip = document.getElementById('netChip');
  const text = document.getElementById('netText');
  const dot = chip.querySelector('.chip-dot');

  if (state.networkOnline) {
    dot.className = 'chip-dot online';
    text.innerText = 'NETWORK ONLINE';
    log('network: connected', 'ok');
  } else {
    dot.className = 'chip-dot';
    text.innerText = 'OFFLINE MODE';
    log('network: disconnected — switching to offline buffer', 'warn');
  }
}

window.addEventListener('online', () => {
  state.networkOnline = true;
  updateNetworkUI();
  if (state.mode === 'online') syncBufferedData();
});

window.addEventListener('offline', () => {
  state.networkOnline = false;
  updateNetworkUI();
});

/* ============ MODE SELECTOR ============ */
function setMode(mode) {
  state.mode = mode;
  document.getElementById('modeOnline').classList.toggle('active', mode === 'online');
  document.getElementById('modeOffline').classList.toggle('active', mode === 'offline');
  document.getElementById('hudMode').innerText = 'MODE: ' + mode.toUpperCase();
  document.getElementById('fbMode').innerText = mode.toUpperCase();
  log('mode set to ' + mode.toUpperCase(), 'info');
}

document.getElementById('modeOnline').addEventListener('click', () => setMode('online'));
document.getElementById('modeOffline').addEventListener('click', () => setMode('offline'));

/* ============ MAP INIT ============ */
function initMap() {
  state.map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true,
  }).setView([28.6139, 77.2090], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'GEOTRACK//PRO · MAP DATA © OPENSTREETMAP',
    maxZoom: 19,
    crossOrigin: true,
  }).addTo(state.map);

  state.pathLine = L.polyline([], {
    color: '#00ffaa',
    weight: 2.5,
    opacity: 0.85,
    dashArray: '6, 10',
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(state.map);

  log('map engine initialized', 'ok');
}

/* ============ CUSTOM MARKER ============ */
function updateMarker(lat, lng, name) {
  const icon = L.divIcon({
    className: 'gt-marker',
    html: `
      <div class="gt-ring-1"></div>
      <div class="gt-ring-2"></div>
      <div class="gt-core"></div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  if (!state.marker) {
    state.marker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(state.map);
  } else {
    state.marker.setLatLng([lat, lng]);
    state.marker.setIcon(icon);
  }

  state.marker.bindPopup(`
    <div style="
      font-family:'JetBrains Mono',monospace;
      font-size:11px;
      color:#00ffaa;
      background:#03050a;
      padding:6px 4px;
      letter-spacing:1px;
    ">
      <b style="color:#00d9ff;">${name || 'OPERATOR'}</b><br>
      LAT: ${lat.toFixed(6)}<br>
      LNG: ${lng.toFixed(6)}<br>
      DEV: ${deviceId}
    </div>
  `, { closeButton: false });
}

/* ============ DISTANCE (Haversine) ============ */
function haversine(p1, p2) {
  const R = 6371;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1.lat * Math.PI / 180) *
    Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ============ UPTIME ============ */
function startUptime() {
  state.startTime = Date.now();
  clearInterval(state.uptimeTimer);
  state.uptimeTimer = setInterval(() => {
    const e = Math.floor((Date.now() - state.startTime) / 1000);
    const h = String(Math.floor(e / 3600)).padStart(2, '0');
    const m = String(Math.floor((e % 3600) / 60)).padStart(2, '0');
    const s = String(e % 60).padStart(2, '0');
    document.getElementById('uptimeVal').innerText = `${h}:${m}:${s}`;
  }, 1000);
}

/* ============ BADGES / HUD ============ */
function setHudActive(active) {
  const b = document.getElementById('hudBadge');
  b.classList.toggle('active', active);
  document.getElementById('hudText').innerText = active ? 'TRACKING ACTIVE' : 'STANDBY';
}

function setSignal(active, label) {
  const wrap = document.querySelector('.signal-strength');
  const bars = document.querySelector('.ss-bars');
  const lbl = document.getElementById('ssLabel');
  bars.classList.toggle('active', active);
  lbl.innerText = label;
}

/* ============ SIGNAL WAVEFORM ============ */
let wavePhase = 0;
let waveActive = false;

function animateWave() {
  const poly = document.getElementById('sigWave');
  if (!poly) return;

  const width = 200;
  const step = 4;
  let points = '';

  for (let x = 0; x <= width; x += step) {
    const amp = waveActive ? 10 + Math.random() * 8 : 1.5;
    const noise = waveActive ? (Math.random() - 0.5) * 6 : 0;
    const y = 30 + Math.sin((x + wavePhase) * 0.15) * amp + noise;
    points += `${x},${y.toFixed(1)} `;
  }

  poly.setAttribute('points', points.trim());
  wavePhase += waveActive ? 4 : 1;
  requestAnimationFrame(animateWave);
}
animateWave();

/* ============ TRACKING ============ */
function startTracking() {
  const name = document.getElementById('userName').value.trim();
  if (!name) {
    log('error: codename required', 'err');
    flashInput();
    return;
  }
  if (!navigator.geolocation) {
    log('error: geolocation unsupported', 'err');
    return;
  }

  state.isTracking = true;
  state.trackPoints = [];
  state.totalDistance = 0;
  state.maxSpeed = 0;
  state.speedSamples = [];
  state.lastPosition = null;

  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  document.getElementById('gpsState').innerText = 'SEARCHING';

  log('initiating track sequence...', 'info');
  log('operator: ' + name, 'info');
  log('mode: ' + state.mode.toUpperCase(), 'info');

  setHudActive(true);
  setSignal(true, 'ACQUIRING');

  state.watchId = navigator.geolocation.watchPosition(
    onPosition,
    onError,
    {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: state.mode === 'offline' ? 30000 : 0,
    }
  );

  startUptime();
}

function onPosition(pos) {
  const { latitude: lat, longitude: lng, accuracy: acc, altitude: alt, speed, heading } = pos.coords;
  const name = document.getElementById('userName').value.trim();

  // Telemetry
  document.getElementById('latVal').innerText = lat.toFixed(6);
  document.getElementById('lngVal').innerText = lng.toFixed(6);
  document.getElementById('accVal').innerText = acc ? acc.toFixed(0) + 'm' : '--';
  document.getElementById('altVal').innerText = alt ? alt.toFixed(0) + 'm' : '--';
  const spd = speed ? (speed * 3.6).toFixed(1) : '0.0';
  document.getElementById('speedVal').innerText = spd + ' km/h';
  document.getElementById('headVal').innerText = heading ? heading.toFixed(0) + '°' : '--';

  // HUD coords
  document.getElementById('hudCoords').innerText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  document.getElementById('gpsState').innerText = 'LOCKED';

  // Map
  updateMarker(lat, lng, name);
  state.trackPoints.push([lat, lng]);
  state.pathLine.setLatLngs(state.trackPoints);

  if (state.trackPoints.length === 1) {
    state.map.setView([lat, lng], 16);
  } else {
    state.map.panTo([lat, lng], { animate: true, duration: 0.5 });
  }

  // Distance
  if (state.lastPosition) {
    const d = haversine(state.lastPosition, { lat, lng });
    if (d < 1) state.totalDistance += d; // ignore >1km jumps
  }
  state.lastPosition = { lat, lng };

  // Speed stats
  const speedKmh = speed ? speed * 3.6 : 0;
  if (speedKmh > 0.5) {
    state.speedSamples.push(speedKmh);
    if (speedKmh > state.maxSpeed) state.maxSpeed = speedKmh;
  }

  updateMetrics();
  setSignal(true, 'STRONG');

  // Log (rate-limited: every 5th point)
  if (state.trackPoints.length % 5 === 1) {
    log(`pos lock · ${lat.toFixed(4)},${lng.toFixed(4)} · acc ${acc.toFixed(0)}m`, 'ok');
  }

  // Persist
  savePoint({ name, lat, lng, acc, alt, speed: speedKmh, heading, timestamp: Date.now() });
}

function onError(err) {
  const msgs = {
    1: 'permission denied by operator',
    2: 'position unavailable',
    3: 'gps timeout',
  };
  log('gps error: ' + (msgs[err.code] || 'unknown'), 'err');
  document.getElementById('gpsState').innerText = 'ERROR';
  setSignal(false, 'NO SIGNAL');
}

function stopTracking() {
  state.isTracking = false;
  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
  document.getElementById('gpsState').innerText = 'IDLE';

  clearInterval(state.uptimeTimer);
  setHudActive(false);
  setSignal(false, 'IDLE');
  waveActive = false;

  log('track sequence terminated', 'warn');
  log(`total distance: ${state.totalDistance.toFixed(3)} km`, 'info');
  log(`track points captured: ${state.trackPoints.length}`, 'info');
}

function flashInput() {
  const el = document.getElementById('userName');
  el.style.borderColor = '#ff2d55';
  el.style.boxShadow = '0 0 0 3px rgba(255,45,85,0.15), 0 0 15px rgba(255,45,85,0.4)';
  setTimeout(() => {
    el.style.borderColor = '';
    el.style.boxShadow = '';
  }, 1200);
}

/* ============ METRICS ============ */
function updateMetrics() {
  document.getElementById('pointCount').innerText = state.trackPoints.length;
  document.getElementById('distanceVal').innerText = state.totalDistance.toFixed(2);
  document.getElementById('maxSpeed').innerHTML = state.maxSpeed.toFixed(1) + ' <small>km/h</small>';

  const avg = state.speedSamples.length
    ? state.speedSamples.reduce((a, b) => a + b, 0) / state.speedSamples.length
    : 0;
  document.getElementById('avgSpeed').innerHTML = avg.toFixed(1) + ' <small>km/h</small>';

  const pct = Math.min(100, state.totalDistance * 10);
  document.getElementById('distBar').style.width = pct + '%';
}

/* ============ PERSISTENCE (Online + Offline buffer) ============ */
function savePoint(p) {
  const payload = { ...p, deviceId, sessionId, mode: state.mode };

  // Always store locally (offline-first)
  const buf = JSON.parse(localStorage.getItem('gt_buffer') || '[]');
  buf.push(payload);
  if (buf.length > 5000) buf.shift();
  localStorage.setItem('gt_buffer', JSON.stringify(buf));
  document.getElementById('bufCount').innerText = buf.length;

  // Sync history (permanent log)
  const hist = JSON.parse(localStorage.getItem('gt_history') || '[]');
  hist.push(payload);
  if (hist.length > 10000) hist.shift();
  localStorage.setItem('gt_history', JSON.stringify(hist));

  // Online mode → would POST to server here
  if (state.mode === 'online' && state.networkOnline) {
    // fetch('/api/location', { method:'POST', body: JSON.stringify(payload) })
    //   .then(() => removeFromBuffer(payload.timestamp))
    //   .catch(() => {});
  }
}

function syncBufferedData() {
  const buf = JSON.parse(localStorage.getItem('gt_buffer') || '[]');
  if (buf.length === 0) return;
  log(`syncing ${buf.length} buffered points...`, 'info');
  // POST to server here in real deployment
  setTimeout(() => {
    localStorage.setItem('gt_buffer', '[]');
    document.getElementById('bufCount').innerText = '0';
    log('buffer sync complete', 'ok');
  }, 800);
}

/* ============ EXPORT ============ */
function exportCSV() {
  const hist = JSON.parse(localStorage.getItem('gt_history') || '[]');
  if (!hist.length) {
    log('export failed: no data', 'err');
    return;
  }
  let csv = 'timestamp,name,deviceId,sessionId,mode,lat,lng,accuracy,altitude,speed_kmh,heading\n';
  hist.forEach(h => {
    csv += `${new Date(h.timestamp).toISOString()},${h.name},${h.deviceId},${h.sessionId},${h.mode},${h.lat},${h.lng},${h.acc || ''},${h.alt || ''},${(h.speed || 0).toFixed(2)},${h.heading || ''}\n`;
  });
  download(csv, `geotrack_${Date.now()}.csv`, 'text/csv');
  log('csv export · ' + hist.length + ' records', 'ok');
}

function exportJSON() {
  const hist = JSON.parse(localStorage.getItem('gt_history') || '[]');
  if (!hist.length) {
    log('export failed: no data', 'err');
    return;
  }
  const json = JSON.stringify({
    exported: new Date().toISOString(),
    deviceId, sessionId,
    totalPoints: hist.length,
    totalDistanceKm: state.totalDistance,
    records: hist,
  }, null, 2);
  download(json, `geotrack_${Date.now()}.json`, 'application/json');
  log('json export · ' + hist.length + ' records', 'ok');
}

function download(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function clearHistory() {
  if (!confirm('PURGE ALL TRACK DATA? This cannot be undone.')) return;
  localStorage.removeItem('gt_history');
  localStorage.removeItem('gt_buffer');
  state.trackPoints = [];
  state.totalDistance = 0;
  state.maxSpeed = 0;
  state.speedSamples = [];
  if (state.pathLine) state.pathLine.setLatLngs([]);
  if (state.marker) { state.map.removeLayer(state.marker); state.marker = null; }
  updateMetrics();
  document.getElementById('bufCount').innerText = '0';
  log('all data purged', 'warn');
}

/* ============ INIT ============ */
window.addEventListener('load', () => {
  initMap();
  updateNetworkUI();
  setMode('online');

  document.getElementById('deviceId').innerText = deviceId;
  document.getElementById('sessionId').innerText = sessionId;

  document.getElementById('startBtn').addEventListener('click', startTracking);
  document.getElementById('stopBtn').addEventListener('click', stopTracking);
  document.getElementById('userName').addEventListener('keydown', e => {
    if (e.key === 'Enter') startTracking();
  });

  log('device id: ' + deviceId, 'info');
  log('session id: ' + sessionId, 'info');
  log('system ready · awaiting operator', 'ok');
});

/* ============ WAVE ACTIVATION HOOK ============ */
const _origStart = startTracking;
startTracking = function () {
  waveActive = true;
  _origStart.apply(this, arguments);
};

const _origStop = stopTracking;
stopTracking = function () {
  waveActive = false;
  _origStop.apply(this, arguments);
};