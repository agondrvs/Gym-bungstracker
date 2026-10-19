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
    sets: [], // { id, exerciseId, date: ISO-String, reps, weight }
  };
}

let state = loadState();
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
save();

const $ = sel => document.querySelector(sel);
const dayKey = iso => iso.slice(0, 10);
const todayKey = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const localIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
};
const exerciseById = id => state.exercises.find(e => e.id === id);
const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatWeight(exercise, weight) {
  if (!exercise || exercise.type === 'bodyweight') {
    if (!weight) return 'Körpergewicht';
    return weight > 0 ? `+${weight} kg` : `${weight} kg`;
  }
  return `${weight} kg`;
}

function formatDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ---------- Navigation ----------
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + btn.dataset.view));
    render();
  });
});

// ---------- Training ----------
const exerciseSelect = $('#exercise-select');
const repsInput = $('#reps-input');
const weightInput = $('#weight-input');

function updateExerciseForm() {
  const ex = exerciseById(exerciseSelect.value);
  if (!ex) return;
  $('#weight-label').textContent = ex.type === 'bodyweight' ? 'Zusatzgewicht (kg)' : 'Gewicht (kg)';

  // Letzten Satz dieser Übung anzeigen und Felder vorbefüllen
  const last = [...state.sets].reverse().find(s => s.exerciseId === ex.id);
  if (last) {
    $('#last-info').textContent = `Zuletzt: ${last.reps} Wdh. × ${formatWeight(ex, last.weight)} (${formatDate(dayKey(last.date))})`;
    weightInput.value = last.weight || '';
  } else {
    $('#last-info').textContent = 'Noch keine Sätze für diese Übung.';
    weightInput.value = '';
  }
}

exerciseSelect.addEventListener('change', updateExerciseForm);

$('#add-set-btn').addEventListener('click', () => {
  const reps = parseInt(repsInput.value, 10);
  const weight = parseFloat(weightInput.value.replace(',', '.')) || 0;
  if (!exerciseSelect.value) return alert('Bitte eine Übung wählen.');
  if (!reps || reps < 1) return alert('Bitte Wiederholungen eingeben.');
  state.sets.push({ id: uid(), exerciseId: exerciseSelect.value, date: localIso(), reps, weight });
  save();
  repsInput.value = '';
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
    div.innerHTML = `<div class="group-title">${escapeHtml(ex ? ex.name : 'Gelöschte Übung')}</div>`;
    const ul = document.createElement('ul');
    ul.className = 'list';
    groupSets.forEach((s, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span><span class="set-num">${i + 1}.</span>${s.reps} Wdh. × ${formatWeight(ex, s.weight)}</span>`;
      const del = document.createElement('button');
      del.className = 'small danger';
      del.textContent = 'Löschen';
      del.addEventListener('click', () => {
        if (!confirm('Satz löschen?')) return;
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
  const current = exerciseSelect.value;
  exerciseSelect.innerHTML = state.exercises
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`)
    .join('');
  if (current && exerciseById(current)) exerciseSelect.value = current;
  updateExerciseForm();

  const list = $('#today-list');
  list.innerHTML = '';
  const todaySets = state.sets.filter(s => dayKey(s.date) === todayKey());
  if (!todaySets.length) {
    list.innerHTML = '<p class="empty">Heute noch keine Sätze.</p>';
    return;
  }
  renderSetGroups(todaySets, list);
}

// ---------- Verlauf ----------
const historyFilter = $('#history-filter');
historyFilter.addEventListener('change', renderHistory);

function renderHistory() {
  const current = historyFilter.value;
  historyFilter.innerHTML = '<option value="">Alle Übungen</option>' + state.exercises
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`)
    .join('');
  historyFilter.value = current && exerciseById(current) ? current : '';

  const list = $('#history-list');
  list.innerHTML = '';
  const sets = state.sets.filter(s => !historyFilter.value || s.exerciseId === historyFilter.value);
  if (!sets.length) {
    list.innerHTML = '<p class="empty">Noch keine Einträge.</p>';
    return;
  }
  const days = [...new Set(sets.map(s => dayKey(s.date)))].sort().reverse();
  days.forEach(day => {
    const h = document.createElement('h2');
    h.textContent = formatDate(day);
    list.appendChild(h);
    renderSetGroups(sets.filter(s => dayKey(s.date) === day), list);
  });
}

// ---------- Übungen ----------
$('#add-exercise-btn').addEventListener('click', () => {
  const name = $('#new-exercise-name').value.trim();
  if (!name) return alert('Bitte einen Namen eingeben.');
  if (state.exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) {
    return alert('Diese Übung gibt es schon.');
  }
  state.exercises.push({ id: uid(), name, type: $('#new-exercise-type').value });
  save();
  $('#new-exercise-name').value = '';
  render();
});

function renderExercises() {
  const ul = $('#exercise-list');
  ul.innerHTML = '';
  state.exercises.forEach(ex => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(ex.name)}<br><span class="tag">${ex.type === 'bodyweight' ? 'Körpergewicht + Zusatzgewicht' : 'Mit Gewicht'}</span></span>`;
    const del = document.createElement('button');
    del.className = 'small danger';
    del.textContent = 'Entfernen';
    del.addEventListener('click', () => {
      const count = state.sets.filter(s => s.exerciseId === ex.id).length;
      const msg = count
        ? `"${ex.name}" entfernen? Die ${count} gespeicherten Sätze werden ebenfalls gelöscht.`
        : `"${ex.name}" entfernen?`;
      if (!confirm(msg)) return;
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
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.exercises) || !Array.isArray(data.sets)) throw new Error('Ungültiges Format');
    if (!confirm('Aktuelle Daten durch das Backup ersetzen?')) return;
    state = data;
    save();
    render();
  } catch (err) {
    alert('Import fehlgeschlagen: ' + err.message);
  } finally {
    e.target.value = '';
  }
});

// ---------- Start ----------
function render() {
  renderTraining();
  renderHistory();
  renderExercises();
}
render();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
