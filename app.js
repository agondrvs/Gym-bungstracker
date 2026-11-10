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
// Ältere Daten haben noch keine Körpergewicht-Liste
state.bodyweights ??= []; // { id, date: 'JJJJ-MM-TT', kg }
// Splits: { id, name, days: [{ id, name, exerciseIds: [] }] }
state.splits ??= [];
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
    if (input === weightInput) value = Math.max(0, value); // Gewicht nie unter 0 kg
    if (input === bodyInput) value = Math.max(0, Math.round(value * 10) / 10);
    input.value = Math.round(value * 100) / 100;
  });
});

$('#add-set-btn').addEventListener('click', () => {
  const reps = parseInt(repsInput.value, 10);
  const weight = Math.max(0, parseFloat(String(weightInput.value).replace(',', '.')) || 0);
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
  renderTrainingMode();
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

// ---------- Split ----------
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>';
let selectedDayId = null; // gewählter Tag im aktiven Split
const drafts = {};        // Eingaben pro Übung (Sätze, Wdh., kg), bis sie abgehakt wird

const splitById = id => state.splits.find(s => s.id === id);
const activeSplit = () => splitById(state.activeSplitId) || state.splits[0];
const todaySetsOf = exId => state.sets.filter(s => s.exerciseId === exId && dayKey(s.date) === todayKey());
// Ohne eigene Wahl: Split-Modus, sobald es einen Split gibt
const trainingMode = () => state.trainingMode || (state.splits.length ? 'split' : 'free');

document.querySelectorAll('#training-mode button').forEach(btn => {
  btn.addEventListener('click', () => {
    state.trainingMode = btn.dataset.mode;
    save();
    renderTraining();
  });
});

function renderTrainingMode() {
  const mode = trainingMode();
  document.querySelectorAll('#training-mode button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('#split-area').hidden = mode !== 'split';
  $('#free-area').hidden = mode !== 'free';
  // Die Abhak-Liste zeigt schon alles von heute, deshalb "Heute" nur im Einzeln-Modus
  $('#today-list').hidden = mode === 'split';
  $('#today-list').previousElementSibling.hidden = mode === 'split';
  if (mode === 'split') renderSplitArea();
}

// Vorschlag: der Tag nach dem zuletzt trainierten Split-Tag. Heute schon angefangen -> derselbe Tag.
function suggestedDay(split) {
  const dayIds = split.days.map(d => d.id);
  const last = [...state.sets].reverse().find(s => dayIds.includes(s.splitDayId));
  if (!last) return split.days[0];
  const idx = dayIds.indexOf(last.splitDayId);
  if (dayKey(last.date) === todayKey()) return split.days[idx];
  return split.days[(idx + 1) % split.days.length];
}

// "3 × 10 · 40 kg", bei unterschiedlichen Sätzen "3 Sätze · 10/8/8 Wdh. · 40 kg"
function summarizeSets(ex, sets) {
  const same = sets.every(s => s.reps === sets[0].reps && s.weight === sets[0].weight);
  const w = formatWeight(ex, sets.at(-1).weight);
  return same
    ? `${sets.length} × ${sets[0].reps} Wdh. · ${w}`
    : `${sets.length} Sätze · ${sets.map(s => s.reps).join('/')} Wdh. · ${w}`;
}

// Sätze vom letzten Tag, an dem die Übung gemacht wurde
function lastSessionOf(exId) {
  const last = lastSetOf(exId);
  if (!last) return [];
  return state.sets.filter(s => s.exerciseId === exId && dayKey(s.date) === dayKey(last.date));
}

// Startwerte fürs Abhaken: wie beim letzten Mal, sonst 3 × 10
function draftFor(ex) {
  if (!drafts[ex.id]) {
    const prev = lastSessionOf(ex.id);
    drafts[ex.id] = prev.length
      ? { sets: Math.min(prev.length, 10), reps: prev.at(-1).reps, weight: prev.at(-1).weight }
      : { sets: 3, reps: 10, weight: 0 };
  }
  return drafts[ex.id];
}

function renderSplitArea() {
  const split = activeSplit();
  $('#split-empty').hidden = !!split;
  $('#split-content').hidden = !split;
  if (!split) return;
  state.activeSplitId = split.id;

  // Split-Auswahl (nur sichtbar, wenn es mehrere gibt)
  const sc = $('#split-chips');
  sc.innerHTML = '';
  sc.hidden = state.splits.length < 2;
  state.splits.forEach(sp => {
    const b = document.createElement('button');
    b.className = 'chip' + (sp.id === split.id ? ' active' : '');
    b.textContent = sp.name;
    b.addEventListener('click', () => {
      state.activeSplitId = sp.id;
      selectedDayId = null;
      save();
      renderSplitArea();
    });
    sc.appendChild(b);
  });

  // Tage des Splits
  const suggestion = suggestedDay(split);
  if (!split.days.some(d => d.id === selectedDayId)) selectedDayId = suggestion.id;
  const dc = $('#day-chips');
  dc.innerHTML = '';
  split.days.forEach(d => {
    const b = document.createElement('button');
    b.className = 'chip' + (d.id === selectedDayId ? ' active' : '');
    b.innerHTML = escapeHtml(d.name) + (d.id === suggestion.id ? '<small>dran</small>' : '');
    b.addEventListener('click', () => { selectedDayId = d.id; renderSplitArea(); });
    dc.appendChild(b);
  });

  // Abhak-Liste für den gewählten Tag
  const day = split.days.find(d => d.id === selectedDayId);
  const exercises = day.exerciseIds.map(exerciseById).filter(Boolean);
  const done = exercises.filter(ex => todaySetsOf(ex.id).length).length;
  $('#day-name').textContent = day.name;
  $('#day-progress').textContent = exercises.length
    ? (done === exercises.length ? `Alle ${done} Übungen erledigt 💪` : `${done} von ${exercises.length} erledigt`)
    : 'Noch keine Übungen – tipp auf den Stift';
  $('#day-progress-bar').style.width = exercises.length ? `${(done / exercises.length) * 100}%` : '0';
  const ul = $('#check-list');
  ul.innerHTML = '';
  exercises.forEach(ex => ul.appendChild(renderCheckRow(ex, day)));
}

function renderCheckRow(ex, day) {
  const li = document.createElement('li');
  const today = todaySetsOf(ex.id);
  const done = today.length > 0;
  li.className = done ? 'done' : '';

  const btn = document.createElement('button');
  btn.className = 'check-btn';
  btn.setAttribute('aria-label', done ? `${ex.name} nicht mehr abhaken` : `${ex.name} abhaken`);
  btn.innerHTML = ICON_CHECK;
  li.appendChild(btn);

  const main = document.createElement('div');
  main.className = 'check-main';
  if (done) {
    main.innerHTML = `<div class="check-name">${escapeHtml(ex.name)}</div><div class="check-sub">${summarizeSets(ex, today)}</div>`;
    btn.addEventListener('click', () => undoExercise(ex));
  } else {
    const d = draftFor(ex);
    const prev = lastSessionOf(ex.id);
    main.innerHTML = `
      <div class="check-name">${escapeHtml(ex.name)}</div>
      <div class="check-sub">${prev.length ? `Zuletzt: ${summarizeSets(ex, prev)}` : 'Noch nie gemacht'}</div>
      <div class="mini-fields">
        <label class="mini-field"><span>Sätze</span><input data-k="sets" type="number" inputmode="numeric" min="1" value="${d.sets}"></label>
        <label class="mini-field"><span>Wdh.</span><input data-k="reps" type="number" inputmode="numeric" min="1" value="${d.reps}"></label>
        <label class="mini-field"><span>${ex.type === 'bodyweight' ? '+ kg' : 'kg'}</span><input data-k="weight" type="number" inputmode="decimal" step="0.5" min="0" value="${d.weight}"></label>
      </div>`;
    main.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => { d[input.dataset.k] = input.value; });
    });
    btn.addEventListener('click', () => completeExercise(ex, day));
  }
  li.appendChild(main);
  return li;
}

// Abhaken = die Sätze mit den eingetragenen Werten für heute speichern
function completeExercise(ex, day) {
  const d = draftFor(ex);
  const count = parseInt(d.sets, 10);
  const reps = parseInt(d.reps, 10);
  const weight = Math.max(0, parseFloat(String(d.weight).replace(',', '.')) || 0);
  if (!count || count < 1) return toast('Bitte Anzahl Sätze eingeben');
  if (!reps || reps < 1) return toast('Bitte Wiederholungen eingeben');
  const date = localIso();
  for (let i = 0; i < Math.min(count, 20); i++) {
    state.sets.push({ id: uid(), exerciseId: ex.id, date, reps, weight, splitDayId: day.id });
  }
  delete drafts[ex.id];
  save();
  const allDone = day.exerciseIds.map(exerciseById).filter(Boolean).every(e => todaySetsOf(e.id).length);
  toast(allDone ? 'Tag geschafft! 💪' : `${ex.name} erledigt`);
  render();
}

// Haken wieder wegnehmen = heutige Sätze dieser Übung löschen
async function undoExercise(ex) {
  const n = todaySetsOf(ex.id).length;
  const msg = `Haken bei „${ex.name}“ entfernen? ${n === 1 ? 'Der heutige Satz wird' : `Die ${n} heutigen Sätze werden`} gelöscht.`;
  if (!(await confirmDialog(msg, 'Entfernen'))) return;
  state.sets = state.sets.filter(s => !(s.exerciseId === ex.id && dayKey(s.date) === todayKey()));
  save();
  render();
}

$('#split-create-first').addEventListener('click', () => openSplitEditor());
$('#split-edit-current').addEventListener('click', () => openSplitEditor(activeSplit().id));
$('#split-new').addEventListener('click', () => openSplitEditor());

// Liste der Splits im Tab "Übungen"
function renderSplitList() {
  const ul = $('#split-list');
  ul.innerHTML = '';
  $('#split-list-card').hidden = !state.splits.length;
  state.splits.forEach(sp => {
    const li = document.createElement('li');
    li.className = 'split-list-item';
    li.innerHTML = `<div class="list-main"><div>${escapeHtml(sp.name)}</div><span>${sp.days.length} ${sp.days.length === 1 ? 'Tag' : 'Tage'} · ${escapeHtml(sp.days.map(d => d.name).join(' / '))}</span></div>`;
    li.querySelector('.list-main').addEventListener('click', () => openSplitEditor(sp.id));
    const edit = document.createElement('button');
    edit.className = 'icon-btn';
    edit.setAttribute('aria-label', 'Split bearbeiten');
    edit.innerHTML = ICON_EDIT;
    edit.addEventListener('click', () => openSplitEditor(sp.id));
    li.appendChild(edit);
    ul.appendChild(li);
  });
}

// ----- Split anlegen / bearbeiten -----
let editing = null;       // Arbeitskopie, wird erst bei "Fertig" übernommen
let editingIsNew = false;
let quickType = 'weight';

function sheetMessage(el, text) {
  el.textContent = text;
  el.hidden = !text;
}

function openSplitEditor(id) {
  const existing = splitById(id);
  editingIsNew = !existing;
  editing = existing
    ? JSON.parse(JSON.stringify(existing))
    : { id: uid(), name: '', days: [{ id: uid(), name: '', exerciseIds: [] }] };
  $('#split-editor-title').textContent = existing ? 'Split bearbeiten' : 'Neuer Split';
  $('#split-name').value = editing.name;
  $('#split-delete').hidden = editingIsNew;
  sheetMessage($('#split-error'), '');
  sheetMessage($('#quick-msg'), '');
  renderSplitEditor();
  $('#split-editor').showModal();
  $('#split-editor .sheet-body').scrollTop = 0;
}

$('#split-name').addEventListener('input', e => { editing.name = e.target.value; });

function renderSplitEditor() {
  const wrap = $('#split-days');
  wrap.innerHTML = '';
  editing.days.forEach((day, i) => {
    const box = document.createElement('div');
    box.className = 'day-edit';
    box.innerHTML = `
      <div class="day-edit-head">
        <span class="day-badge">Tag ${i + 1}</span>
        <input class="text-input" type="text" placeholder="z.B. Push" autocomplete="off">
      </div>
      <p class="hint">Übungen antippen – die Zahl ist die Reihenfolge im Training</p>
      <div class="pick-chips"></div>`;
    const input = box.querySelector('input');
    input.value = day.name;
    input.addEventListener('input', () => { day.name = input.value; });
    if (editing.days.length > 1) {
      const del = document.createElement('button');
      del.className = 'icon-btn';
      del.setAttribute('aria-label', `Tag ${i + 1} entfernen`);
      del.innerHTML = ICON_TRASH;
      del.addEventListener('click', () => { editing.days.splice(i, 1); renderSplitEditor(); });
      box.querySelector('.day-edit-head').appendChild(del);
    }
    const picks = box.querySelector('.pick-chips');
    state.exercises.forEach(ex => {
      const pos = day.exerciseIds.indexOf(ex.id);
      const b = document.createElement('button');
      b.className = 'chip' + (pos >= 0 ? ' active' : '');
      b.innerHTML = (pos >= 0 ? `<b>${pos + 1}</b>` : '') + escapeHtml(ex.name);
      b.addEventListener('click', () => {
        if (pos >= 0) day.exerciseIds.splice(pos, 1);
        else day.exerciseIds.push(ex.id);
        renderSplitEditor();
      });
      picks.appendChild(b);
    });
    wrap.appendChild(box);
  });
}

$('#split-add-day').addEventListener('click', () => {
  editing.days.push({ id: uid(), name: '', exerciseIds: [] });
  renderSplitEditor();
  const inputs = document.querySelectorAll('#split-days .day-edit-head input');
  inputs[inputs.length - 1].focus();
});

$('#split-cancel').addEventListener('click', () => $('#split-editor').close());

$('#split-save').addEventListener('click', () => {
  const name = editing.name.trim();
  if (!name) {
    sheetMessage($('#split-error'), 'Bitte gib deinem Split einen Namen.');
    $('#split-editor .sheet-body').scrollTop = 0;
    $('#split-name').focus();
    return;
  }
  editing.name = name;
  editing.days.forEach((d, i) => { d.name = d.name.trim() || `Tag ${i + 1}`; });
  const idx = state.splits.findIndex(s => s.id === editing.id);
  if (idx >= 0) state.splits[idx] = editing;
  else state.splits.push(editing);
  state.activeSplitId = editing.id;
  state.trainingMode = 'split';
  selectedDayId = null;
  save();
  $('#split-editor').close();
  toast(editingIsNew ? 'Split gespeichert' : 'Split aktualisiert');
  render();
});

$('#split-delete').addEventListener('click', async () => {
  if (!(await confirmDialog(`Split „${editing.name}“ löschen? Deine gespeicherten Sätze bleiben erhalten.`))) return;
  state.splits = state.splits.filter(s => s.id !== editing.id);
  if (state.activeSplitId === editing.id) state.activeSplitId = null;
  save();
  $('#split-editor').close();
  toast('Split gelöscht');
  render();
});

// Übung direkt im Split-Fenster anlegen
document.querySelectorAll('#split-new-exercise-type button').forEach(btn => {
  btn.addEventListener('click', () => {
    quickType = btn.dataset.type;
    document.querySelectorAll('#split-new-exercise-type button').forEach(b => b.classList.toggle('active', b === btn));
  });
});

$('#split-new-exercise-btn').addEventListener('click', () => {
  const input = $('#split-new-exercise');
  const name = input.value.trim();
  if (!name) return sheetMessage($('#quick-msg'), 'Bitte einen Namen eingeben.');
  if (state.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) {
    return sheetMessage($('#quick-msg'), 'Diese Übung gibt es schon.');
  }
  state.exercises.push({ id: uid(), name, type: quickType });
  save();
  input.value = '';
  sheetMessage($('#quick-msg'), `„${name}“ angelegt – tipp sie oben beim passenden Tag an.`);
  renderSplitEditor();
  render();
});

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
    li.innerHTML = `<div class="list-main"><div>${escapeHtml(ex.name)}</div><span>${ex.type === 'bodyweight' ? 'Körpergewicht + Zusatzgewicht' : 'Gym Gewicht'} · ${count} ${count === 1 ? 'Satz' : 'Sätze'}</span></div>`;
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
      // Auch aus allen Split-Tagen entfernen
      state.splits.forEach(sp => sp.days.forEach(d => { d.exerciseIds = d.exerciseIds.filter(id => id !== ex.id); }));
      save();
      render();
    });
    li.appendChild(del);
    ul.appendChild(li);
  });
}

// ---------- Körpergewicht ----------
const BODY_INTERVAL_DAYS = 14; // Erinnerung: alle zwei Wochen wiegen
const ICON_SCALE = '<svg viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 9a5 5 0 0 1 8 0M12 9l1.5-2"/></svg>';
const bodyInput = $('#body-input');
const bodyDate = $('#body-date');
bodyDate.value = todayKey();

const sortedBody = () => [...state.bodyweights].sort((a, b) => a.date.localeCompare(b.date));
const daysBetween = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 86400000);
const round1 = n => Math.round(n * 10) / 10;
const fmtKg = kg => `${fmtNum(round1(kg))} kg`;
const fmtDiff = d => {
  const r = round1(d);
  return r === 0 ? '±0 kg' : `${r > 0 ? '+' : '−'}${fmtNum(Math.abs(r))} kg`;
};

// Letztes Gewicht als Startwert ins Eingabefeld
if (state.bodyweights.length) bodyInput.value = sortedBody().at(-1).kg;

bodyInput.addEventListener('change', () => {
  if (parseFloat(String(bodyInput.value).replace(',', '.')) < 0) bodyInput.value = 0;
});

$('#add-body-btn').addEventListener('click', () => {
  const kg = round1(parseFloat(String(bodyInput.value).replace(',', '.')) || 0);
  const date = bodyDate.value || todayKey();
  if (kg <= 0) return toast('Bitte ein Gewicht eingeben');
  if (date > todayKey()) return toast('Das Datum liegt in der Zukunft');
  // Pro Tag nur eine Messung: gleicher Tag wird überschrieben
  const existing = state.bodyweights.find(b => b.date === date);
  if (existing) existing.kg = kg;
  else state.bodyweights.push({ id: uid(), date, kg });
  save();
  toast(existing ? 'Gewicht aktualisiert' : 'Gewicht gespeichert');
  bodyDate.value = todayKey();
  render();
});

function renderBodyReminder(last) {
  const el = $('#body-reminder');
  let title, text, due = true;
  if (!last) {
    title = 'Trag dein Gewicht ein';
    text = 'Danach erinnert dich die App alle 2 Wochen';
  } else {
    const since = daysBetween(last.date, todayKey());
    const left = BODY_INTERVAL_DAYS - since;
    if (left <= 0) {
      title = 'Zeit zum Wiegen!';
      text = `Letzte Messung vor ${since} Tagen`;
    } else {
      due = false;
      const next = keyToDate(last.date);
      next.setDate(next.getDate() + BODY_INTERVAL_DAYS);
      title = `Nächste Messung in ${left} ${left === 1 ? 'Tag' : 'Tagen'}`;
      text = formatDateLong(dateKey(next));
    }
  }
  el.className = 'reminder' + (due ? ' due' : '');
  el.innerHTML = `${ICON_SCALE}<div><b>${title}</b><span>${text}</span></div>`;
}

// Liniendiagramm als SVG. Eine Linie, darunter eine leichte Fläche, Tippen zeigt den Wert.
function renderBodyChart(entries) {
  const box = $('#body-chart');
  box.innerHTML = '';
  if (entries.length < 2) {
    box.innerHTML = '<p class="chart-empty">Ab 2 Messungen siehst du hier deinen Verlauf</p>';
    return;
  }
  const W = Math.max(260, $('main').clientWidth - 32 - 38);
  const H = 190;
  const pad = { left: 34, right: 50, top: 44, bottom: 24 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  // Saubere Skala (z.B. 74, 75, 76) mit höchstens 4 Abschnitten
  const values = entries.map(e => e.kg);
  const min = Math.min(...values), max = Math.max(...values);
  const step = [0.5, 1, 2, 5, 10, 20].find(s => (Math.ceil(max / s) - Math.floor(min / s)) <= 4) || 50;
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  if (hi === lo) { lo -= step; hi += step; }

  const t0 = keyToDate(entries[0].date).getTime();
  const t1 = keyToDate(entries.at(-1).date).getTime();
  const x = e => pad.left + ((keyToDate(e.date).getTime() - t0) / (t1 - t0)) * plotW;
  const y = kg => pad.top + (1 - (kg - lo) / (hi - lo)) * plotH;
  const pts = entries.map(e => ({ e, x: x(e), y: y(e.kg) }));
  const baseY = pad.top + plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Verlauf Körpergewicht">`;
  for (let v = lo; v <= hi + 1e-9; v += step) {
    const gy = y(v);
    svg += `<line class="grid" x1="${pad.left}" x2="${W - pad.right}" y1="${gy}" y2="${gy}"/>`;
    svg += `<text class="axis-text" x="${pad.left - 8}" y="${gy + 4}" text-anchor="end">${fmtNum(round1(v))}</text>`;
  }
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
  svg += `<path class="area" d="${line}L${pts.at(-1).x},${baseY}L${pts[0].x},${baseY}Z"/>`;
  svg += `<path class="line" d="${line}"/>`;
  svg += `<line class="cursor" id="chart-cursor" y1="${pad.top}" y2="${baseY}" visibility="hidden"/>`;
  const showAllDots = pts.length <= 30;
  pts.forEach((p, i) => {
    if (showAllDots || i === pts.length - 1) svg += `<circle class="dot" cx="${p.x}" cy="${p.y}" r="4"/>`;
  });
  svg += `<circle class="dot" id="chart-active" r="5.5" visibility="hidden"/>`;
  const end = pts.at(-1);
  svg += `<text class="end-text" x="${end.x + 10}" y="${end.y + 4}">${fmtNum(round1(end.e.kg))}</text>`;
  svg += `<text class="axis-text" x="${pad.left}" y="${H - 4}">${formatDateShort(entries[0].date)}</text>`;
  svg += `<text class="axis-text" x="${W - pad.right}" y="${H - 4}" text-anchor="end">${formatDateShort(entries.at(-1).date)}</text>`;
  svg += '</svg><div class="chart-tip" hidden></div>';
  box.innerHTML = svg;

  // Antippen oder mit dem Finger drüberfahren zeigt den nächsten Messpunkt
  const svgEl = box.querySelector('svg');
  const tip = box.querySelector('.chart-tip');
  const cursor = box.querySelector('#chart-cursor');
  const active = box.querySelector('#chart-active');
  const show = evt => {
    const rect = svgEl.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    const p = pts.reduce((a, b) => (Math.abs(b.x - px) < Math.abs(a.x - px) ? b : a));
    cursor.setAttribute('x1', p.x); cursor.setAttribute('x2', p.x);
    active.setAttribute('cx', p.x); active.setAttribute('cy', p.y);
    cursor.setAttribute('visibility', 'visible'); active.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<b>${fmtKg(p.e.kg)}</b><br>${formatDateShort(p.e.date)}`;
    const half = tip.offsetWidth / 2;
    const left = Math.min(Math.max((p.x / W) * rect.width, half), rect.width - half);
    tip.style.left = `${left}px`;
  };
  const hide = () => {
    tip.hidden = true;
    cursor.setAttribute('visibility', 'hidden'); active.setAttribute('visibility', 'hidden');
  };
  svgEl.addEventListener('pointerdown', show);
  svgEl.addEventListener('pointermove', show);
  svgEl.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
}

function renderBody() {
  const entries = sortedBody();
  const first = entries[0];
  const last = entries.at(-1);
  renderBodyReminder(last);

  const stats = $('#body-stats');
  stats.hidden = !last;
  if (last) {
    stats.innerHTML = `
      <div class="stat"><b>${fmtNum(round1(last.kg))}</b><span>Aktuell (kg)</span></div>
      <div class="stat"><b>${fmtDiff(last.kg - first.kg).replace(' kg', '')}</b><span>Seit Start (kg)</span></div>
      <div class="stat"><b>${entries.length}</b><span>Messungen</span></div>`;
  }

  $('#body-chart-card').hidden = !last;
  if (last) renderBodyChart(entries);

  const ul = $('#body-list');
  ul.innerHTML = '';
  $('#body-list-card').hidden = !last;
  $('#body-list-card').previousElementSibling.hidden = !last;
  [...entries].reverse().forEach(b => {
    const idx = entries.indexOf(b);
    const prev = entries[idx - 1];
    const li = document.createElement('li');
    li.innerHTML = `<div class="list-main"><div>${fmtKg(b.kg)}</div><span>${formatDateLong(b.date)}</span></div>` +
      (prev ? `<span class="diff">${fmtDiff(b.kg - prev.kg)}</span>` : '');
    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.setAttribute('aria-label', 'Messung löschen');
    del.innerHTML = ICON_TRASH;
    del.addEventListener('click', async () => {
      if (!(await confirmDialog(`Messung vom ${formatDateShort(b.date)} löschen?`))) return;
      state.bodyweights = state.bodyweights.filter(x => x.id !== b.id);
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
    state.bodyweights ??= [];
    state.splits ??= [];
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
  renderSplitList();
  renderBody();
}
if (selectedExerciseId) selectExercise(selectedExerciseId);
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// iPhone ignoriert teilweise die Zoom-Sperre: Zwei-Finger-Zoom zusätzlich abfangen
document.addEventListener('gesturestart', e => e.preventDefault());

// iPhone zoomt beim schnellen Doppeltippen trotzdem rein. Deshalb wird der zweite Tipp
// abgefangen und selbst als normaler Tipp ausgeführt (z.B. zweimal + zählt weiter +2).
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd <= 350) {
    e.preventDefault();
    const el = e.target.closest('button, input, textarea, select, a');
    if (el) el.matches('input, textarea, select') ? el.focus() : el.click();
  }
  lastTouchEnd = now;
}, { passive: false });

// Falls jemand per Hand eine Minuszahl eintippt: beim Verlassen des Feldes auf 0 setzen
weightInput.addEventListener('change', () => {
  if (parseFloat(String(weightInput.value).replace(',', '.')) < 0) weightInput.value = 0;
});
