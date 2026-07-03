/* global fetch, document, confirm, setTimeout, clearTimeout */
'use strict';

const BEACONS_API = '/api/beacons';
const BINDINGS_API = '/api/student-device-bindings';
const SUMMARY_API = '/api/dashboard/summary';

const $ = (sel) => document.querySelector(sel);

const form = $('#beacon-form');
const idField = $('#beacon-id');
const uuidField = $('#beacon-uuid');
const classroomField = $('#beacon-classroom');
const beaconsBody = $('#beacons-body');
const bindingsBody = $('#bindings-body');
const btnSubmit = $('#btn-submit');
const btnCancel = $('#btn-cancel');
const btnRefresh = $('#btn-refresh');
const formTitle = $('#form-title');
const studentSearch = $('#student-search');
let searchTimer;

function escapeHtml(value) {
  const el = document.createElement('div');
  el.textContent = value == null ? '' : String(value);
  return el.innerHTML;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function showToast(message, type = 'success') {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3200);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'No se pudo completar la operación');
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadSummary() {
  const json = await fetchJson(SUMMARY_API);
  const data = json.data || {};
  $('#stat-beacons').textContent = data.beaconsCount ?? 0;
  $('#stat-bindings').textContent = data.bindingsCount ?? 0;
  $('#stat-attendance').textContent = data.attendanceCount ?? 0;
}

async function loadBeacons() {
  try {
    const json = await fetchJson(BEACONS_API);
    renderBeacons(json.data || []);
  } catch (error) {
    beaconsBody.innerHTML = `<tr><td colspan="3" class="empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderBeacons(beacons) {
  if (!beacons.length) {
    beaconsBody.innerHTML = '<tr><td colspan="3" class="empty">No hay salones con beacon registrado</td></tr>';
    return;
  }

  beaconsBody.innerHTML = beacons.map((beacon) => `
    <tr>
      <td><strong>${escapeHtml(beacon.classroom)}</strong></td>
      <td><code>${escapeHtml(beacon.uuid)}</code></td>
      <td class="actions">
        <button type="button" class="ghost" data-action="edit" data-id="${escapeHtml(beacon.id)}" data-uuid="${escapeHtml(beacon.uuid)}" data-classroom="${escapeHtml(beacon.classroom)}">Editar</button>
        <button type="button" class="danger" data-action="delete" data-id="${escapeHtml(beacon.id)}">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function loadBindings() {
  const q = studentSearch.value.trim();
  const url = q ? `${BINDINGS_API}?q=${encodeURIComponent(q)}` : BINDINGS_API;

  try {
    const json = await fetchJson(url);
    renderBindings(json.data || []);
  } catch (error) {
    bindingsBody.innerHTML = `<tr><td colspan="6" class="empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderBindings(bindings) {
  if (!bindings.length) {
    bindingsBody.innerHTML = '<tr><td colspan="6" class="empty">No hay alumnos vinculados</td></tr>';
    return;
  }

  bindingsBody.innerHTML = bindings.map((binding) => {
    const groups = (binding.students || []).map((student) => {
      const group = student.group || {};
      return `
        <div class="student-match">
          <strong>${escapeHtml(student.name)}</strong>
          <span>${escapeHtml(group.name || 'Grupo sin nombre')} · ${escapeHtml(group.classroom || 'Sin salón')}</span>
        </div>
      `;
    }).join('');

    return `
      <tr>
        <td><strong>${escapeHtml(binding.matricula)}</strong></td>
        <td><code>${escapeHtml(binding.attendanceUuid)}</code></td>
        <td>${groups || '<span class="muted">No aparece en grupos sincronizados</span>'}</td>
        <td>
          <span>${escapeHtml(binding.platform || '-')}</span>
          <small>${escapeHtml(binding.deviceInfo || '')}</small>
        </td>
        <td>${formatDate(binding.updatedAt)}</td>
        <td class="actions">
          <button type="button" class="danger" data-action="delete-binding" data-matricula="${escapeHtml(binding.matricula)}">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function saveBeacon(event) {
  event.preventDefault();
  const id = idField.value;
  const classroom = classroomField.value.trim();
  const uuid = uuidField.value.trim();
  if (!classroom || !uuid) return;

  try {
    await fetchJson(id ? `${BEACONS_API}/${id}` : BEACONS_API, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classroom, uuid }),
    });
    showToast(id ? 'Beacon actualizado' : 'Beacon registrado');
    resetForm();
    await refreshAll();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function editBeacon(button) {
  idField.value = button.dataset.id;
  uuidField.value = button.dataset.uuid;
  classroomField.value = button.dataset.classroom;
  formTitle.textContent = 'Editar beacon de salón';
  btnSubmit.textContent = 'Actualizar';
  btnCancel.hidden = false;
  classroomField.focus();
}

async function deleteBeacon(id) {
  if (!confirm('¿Eliminar este beacon de salón?')) return;
  try {
    await fetchJson(`${BEACONS_API}/${id}`, { method: 'DELETE' });
    showToast('Beacon eliminado');
    await refreshAll();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteBinding(matricula) {
  if (!confirm(`¿Eliminar la vinculación de ${matricula}?`)) return;
  try {
    await fetchJson(`${BINDINGS_API}/${encodeURIComponent(matricula)}`, {
      method: 'DELETE',
    });
    showToast('Vinculación eliminada');
    await refreshAll();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function resetForm() {
  form.reset();
  idField.value = '';
  formTitle.textContent = 'Registrar beacon de salón';
  btnSubmit.textContent = 'Guardar';
  btnCancel.hidden = true;
}

async function refreshAll() {
  await Promise.all([loadSummary(), loadBeacons(), loadBindings()]);
}

beaconsBody.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action === 'edit') editBeacon(button);
  if (button.dataset.action === 'delete') deleteBeacon(button.dataset.id);
});

bindingsBody.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.action === 'delete-binding') {
    deleteBinding(button.dataset.matricula);
  }
});

studentSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadBindings, 250);
});

form.addEventListener('submit', saveBeacon);
btnCancel.addEventListener('click', resetForm);
btnRefresh.addEventListener('click', refreshAll);

refreshAll();
