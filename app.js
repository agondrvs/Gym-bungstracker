// Gym Tracker – alle Daten liegen im localStorage dieses Geräts.

const STORAGE_KEY = 'gym-tracker-v1';

// Startübungen. type "bodyweight" = Körpergewicht mit optionalem Zusatzgewicht,
// type "weight" = Übung mit Gewicht (Hantel, Kabel, Maschine).
const DEFAULT_EXERCISES = [
  { name: 'Klimmzüge', type: 'bodyweight' },
  { name: 'Dips', type: 'bodyweight' },
  { name: 'Pushups', type: 'bodyweight' },
  { name: 'Chin ups', type: 'bodyweight' },
  { name: 'Rudern (oberer Rücken)', type: 'weight' },
  { name: 'Bicepscurls', type: 'weight' },
  { name: 'Tricep pushdown', type: 'weight' },
];

const ICON_TRASH = '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Konnte Daten nicht laden', e);
  }
  return {
    exercises: DEFAULT_EXERCISES.map(e => ({ id: uid(), ...e })),
    sets: [], // { id, exerciseId, date: ISO-String (Ortszeit), reps, weight }
  };
}

let state = loadState();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
save();

// ---------- Hilfsfunktionen ----------
const $ = sel => document.querySelector(sel);
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const dayKey = iso => iso.slice(0, 10);
const todayKey = () => dateKey(new Date());
const localIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
};
const exerciseById = id => state.exercises.find(e => e.id === id);
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = n => String(n).replace('.', ',');

function formatWeight(exercise, weight) {
  if (!exercise || exercise.type === 'bodyweight') {
    if (!weight) return 'Körpergewicht';
    return weight > 0 ? `+${fmtNum(weight)} kg` : `${fmtNum(weight)} kg`;
  }
  return `${fmtNum(weight)} kg`;
}

const formatDateLong = key =>
  keyToDate(key).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
const formatDateShort = key =>
  keyToDate(key).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });

let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

// Eigener Bestätigungsdialog statt dem grauen Browser-Fenster
function confirmDialog(text, okLabel = 'Löschen') {
  const dlg = $('#confirm-dialog');
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okLabel;
  dlg.showModal();
  return new Promise(resolve => {
    const done = result => {
      dlg.close();
      $('#confirm-ok').onclick = $('#confirm-cancel').onclick = null;
      resolve(result);
    };
    $('#confirm-ok').onclick = () => done(true);
    $('#confirm-cancel').onclick = () => done(false);
    dlg.oncancel = () => done(false);
  });
}

// ---------- Navigation ----------
document.querySelectorAll('.tabbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + btn.dataset.view));
    window.scrollTo(0, 0);
    render();
  });
});

// ---------- Training ----------
let selectedExerciseId = state.exercises[0]?.id;
const repsInput = $('#reps-input');
const weightInput = $('#weight-input');

function selectExercise(id) {
  selectedExerciseId = id;
  const last = lastSetOf(id);
  repsInput.value = last ? last.reps : 10;
  weightInput.value = last ? last.weight : 0;
  updateEntryInfo();
  renderChips();
}

const lastSetOf = id => [...state.sets].reverse().find(s => s.exerciseId === id);

// Titel, Gewichts-Beschriftung und "Zuletzt"-Zeile der gewählten Übung
function updateEntryInfo() {
  const ex = exerciseById(selectedExerciseId);
  $('.entry').style.display = ex ? '' : 'none';
  if (!ex) return;
  const last = lastSetOf(ex.id);
  $('#entry-title').textContent = ex.name;
  $('#weight-label').textContent = ex.type === 'bodyweight' ? 'Zusatzgewicht (kg)' : 'Gewicht (kg)';
  $('#last-info').textContent = last
    ? `Zuletzt: ${last.reps} × ${formatWeight(ex, last.weight)} · ${formatDateShort(dayKey(last.date))}`
    : 'Noch keine Sätze für diese Übung';
}

// Vergleicht ohne Groß/Klein und ohne Umlaute, damit "klimmzuge" auch "Klimmzüge" findet
const normalize = text => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const searchInput = $('#exercise-search');

function filteredExercises() {
  const query = normalize(searchInput.value.trim());
  return state.exercises.filter(ex => normalize(ex.name).includes(query));
}

function renderChips() {
  const wrap = $('#exercise-chips');
  wrap.innerHTML = '';
  $('#search-clear').hidden = !searchInput.value;
  const matches = filteredExercises();
  if (!matches.length) {
    wrap.innerHTML = '<span class="chips-empty">Keine Übung gefunden – unter „Übungen“ kannst du sie anlegen</span>';
    return;
  }
  matches.forEach(ex => {
    const b = document.createElement('button');
    b.className = 'chip' + (ex.id === selectedExerciseId ? ' active' : '');
    b.textContent = ex.name;
    b.addEventListener('click', () => pickExercise(ex.id));
    wrap.appendChild(b);
  });
}

// Übung auswählen, Suche zurücksetzen und Tastatur schließen
function pickExercise(id) {
  searchInput.value = '';
  searchInput.blur();
  selectExercise(id);
  $('#exercise-chips').scrollLeft = 0;
}

searchInput.addEventListener('input', () => {
  renderChips();
  $('#exercise-chips').scrollLeft = 0;
});
// Enter auf der Tastatur wählt den ersten Treffer
searchInput.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const first = filteredExercises()[0];
  if (first) pickExercise(first.id);
});
$('#search-clear').addEventListener('click', () => {
  searchInput.value = '';
  renderChips();
  searchInput.focus();
});

// Plus/Minus-Knöpfe
document.querySelectorAll('.step-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    let value = (parseFloat(input.value) || 0) + parseFloat(btn.dataset.step);
    if (input === repsInput) value = Math.max(1, value);
    input.value = Math.round(value * 100) / 100;
  });
});

$('#add-set-btn').addEventListener('click', () => {
  const reps = parseInt(repsInput.value, 10);
  const weight = parseFloat(String(weightInput.value).replace(',', '.')) || 0;
  if (!selectedExerciseId) return toast('Bitte zuerst eine Übung anlegen');
  if (!reps || reps < 1) return toast('Bitte Wiederholungen eingeben');
  state.sets.push({ id: uid(), exerciseId: selectedExerciseId, date: localIso(), reps, weight });
  save();
  toast('Satz gespeichert');
  render();
});

function renderSetGroups(sets, container) {
  // Sätze nach Übung gruppieren (Reihenfolge des ersten Auftretens)
  const groups = new Map();
  sets.forEach(s => {
    if (!groups.has(s.exerciseId)) groups.set(s.exerciseId, []);
    groups.get(s.exerciseId).push(s);
  });
  groups.forEach((groupSets, exId) => {
    const ex = exerciseById(exId);
    const div = document.createElement('div');
    div.className = 'group';
    div.innerHTML = `<div class="group-title">${escapeHtml(ex ? ex.name : 'Gelöschte Übung')}<small>${groupSets.length} ${groupSets.length === 1 ? 'Satz' : 'Sätze'}</small></div>`;
    const ul = document.createElement('ul');
    ul.className = 'list';
    groupSets.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="set-num">${i + 1}</span><span class="set-text"><b>${s.reps}</b> Wdh. · ${formatWeight(ex, s.weight)}</span>`;
      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.setAttribute('aria-label', 'Satz löschen');
      del.innerHTML = ICON_TRASH;
      del.addEventListener('click', async () => {
        if (!(await confirmDialog('Diesen Satz löschen?'))) return;
        state.sets = state.sets.filter(x => x.id !== s.id);
        save();
        render();
      });
      li.appendChild(del);
      ul.appendChild(li);
    });
    div.appendChild(ul);
    container.appendChild(div);
  });
}

function renderTraining() {
  $('#today-label').textContent = formatDateLong(todayKey());
  if (!exerciseById(selectedExerciseId)) {
    selectedExerciseId = state.exercises[0]?.id;
    if (selectedExerciseId) selectExercise(selectedExerciseId);
  }
  renderChips();
  updateEntryInfo();

  const list = $('#today-list');
  list.innerHTML = '';
  const todaySets = state.sets.filter(s => dayKey(s.date) === todayKey());
  if (!todaySets.length) {
    list.innerHTML = '<p class="empty">Heute noch keine Sätze</p>';
    return;
  }
  renderSetGroups(todaySets, list);
}

// ---------- Kalender ----------
const now = new Date();
let calYear = now.getFullYear();
let calMonth = now.getMonth();
let selectedDay = todayKey();

$('#cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
$('#cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });

function renderCalendar() {
  const trainedDays = new Set(state.sets.map(s => dayKey(s.date)));
  const monthPrefix = `${calYear}-${pad(calMonth + 1)}`;
  const today = todayKey();

  // Statistik
  const monthSets = state.sets.filter(s => s.date.startsWith(monthPrefix));
  const monthDays = new Set(monthSets.map(s => dayKey(s.date))).size;
  $('#stats').innerHTML = `
    <div class="stat"><b>${monthDays}</b><span>Trainings im Monat</span></div>
    <div class="stat"><b>${monthSets.length}</b><span>Sätze im Monat</span></div>
    <div class="stat"><b>${trainedDays.size}</b><span>Trainings gesamt</span></div>`;

  // Monatsraster (Woche beginnt am Montag)
  $('#cal-title').textContent = new Date(calYear, calMonth, 1)
    .toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const grid = $('#cal-grid');
  grid.innerHTML = '';
  const offset = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  for (let i = 0; i < offset; i++) grid.appendChild(document.createElement('span'));
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${monthPrefix}-${pad(d)}`;
    const b = document.createElement('button');
    b.className = 'cal-day';
    if (trainedDays.has(key)) b.classList.add('trained');
    if (key === today) b.classList.add('today');
    if (key > today) b.classList.add('future');
    if (key === selectedDay) b.classList.add('selected');
    b.textContent = d;
    b.addEventListener('click', () => { selectedDay = key; renderCalendar(); });
    grid.appendChild(b);
  }

  // Details zum ausgewählten Tag
  $('#day-title').textContent = formatDateLong(selectedDay);
  const list = $('#day-list');
  list.innerHTML = '';
  const daySets = state.sets.filter(s => dayKey(s.date) === selectedDay);
  if (!daySets.length) {
    list.innerHTML = '<p class="empty">Kein Training an diesem Tag</p>';
    return;
  }
  renderSetGroups(daySets, list);
}

// ---------- Übungen ----------
let newExerciseType = 'bodyweight';
document.querySelectorAll('#new-exercise-type button').forEach(btn => {
  btn.addEventListener('click', () => {
    newExerciseType = btn.dataset.type;
    document.querySelectorAll('#new-exercise-type button').forEach(b => b.classList.toggle('active', b === btn));
  });
});

$('#add-exercise-btn').addEventListener('click', () => {
  const input = $('#new-exercise-name');
  const name = input.value.trim();
  if (!name) return toast('Bitte einen Namen eingeben');
  if (state.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) {
    return toast('Diese Übung gibt es schon');
  }
  state.exercises.push({ id: uid(), name, type: newExerciseType });
  save();
  input.value = '';
  toast(`${name} hinzugefügt`);
  render();
});

function renderExercises() {
  const ul = $('#exercise-list');
  ul.innerHTML = '';
  state.exercises.forEach(ex => {
    const count = state.sets.filter(s => s.exerciseId === ex.id).length;
    const li = document.createElement('li');
    li.innerHTML = `<div class="list-main"><div>${escapeHtml(ex.name)}</div><span>${ex.type === 'bodyweight' ? 'Körpergewicht + Zusatzgewicht' : 'Mit Gewicht'} · ${count} ${count === 1 ? 'Satz' : 'Sätze'}</span></div>`;
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.setAttribute('aria-label', 'Übung entfernen');
    del.innerHTML = ICON_TRASH;
    del.addEventListener('click', async () => {
      const msg = count
        ? `„${ex.name}“ entfernen? Die ${count} gespeicherten Sätze werden ebenfalls gelöscht.`
        : `„${ex.name}“ entfernen?`;
      if (!(await confirmDialog(msg, 'Entfernen'))) return;
      state.exercises = state.exercises.filter(e => e.id !== ex.id);
      state.sets = state.sets.filter(s => s.exerciseId !== ex.id);
      save();
      render();
    });
    li.appendChild(del);
    ul.appendChild(li);
  });
}

// ---------- Backup ----------
$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gym-tracker-backup-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.exercises) || !Array.isArray(data.sets)) throw new Error('Ungültiges Format');
    if (!(await confirmDialog('Aktuelle Daten durch das Backup ersetzen?', 'Ersetzen'))) return;
    state = data;
    save();
    toast('Backup importiert');
    render();
  } catch (err) {
    toast('Import fehlgeschlagen');
  }
});

// ---------- Start ----------
function render() {
  renderTraining();
  renderCalendar();
  renderExercises();
}
if (selectedExerciseId) selectExercise(selectedExerciseId);
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
