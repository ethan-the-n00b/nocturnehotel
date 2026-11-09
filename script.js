const room = document.getElementById('roomShell');
const toast = document.getElementById('interactionToast');
const hoverTooltip = document.getElementById('hoverTooltip');
const focusPanel = document.getElementById('focusPanel');
const musicPanel = document.getElementById('musicPanel');
const controlScrim = document.getElementById('controlScrim');
const $ = (selector) => document.querySelector(selector);

const lights = [
  { name: 'Warm amber', filter: 'none' },
  { name: 'Cool moonlight', filter: 'hue-rotate(10deg) saturate(.88)' },
  { name: 'Dim lighting', filter: 'brightness(.68)' }
];
const sounds = ['Off', 'Soft rain', 'Night wind', 'Room hum'];
let lightIndex = 0;
let soundIndex = 0;
let audioContext = null;
let audioNodes = [];
let ambientGainNode = null;
let selectedMinutes = 25;
let sessionReward = sessionStorage.getItem('nocturneSessionReward') || ''; 
let sessionGoal = sessionStorage.getItem('nocturneSessionGoal') || '';
let timerSeconds = selectedMinutes * 60;
let timerEnd = null;
let timerInterval = null;
let timerMode = 'ready';
let breakSeconds = 0;
let breakEnd = null;
const BREAK_MILESTONES = [0.25, 0.50, 0.75];
const BREAK_LENGTH_SECONDS = 5 * 60;
let completedBreaks = Number(sessionStorage.getItem('nocturneCompletedBreaks') || 0);
let toastTimeout;
let localAudioUrl = null;
let focusModeActive = false;
const focusExperience = document.getElementById('focusExperience');
const WORKSHOP_STORAGE_KEY = 'nocturneWorkshopV1';
const DECOR_CATALOG = [
  { id:'display-shelf', name:'Display Shelf', icon:'🪵', kind:'furniture', mood:'cozy', cost:20, description:'A dark walnut shelf for the little things you collect.', roomOnly:true },
  { id:'potted-plant', name:'Small Potted Plant', icon:'🪴', kind:'decor', mood:'cozy', cost:8, description:'A quiet bit of green for the room.' },
  { id:'book-stack', name:'Stack of Books', icon:'📚', kind:'decor', mood:'cozy', cost:7, description:'A few well-loved books, ready for another evening.' },
  { id:'warm-candle', name:'Warm Candle', icon:'🕯️', kind:'decor', mood:'cozy', cost:8, description:'A little amber light for a calm corner.' },
  { id:'ceramic-moon', name:'Ceramic Moon', icon:'🌙', kind:'decor', mood:'cozy', cost:10, description:'A small keepsake shaped like the night sky.' },
  { id:'rubber-duck', name:'Tiny Rubber Duck', icon:'🦆', kind:'decor', mood:'silly', cost:6, description:'It has no responsibilities. A role model, really.' },
  { id:'mini-lamp', name:'Miniature Lamp', icon:'🏮', kind:'decor', mood:'cozy', cost:12, description:'A tiny pool of warm light.' },
  { id:'picture-frame', name:'Little Picture Frame', icon:'🖼️', kind:'decor', mood:'cozy', cost:9, description:'A place for a favorite memory.' },
  { id:'frog-king', name:'Frog in a Crown', icon:'🐸', kind:'decor', mood:'silly', cost:10, description:'A monarch of questionable jurisdiction.' },
  { id:'small-clock', name:'Small Clock', icon:'🕰️', kind:'decor', mood:'cozy', cost:13, description:'A gentle reminder that time can pass quietly.' },
  { id:'hanging-ivy', name:'Hanging Ivy', icon:'🌿', kind:'decor', mood:'cozy', cost:14, description:'A little greenery to soften the room.' },
  { id:'tiny-ufo', name:'Tiny UFO', icon:'🛸', kind:'decor', mood:'silly', cost:15, description:'It claims to be here on official business.' },
  // Keep collectibles from the earlier prototype in existing inventories, without changing the new 75:25 catalog mix.
  { id:'traffic-cone', name:'Mini Traffic Cone', icon:'🚧', kind:'decor', mood:'silly', cost:0, description:'A retired prototype collectible.', legacy:true },
  { id:'space-potato', name:'Space Potato', icon:'🥔', kind:'decor', mood:'silly', cost:0, description:'A retired prototype collectible.', legacy:true },
  { id:'wizard-hat', name:'Suspicious Wizard Hat', icon:'🧙', kind:'decor', mood:'silly', cost:0, description:'A retired prototype collectible.', legacy:true },
  { id:'tiny-dragon', name:'Extremely Small Dragon', icon:'🐉', kind:'decor', mood:'silly', cost:0, description:'A retired prototype collectible.', legacy:true },
  { id:'banana-phone', name:'Banana Telephone', icon:'🍌', kind:'decor', mood:'silly', cost:0, description:'A retired prototype collectible.', legacy:true }
];
const MIN_QUALIFYING_SESSION_SECONDS = 60;
function loadWorkshop() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSHOP_STORAGE_KEY) || '{}');
    const legacySeconds = Math.max(0, Number(saved.craftSeconds) || (Number(saved.parts) || 0) * 1200 + (Number(saved.partSeconds) || 0));
    const legacyInventory = Array.isArray(saved.inventory) ? saved.inventory : [];
    const built = Array.isArray(saved.built) ? saved.built : legacyInventory;
    const placements = saved.placements && typeof saved.placements === 'object' ? saved.placements : {};
    return {
      totalSeconds: Math.max(0, Number(saved.totalSeconds) || 0),
      materials: Math.max(0, Number(saved.materials) || Math.floor(legacySeconds / 60)),
      materialRemainderSeconds: Math.max(0, Number(saved.materialRemainderSeconds) || legacySeconds % 60),
      built: built.filter(id => DECOR_CATALOG.some(item => item.id === id)),
      placements,
      processedSessions: Array.isArray(saved.processedSessions) ? saved.processedSessions : [],
      activeGoal: saved.activeGoal || null
    };
  } catch (_) {
    return { totalSeconds:0, materials:0, materialRemainderSeconds:0, built:[], placements:{}, processedSessions:[], activeGoal:null };
  }
}
let workshop = loadWorkshop();
let catalogFilter = 'all';
let currentSessionId = sessionStorage.getItem('nocturneFocusSessionId') || '';
if ($('#sessionGoal')) $('#sessionGoal').value = sessionGoal;
if ($('#sessionReward')) $('#sessionReward').value = sessionReward;
const workshopToggle = document.getElementById('workshopToggle');
if (workshopToggle) workshopToggle.addEventListener('click', () => {
  const content = document.getElementById('workshopContent');
  const opening = content.hidden; content.hidden = !opening;
  workshopToggle.setAttribute('aria-expanded', String(opening));
  workshopToggle.querySelector('span').textContent = opening ? '−' : '＋';
});
function saveWorkshop() { localStorage.setItem(WORKSHOP_STORAGE_KEY, JSON.stringify(workshop)); }
function renderCatalog() {
  const grid = $('#catalogGrid');
  if (!grid) return;
  grid.innerHTML = '';
  DECOR_CATALOG.filter(item => !item.legacy && (catalogFilter === 'all' || item.kind === catalogFilter || item.mood === catalogFilter)).forEach(item => {
    const built = workshop.built.includes(item.id);
    const canBuild = workshop.materials >= item.cost;
    const card = document.createElement('article');
    card.className = `catalog-card ${built ? 'is-built' : ''}`;
    const type = item.kind === 'furniture' ? 'FURNITURE' : item.mood.toUpperCase();
    card.innerHTML = `<div class="catalog-card-top"><span class="catalog-icon" aria-hidden="true">${item.icon}</span><span class="catalog-tag ${item.mood}">${type}</span></div><h4>${item.name}</h4><p>${item.description}</p><div class="catalog-card-bottom"><span>${built ? 'In your collection' : `${item.cost} lumen`}</span><button type="button" ${built || !canBuild ? 'disabled' : ''} data-build-item="${item.id}">${built ? 'Built ✓' : canBuild ? 'Build' : 'Need more'}</button></div>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('[data-build-item]').forEach(button => button.addEventListener('click', () => buildItem(button.dataset.buildItem)));
}
function renderPlacedDecor() {
  const layer = $('#roomDecorLayer');
  if (!layer) return;
  layer.innerHTML = '';
  const placed = workshop.built.filter(id => workshop.placements[id] && workshop.placements[id] !== 'unplaced');
  const counts = {};
  const positions = {
    'room-window': {x:57,y:69}, 'room-corner':{x:88,y:72}, desk:{x:22,y:59}, nightstand:{x:10,y:65}, shelf:{x:60,y:61}
  };
  placed.forEach(id => {
    const item = DECOR_CATALOG.find(entry => entry.id === id);
    const location = workshop.placements[id];
    const base = positions[location] || positions['room-window'];
    const n = counts[location] || 0; counts[location] = n + 1;
    const node = document.createElement('div');
    node.className = `placed-decor ${item.kind === 'furniture' ? 'placed-furniture' : ''} placement-${location}`;
    node.title = item.name;
    node.setAttribute('aria-label', item.name);
    node.textContent = item.icon;
    node.style.left = `${Math.min(94, base.x + (location === 'room-window' || location === 'room-corner' ? n * 3 : n * 2))}%`;
    node.style.top = `${Math.max(8, base.y - (location === 'shelf' ? n * 4 : n * 1.5))}%`;
    layer.appendChild(node);
  });
}
function renderPlacementControls() {
  const itemSelect = $('#placementItem');
  const locationSelect = $('#placementLocation');
  if (!itemSelect || !locationSelect) return;
  const previous = itemSelect.value;
  const built = workshop.built.map(id => DECOR_CATALOG.find(item => item.id === id)).filter(Boolean);
  itemSelect.innerHTML = '';
  if (!built.length) {
    itemSelect.add(new Option('Build something first', ''));
    itemSelect.disabled = true;
    locationSelect.disabled = true;
    $('#placeItem').disabled = true;
    return;
  }
  itemSelect.disabled = false;
  built.forEach(item => itemSelect.add(new Option(`${item.icon} ${item.name}`, item.id)));
  itemSelect.value = built.some(item => item.id === previous) ? previous : built[0].id;
  updatePlacementOptions();
}
function updatePlacementOptions() {
  const id = $('#placementItem')?.value;
  const item = DECOR_CATALOG.find(entry => entry.id === id);
  const locationSelect = $('#placementLocation');
  if (!item || !locationSelect) return;
  const previous = workshop.placements[id] || (item.kind === 'furniture' ? 'room-window' : 'shelf');
  const options = item.kind === 'furniture'
    ? [['room-window','By the window'],['room-corner','Room corner'],['unplaced','Keep in collection']]
    : [['shelf','Display shelf'],['desk','Desk'],['nightstand','Nightstand'],['unplaced','Keep in collection']];
  locationSelect.innerHTML = '';
  options.forEach(([value,label]) => {
    const option = new Option(label, value);
    if (value === 'shelf' && !workshop.built.includes('display-shelf')) option.disabled = true;
    locationSelect.add(option);
  });
  const allowed = options.some(([value]) => value === previous && (value !== 'shelf' || workshop.built.includes('display-shelf')));
  locationSelect.value = allowed ? previous : (item.kind === 'furniture' ? 'room-window' : 'desk');
  $('#placeItem').disabled = false;
  $('#placementNote').textContent = item.kind === 'furniture'
    ? 'Furniture occupies a room position. Small decorations use the shelf, desk, or nightstand.'
    : workshop.built.includes('display-shelf') ? 'Choose a surface for this small decoration. You can move it again anytime.' : 'Build the display shelf to unlock shelf placement, or use the desk or nightstand for now.';
}
function renderWorkshop() {
  if (!$('#catalogGrid')) return;
  $('#workshopParts').textContent = `${workshop.materials} LUMEN`;
  $('#workshopPartFill').style.width = `${workshop.materialRemainderSeconds / 60 * 100}%`;
  $('#workshopTotal').textContent = `${Math.floor(workshop.totalSeconds / 60)} focused minutes collected · 1 lumen per focused minute`;
  const inventory = $('#workshopInventory');
  inventory.innerHTML = '';
  const builtItems = workshop.built.map(id => DECOR_CATALOG.find(item => item.id === id)).filter(Boolean);
  $('#builtCount').textContent = `${builtItems.length} item${builtItems.length === 1 ? '' : 's'}`;
  if (!builtItems.length) {
    const empty = document.createElement('span'); empty.className = 'inventory-empty'; empty.textContent = 'Nothing built yet. Choose a project from the catalog above.'; inventory.appendChild(empty);
  } else builtItems.forEach(item => {
    const chip = document.createElement('span'); chip.className = 'decor-chip';
    chip.textContent = `${item.icon} ${item.name}${workshop.placements[item.id] && workshop.placements[item.id] !== 'unplaced' ? ' · placed' : ' · unplaced'}`; inventory.appendChild(chip);
  });
  renderCatalog();
  renderPlacementControls();
  renderPlacedDecor();
  const decorSelect = $('#workshopDecor');
  if (decorSelect) {
    const previous = decorSelect.value; decorSelect.innerHTML = '';
    const available = builtItems;
    if (!available.length) decorSelect.add(new Option('Build an item first', ''));
    else available.forEach(item => decorSelect.add(new Option(`${item.icon} ${item.name}`, item.id)));
    if (available.some(item => item.id === previous)) decorSelect.value = previous;
  }
  if (workshop.activeGoal) {
    $('#workshopGoal').value = workshop.activeGoal.title;
    $('#workshopTarget').value = String(workshop.activeGoal.targetMinutes);
    if (builtItems.some(item => item.id === workshop.activeGoal.decorId)) decorSelect.value = workshop.activeGoal.decorId;
    const progress = Math.min(100, workshop.activeGoal.progressSeconds / (workshop.activeGoal.targetMinutes * 60) * 100);
    $('#workshopGoalProgress').hidden = false;
    $('#workshopProgressLabel').textContent = `${workshop.activeGoal.title} · ${DECOR_CATALOG.find(item => item.id === workshop.activeGoal.decorId)?.name || 'Project'}`;
    $('#workshopProgressValue').textContent = `${Math.floor(progress)}%`;
    $('#workshopProgressFill').style.width = `${progress}%`;
    $('#workshopProgressNote').textContent = workshop.activeGoal.complete ? 'Project goal reached. Your decoration is ready to celebrate.' : `${Math.floor(workshop.activeGoal.progressSeconds / 60)} of ${workshop.activeGoal.targetMinutes} focused minutes. Link sessions to this project to keep building.`;
  } else $('#workshopGoalProgress').hidden = true;
}
function buildItem(id) {
  const item = DECOR_CATALOG.find(entry => entry.id === id);
  if (!item || workshop.built.includes(id)) return;
  if (workshop.materials < item.cost) { notify(`You need ${item.cost - workshop.materials} more lumen.`); return; }
  workshop.materials -= item.cost;
  workshop.built.push(id);
  saveWorkshop(); renderWorkshop();
  notify(`${item.name} added to your collection.`);
}
function placeSelectedItem() {
  const id = $('#placementItem').value;
  const location = $('#placementLocation').value;
  const item = DECOR_CATALOG.find(entry => entry.id === id);
  if (!item || !workshop.built.includes(id)) return;
  if (location === 'shelf' && !workshop.built.includes('display-shelf')) return;
  workshop.placements[id] = location;
  saveWorkshop(); renderWorkshop();
  notify(`${item.name} placed.`);
}
function saveWorkshopGoal() {
  const title = $('#workshopGoal').value.trim();
  const decorId = $('#workshopDecor').value;
  const targetMinutes = Number($('#workshopTarget').value);
  if (!title || !decorId || !workshop.built.includes(decorId)) return;
  const previous = workshop.activeGoal;
  workshop.activeGoal = { title, decorId, targetMinutes, progressSeconds: previous && previous.title.toLowerCase() === title.toLowerCase() ? previous.progressSeconds : 0, complete: previous && previous.title.toLowerCase() === title.toLowerCase() ? Boolean(previous.complete) : false };
  saveWorkshop(); $('#sessionGoal').value = title; sessionGoal = title; renderWorkshop(); notify('Project saved. You can change or ignore it whenever you like.');
}
function creditFocusSession() {
  if (!currentSessionId) return;
  const totalFocusedSeconds = Math.max(0, selectedMinutes * 60 - timerSeconds);
  if (totalFocusedSeconds < MIN_QUALIFYING_SESSION_SECONDS) return;
  const previouslyCredited = Number(sessionStorage.getItem('nocturneCreditedSeconds') || 0);
  const focusedSeconds = Math.max(0, totalFocusedSeconds - previouslyCredited);
  if (focusedSeconds <= 0) return;
  sessionStorage.setItem('nocturneCreditedSeconds', String(totalFocusedSeconds));
  workshop.totalSeconds += focusedSeconds;
  const materialSeconds = workshop.materialRemainderSeconds + focusedSeconds;
  workshop.materials += Math.floor(materialSeconds / 60);
  workshop.materialRemainderSeconds = materialSeconds % 60;
  if (workshop.activeGoal && sessionGoal.trim().toLowerCase() === workshop.activeGoal.title.trim().toLowerCase()) {
    workshop.activeGoal.progressSeconds += focusedSeconds;
    if (workshop.activeGoal.progressSeconds >= workshop.activeGoal.targetMinutes * 60) workshop.activeGoal.complete = true;
  }
  saveWorkshop(); renderWorkshop();
  const earned = Math.floor(materialSeconds / 60);
  if (earned > 0) notify(`You collected ${earned} lumen from your focus session.`);
}
function notify(message, fromAster = false) {
  // Only personal notes addressed to the guest carry Aster's signature.
  toast.textContent = fromAster ? `${message} — Aster🌙` : message;
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('visible'), 1900);
}
function format(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function renderTimer() {
  const isBreak = timerMode === 'break';
  const value = format(isBreak ? breakSeconds : timerSeconds);
  const state = isBreak ? 'BALCONY BREAK' : timerMode === 'running' ? 'FOCUSING' : timerMode === 'paused' ? 'PAUSED' : timerMode === 'done' ? 'COMPLETE' : 'READY';
  $('#panelTimerReadout').textContent = format(timerSeconds);
  $('#timerReadout').textContent = value;
  $('#panelTimerState').textContent = state;
  $('#timerState').textContent = state;
  $('#focusCenterNote').textContent = isBreak ? 'Your focus timer is paused. Take a short break outside. — Aster🌙' : timerMode === 'done' ? `${sessionGoal ? `You made progress on: ${sessionGoal}. ` : 'You made space for focused time. '}Your reward: ${sessionReward}.` : timerMode === 'paused' ? 'Your session is paused. Resume when you are ready.' : 'Your room is quiet. Stay with one thing.';
  $('#focusOverlayPause').textContent = timerMode === 'running' ? 'Pause' : timerMode === 'done' ? 'Complete' : 'Resume';
  $('#focusOverlayPause').disabled = timerMode === 'done' || isBreak;
  $('#focusWorkActions').hidden = isBreak;
  $('#focusBreakActions').hidden = !isBreak;
  const button = $('#timerStartPause');
  if (timerMode === 'running') button.textContent = 'Pause session';
  else if (timerMode === 'paused') button.textContent = 'Resume session';
  else if (timerMode === 'break') button.textContent = 'Break in progress';
  else if (timerMode === 'done') button.textContent = 'Start again';
  else button.textContent = 'Start session';
  const total = selectedMinutes * 60;
  const elapsed = Math.max(0, total - timerSeconds);
  $('#focusProgressFill').style.width = `${Math.min(100, elapsed / total * 100)}%`;
  const markers = $('#focusBreakMarkers');
  markers.innerHTML = '';
  BREAK_MILESTONES.forEach(percent => {
    const line = document.createElement('i');
    line.style.left = `${percent * 100}%`;
    line.title = `${Math.round(percent * 100)}% break`;
    markers.appendChild(line);
  });
  focusExperience.hidden = !focusModeActive;
}
function stopTimerInterval() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerEnd = null;
}
function saveFocusState() {
  sessionStorage.setItem('nocturneFocusRemaining', String(timerSeconds));
  sessionStorage.setItem('nocturneFocusTotal', String(selectedMinutes));
  sessionStorage.setItem('nocturneCompletedBreaks', String(completedBreaks));
}
function beginBalconyBreak() {
  stopTimerInterval();
  timerMode = 'break';
  breakSeconds = BREAK_LENGTH_SECONDS;
  breakEnd = Date.now() + BREAK_LENGTH_SECONDS * 1000;
  sessionStorage.setItem('nocturneBreakEnd', String(breakEnd));
  saveFocusState();
  renderTimer();
  switchScene('balcony');
  const breakCard = document.getElementById('balconyBreakCard');
  if (breakCard) breakCard.hidden = false;
  timerInterval = setInterval(tickTimer, 250);
  notify('Take this moment to recollect your thoughts and breathe', true);
}
function skipBalconyBreak() {
  sessionStorage.removeItem('nocturneBreakEnd');
  breakEnd = null;
  breakSeconds = 0;
  timerMode = 'paused';
  switchScene('room');
  const breakCard = document.getElementById('balconyBreakCard');
  if (breakCard) breakCard.hidden = true;
  renderTimer();
  startTimer();
}
function tickTimer() {
  if (timerMode === 'break' && breakEnd) {
    breakSeconds = Math.max(0, Math.ceil((breakEnd - Date.now()) / 1000));
    renderTimer();
    if (breakSeconds === 0) {
      sessionStorage.removeItem('nocturneBreakEnd');
      breakEnd = null;
      timerMode = 'paused';
      clearInterval(timerInterval);
      timerInterval = null;
      switchScene('room');
      const breakCard = document.getElementById('balconyBreakCard');
      if (breakCard) breakCard.hidden = true;
      startTimer();
      notify('Break complete — focus session resumed');
    }
    return;
  }
  if (!timerEnd) return;
  timerSeconds = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
  saveFocusState();
  const elapsed = selectedMinutes * 60 - timerSeconds;
  const nextMilestone = BREAK_MILESTONES[completedBreaks];
  if (timerSeconds > 0 && nextMilestone !== undefined && elapsed >= Math.ceil(selectedMinutes * 60 * nextMilestone)) {
    completedBreaks += 1;
    sessionStorage.setItem('nocturneCompletedBreaks', String(completedBreaks));
    beginBalconyBreak();
    return;
  }
  renderTimer();
  if (timerSeconds === 0) {
    stopTimerInterval();
    timerMode = 'done';
    creditFocusSession();
    renderTimer();
    notify('Focus session complete');
  }
}
function startTimer() {
  if (timerMode === 'break') return;
  if (!currentSessionId) { currentSessionId = `focus-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; sessionStorage.setItem('nocturneFocusSessionId', currentSessionId); }
  timerEnd = Date.now() + timerSeconds * 1000;
  timerMode = 'running';
  timerInterval = setInterval(tickTimer, 250);
  renderTimer();
  notify('Focus session started');
}
function pauseTimer(message = 'Focus session paused') {
  if (timerMode !== 'running') return;
  tickTimer();
  if (timerMode !== 'running') return;
  stopTimerInterval();
  timerMode = 'paused';
  saveFocusState();
  renderTimer();
  notify(message);
}
function resetTimer() {
  stopTimerInterval();
  sessionStorage.removeItem('nocturneBreakEnd');
  sessionStorage.removeItem('nocturneResumeFocus');
  sessionStorage.removeItem('nocturneFocusSessionId');
  sessionStorage.removeItem('nocturneCreditedSeconds');
  currentSessionId = '';
  timerMode = 'ready';
  completedBreaks = 0;
  sessionStorage.setItem('nocturneCompletedBreaks', '0');
  breakSeconds = 0;
  breakEnd = null;
  timerSeconds = selectedMinutes * 60;
  saveFocusState();
  renderTimer();
  notify('Focus session reset');
}
function openPanel(panel) {
  closePanels();
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  controlScrim.classList.add('open');
  document.body.classList.add('panel-open');
  const firstControl = panel.querySelector('button, input');
  if (firstControl) firstControl.focus({ preventScroll: true });
}
function closePanels() {
  [focusPanel, musicPanel].forEach(panel => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  });
  controlScrim.classList.remove('open');
  document.body.classList.remove('panel-open');
}
function stopAmbience() {
  audioNodes.forEach(node => { try { node.stop(); } catch (_) {} });
  audioNodes = [];
  ambientGainNode = null;
}
function playAmbience(kind) {
  stopAmbience();
  if (kind === 'Off') return;
  if ($('#localAudio').src && !$('#localAudio').paused) $('#localAudio').pause();
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const gain = audioContext.createGain();
    gain.gain.value = Number($('#musicVolume').value) / 100 * 0.09;
    gain.connect(audioContext.destination);
    ambientGainNode = gain;
    if (kind === 'Soft rain') {
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * .22;
      const noise = audioContext.createBufferSource();
      noise.buffer = buffer; noise.loop = true; noise.connect(gain); noise.start(); audioNodes.push(noise);
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 1100;
      noise.disconnect(); noise.connect(filter); filter.connect(gain);
    } else {
      const osc = audioContext.createOscillator();
      osc.type = kind === 'Night wind' ? 'sine' : 'triangle';
      osc.frequency.value = kind === 'Night wind' ? 92 : 58;
      const filter = audioContext.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = kind === 'Night wind' ? 190 : 230;
      osc.connect(filter); filter.connect(gain); osc.start(); audioNodes.push(osc);
    }
  } catch (_) {
    notify('Ambient audio is unavailable in this browser');
  }
}
function updateSoundButtons() {
  document.querySelectorAll('[data-sound]').forEach(button => {
    button.classList.toggle('active', button.dataset.sound === sounds[soundIndex]);
  });
}
function tryFullscreen() {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

// Object hover labels and room interactions.
document.querySelectorAll('.object-hit').forEach(button => {
  button.addEventListener('pointerenter', () => {
    if (document.body.classList.contains('panel-open')) return;
    hoverTooltip.textContent = button.dataset.tooltip;
    hoverTooltip.classList.add('visible');
  });
  button.addEventListener('pointermove', event => {
    hoverTooltip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - 245)}px`;
    hoverTooltip.style.top = `${Math.max(12, event.clientY - 48)}px`;
  });
  button.addEventListener('pointerleave', () => hoverTooltip.classList.remove('visible'));
  button.addEventListener('focus', () => {
    hoverTooltip.textContent = button.dataset.tooltip;
    hoverTooltip.classList.add('visible');
  });
  button.addEventListener('blur', () => hoverTooltip.classList.remove('visible'));
  button.addEventListener('click', () => {
    tryFullscreen();
    hoverTooltip.classList.remove('visible');
    switch (button.dataset.object) {
      case 'lamp':
        lightIndex = (lightIndex + 1) % lights.length;
        room.style.filter = lights[lightIndex].filter;
        notify(lights[lightIndex].name);
        break;
      case 'tablet': openPanel(focusPanel); break;
      case 'speaker': openPanel(musicPanel); break;
      case 'door': switchScene('balcony'); break;
    }
  });
});

function enterFocusMode() {
  focusModeActive = true;
  closePanels();
  document.body.classList.add('focus-active');
  // Fullscreen is requested directly from the Start button gesture when supported.
  tryFullscreen();
  renderTimer();
}
function exitFocusMode(pauseRunning = true) {
  if (pauseRunning && timerMode === 'running') pauseTimer('Focus mode ended');
  if (pauseRunning) creditFocusSession();
  focusModeActive = false;
  document.body.classList.remove('focus-active');
  focusExperience.hidden = true;
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  renderTimer();
}
function toggleFocusOverlayPause() {
  if (timerMode === 'running') pauseTimer();
  else if (timerMode === 'paused') startTimer();
}

// Focus session settings.
document.querySelectorAll('[data-minutes]').forEach(button => {
  button.addEventListener('click', () => {
    if (timerMode === 'running') pauseTimer('Session paused to change its length');
    selectedMinutes = Number(button.dataset.minutes);
    $('#customMinutes').value = selectedMinutes;
    document.querySelectorAll('[data-minutes]').forEach(item => item.classList.toggle('active', item === button));
    resetTimer();
  });
});
$('#applyCustom').addEventListener('click', () => {
  const value = Number($('#customMinutes').value);
  if (!Number.isInteger(value) || value < 1 || value > 180) {
    notify('Choose a session between 1 and 180 minutes');
    return;
  }
  if (timerMode === 'running') pauseTimer('Session paused to change its length');
  selectedMinutes = value;
  document.querySelectorAll('[data-minutes]').forEach(item => item.classList.remove('active'));
  resetTimer();
});
$('#timerStartPause').addEventListener('click', () => {
  if (timerMode === 'running') pauseTimer();
  else {
    if (timerMode === 'done') resetTimer();
    sessionGoal = $('#sessionGoal').value.trim() || (workshop.activeGoal ? workshop.activeGoal.title : '');
    $('#sessionGoal').value = sessionGoal;
    sessionReward = $('#sessionReward').value;
    sessionStorage.setItem('nocturneSessionGoal', sessionGoal);
    sessionStorage.setItem('nocturneSessionReward', sessionReward);
    enterFocusMode();
    startTimer();
  }
});
$('#saveWorkshopGoal').addEventListener('click', saveWorkshopGoal);
$('#placeItem')?.addEventListener('click', placeSelectedItem);
$('#placementItem')?.addEventListener('change', updatePlacementOptions);
document.querySelectorAll('[data-catalog-filter]').forEach(button => button.addEventListener('click', () => { catalogFilter = button.dataset.catalogFilter; document.querySelectorAll('[data-catalog-filter]').forEach(item => item.classList.toggle('active', item === button)); renderCatalog(); }));
$('#timerReset').addEventListener('click', () => {
  if (focusModeActive) exitFocusMode(false);
  resetTimer();
});
$('#focusOverlayPause').addEventListener('click', toggleFocusOverlayPause);
$('#focusOverlayEnd').addEventListener('click', () => exitFocusMode(true));
$('#skipBalconyBreak').addEventListener('click', skipBalconyBreak);
$('#goBalconyBreak').addEventListener('click', () => { saveFocusState(); });

// Music and ambience controls.
document.querySelectorAll('[data-sound]').forEach(button => {
  button.addEventListener('click', () => {
    const selected = button.dataset.sound;
    soundIndex = sounds.indexOf(selected);
    const audio = $('#localAudio');
    if (!audio.paused) { audio.pause(); $('#musicPlayPause').textContent = 'Play'; }
    playAmbience(selected);
    updateSoundButtons();
    notify(selected === 'Off' ? 'Ambience off' : `${selected} ambience`);
  });
});
$('#audioFile').addEventListener('change', event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (localAudioUrl) URL.revokeObjectURL(localAudioUrl);
  localAudioUrl = URL.createObjectURL(file);
  const audio = $('#localAudio');
  audio.src = localAudioUrl;
  audio.volume = Number($('#musicVolume').value) / 100;
  $('#selectedTrack').textContent = file.name;
  $('#musicPlayPause').disabled = false;
  $('#musicPlayPause').textContent = 'Play';
  stopAmbience();
  soundIndex = 0;
  updateSoundButtons();
  notify('Track ready to play');
});
$('#musicPlayPause').addEventListener('click', async () => {
  const audio = $('#localAudio');
  if (!audio.src) return;
  if (audio.paused) {
    try { await audio.play(); $('#musicPlayPause').textContent = 'Pause'; }
    catch (_) { notify('This audio file could not be played'); }
  } else {
    audio.pause(); $('#musicPlayPause').textContent = 'Play';
  }
});
$('#localAudio').addEventListener('ended', () => { $('#musicPlayPause').textContent = 'Play'; });
$('#musicStop').addEventListener('click', () => {
  const audio = $('#localAudio');
  audio.pause(); audio.currentTime = 0;
  $('#musicPlayPause').textContent = 'Play';
  stopAmbience(); soundIndex = 0; updateSoundButtons();
  notify('Playback stopped');
});
$('#musicVolume').addEventListener('input', event => {
  const value = Number(event.target.value);
  $('#volumeValue').textContent = `${value}%`;
  $('#localAudio').volume = value / 100;
  if (ambientGainNode && audioContext) ambientGainNode.gain.value = value / 100 * 0.09;
});

// Close panels by tapping outside, using the close button, or pressing Escape.
controlScrim.addEventListener('click', closePanels);
document.querySelectorAll('[data-close-panel]').forEach(button => button.addEventListener('click', closePanels));
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (document.body.classList.contains('panel-open')) closePanels();
  else if (focusModeActive) exitFocusMode(true);
});

// Pause a running focus session if the page is hidden or left.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && timerMode === 'running') pauseTimer('Focus session paused while you were away');
});

// Restore a scheduled balcony break or resume the focus session after its break ends.
(() => {
  const savedTotal = Number(sessionStorage.getItem('nocturneFocusTotal'));
  const savedRemaining = Number(sessionStorage.getItem('nocturneFocusRemaining'));
  if (savedTotal > 0 && savedRemaining >= 0) {
    selectedMinutes = savedTotal;
    timerSeconds = Math.min(savedRemaining, savedTotal * 60);
    $('#customMinutes').value = savedTotal;
    completedBreaks = Math.min(BREAK_MILESTONES.length, Math.max(0, Number(sessionStorage.getItem('nocturneCompletedBreaks') || 0)));
    document.querySelectorAll('[data-minutes]').forEach(item => item.classList.toggle('active', Number(item.dataset.minutes) === savedTotal));
  }
  const savedBreakEnd = Number(sessionStorage.getItem('nocturneBreakEnd'));
  if (savedBreakEnd && savedBreakEnd > Date.now()) {
    breakEnd = savedBreakEnd;
    breakSeconds = Math.ceil((breakEnd - Date.now()) / 1000);
    timerMode = 'break';
    switchScene('balcony');
    const breakCard = document.getElementById('balconyBreakCard');
    if (breakCard) breakCard.hidden = false;
    focusModeActive = true;
    document.body.classList.add('focus-active');
    timerInterval = setInterval(tickTimer, 250);
  } else if (sessionStorage.getItem('nocturneResumeFocus') === 'yes' && timerSeconds > 0) {
    sessionStorage.removeItem('nocturneResumeFocus');
    focusModeActive = true;
    document.body.classList.add('focus-active');
    startTimer();
    notify('Break complete — welcome back. Your focus session has resumed.');
  }
})();

// Room and balcony are two scenes in one page, so Aster and the tour never unmount.
function switchScene(scene) {
  const roomInterior = document.getElementById('roomInterior');
  const balconyScene = document.getElementById('balconyScene');
  if (!roomInterior || !balconyScene) return;
  const outside = scene === 'balcony';
  roomInterior.hidden = outside;
  balconyScene.hidden = !outside;
  document.body.classList.toggle('on-balcony', outside);
}
document.getElementById('returnInside')?.addEventListener('click', () => {
  switchScene('room');
  const tour = document.getElementById('asterTour');
  const line = document.getElementById('asterLine');
  const next = document.getElementById('nextTour');
  if (tour && !tour.hidden && line && next && line.textContent.includes('return inside')) {
    line.textContent = 'Welcome back. The room feels a little different after a moment outside, doesn’t it? Shall we continue?';
    next.disabled = false;
    next.textContent = 'Continue →';
  }
});
document.getElementById('breakReturnInside')?.addEventListener('click', () => switchScene('room'));
document.getElementById('goBalconyBreak')?.addEventListener('click', () => {
  if (timerMode === 'break') switchScene('balcony');
});

$('#fullscreenButton').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch (_) { notify('Fullscreen is not available in this browser'); }
});


// Aster's compact, interactive welcome tour. Highlighted objects must be explored before continuing.
(() => {
  const tour = document.getElementById('asterTour');
  const line = document.getElementById('asterLine');
  const portrait = document.getElementById('asterPortrait');
  const stepLabel = document.getElementById('tourStep');
  const next = document.getElementById('nextTour');
  const skip = document.getElementById('skipTour');
  const replay = document.getElementById('replayTour');
  if (!tour || !line || !portrait || !next || !skip || !replay) return;

  const steps = [
    { image: 'assets/aster-welcome.png', label: 'WELCOME', text: 'Oh... hello. You must be the new guest. Welcome to Room 804.' },
    { image: 'assets/aster-neutral.png', label: 'A LITTLE ABOUT ME', text: "I'm Aster. I used to stay here, actually. Now I help guests find their way around. You needn't remember everything." },
    { image: 'assets/aster-curious.png', label: 'THE ROOM', text: 'Most things here respond when you select them. Let me show you. Try the lamp, if you would.' },
    { image: 'assets/aster-curious.png', label: 'THE LAMP', text: 'There. The lamp changes the room lighting. A small thing, perhaps, but I find the warmer setting rather comforting.', object: 'lamp' },
    { image: 'assets/aster-neutral.png', label: 'THE TABLET', text: 'The tablet holds your focus controls. You can choose a session length or simply begin. Would you open it for me?', object: 'tablet' },
    { image: 'assets/aster-amused.png', label: 'THE SPEAKER', text: 'And the speaker handles music and ambience. Rain sounds are quite nice here. Try opening its controls.', object: 'speaker' },
    { image: 'assets/aster-welcome.png', label: 'THE BALCONY', text: 'That door leads to the balcony. A good place to take a breather... during a break, or whenever you like. Shall we have a look?', object: 'door' },
    { image: 'assets/aster-amused.png', label: 'THE LITTLE WORKSHOP', text: 'There is also a little Workshop tucked inside the tablet panel. Entirely optional. I... may have become rather fond of it.' },
    { image: 'assets/aster-neutral.png', label: 'SEE YOU AROUND', text: "That is all for now. If you need me, the Hotel Guide button will bring me back. I'll be nearby." }
  ];
  const TOUR_VERSION = '5';
  let index = 0;
  let replaying = false;
  let interacted = false;
  const hotspots = [...document.querySelectorAll('.object-hit')];

  function clearHighlight() {
    hotspots.forEach(button => button.classList.remove('tour-highlight'));
  }
  function showStep() {
    clearHighlight();
    const current = steps[index];
    interacted = !current.object;
    portrait.src = current.image;
    line.textContent = index === 0 && replaying
      ? 'Oh, you again. Welcome back. I hope Room 804 has been treating you kindly. Shall we take another look around?'
      : current.text;
    stepLabel.textContent = current.label;
    if (current.object) {
      const target = hotspots.find(button => button.dataset.object === current.object);
      if (target) target.classList.add('tour-highlight');
      else interacted = true; // A missing hotspot should never trap the guest in the tour.
    }
    next.disabled = !interacted;
    next.textContent = interacted ? (index === steps.length - 1 ? 'Finish ✦' : 'Next →') : 'Try it first';
  }
  function closeTour() {
    tour.hidden = true;
    clearHighlight();
    localStorage.setItem('nocturneAsterTourSeen', 'yes');
    localStorage.setItem('nocturneAsterTourVersion', TOUR_VERSION);
    sessionStorage.removeItem('nocturneAsterTourStep');
  }
  function startTour(isReplay = false) {
    closePanels();
    replaying = isReplay;
    const savedStep = sessionStorage.getItem('nocturneAsterTourStep');
    index = savedStep !== null ? Math.min(Number(savedStep), steps.length - 1) : 0;
    sessionStorage.removeItem('nocturneAsterTourStep');
    showStep();
    tour.hidden = false;
  }

  hotspots.forEach(button => button.addEventListener('click', () => {
    const current = steps[index];
    if (!tour.hidden && current && current.object === button.dataset.object) {
      interacted = true;
      next.disabled = false;
      next.textContent = index === steps.length - 1 ? 'Finish ✦' : 'Continue →';
      button.classList.remove('tour-highlight');
      if (current.object === 'door') {
        switchScene('balcony');
        line.textContent = "Lovely, isn't it? Take your time out here. When you're ready, return inside and we'll finish our little tour.";
        next.disabled = true;
        next.textContent = 'Return inside first';
      } else {
        line.textContent = 'There we are. You can explore that whenever you like. Shall we continue?';
      }
    }
  }));

  next.addEventListener('click', () => {
    if (next.disabled) return;
    if (index < steps.length - 1) { closePanels(); index += 1; showStep(); }
    else closeTour();
  });
  skip.addEventListener('click', closeTour);
  replay.addEventListener('click', () => startTour(true));

  if (localStorage.getItem('nocturneAsterTourVersion') !== TOUR_VERSION) {
    window.setTimeout(() => startTour(false), 650);
  }
})();

renderTimer();
renderWorkshop();
