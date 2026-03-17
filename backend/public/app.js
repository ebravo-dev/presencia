/* global fetch, document */
'use strict';

const API = '/beacons';

const $ = (sel) => document.querySelector(sel);
const form       = $('#beacon-form');
const idField    = $('#beacon-id');
const uuidField  = $('#beacon-uuid');
const classField = $('#beacon-classroom');
const tbody      = $('#beacons-body');
const btnSubmit  = $('#btn-submit');
const btnCancel  = $('#btn-cancel');
const formTitle  = $('#form-title');

// ── Helpers ──────────────────────────────────────────────────────

function sanitize(str) {
  const el = document.createElement('div');
  el.textContent = str;
  return el.innerHTML;
}

function showToast(msg, type) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── CRUD ─────────────────────────────────────────────────────────

async function loadBeacons() {
  try {
    const res = await fetch(API);
    const json = await res.json();
    renderTable(json.data || []);
  } catch {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">Error cargando beacons</td></tr>';
  }
}

function renderTable(beacons) {
  if (!beacons.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">No hay beacons registrados</td></tr>';
    return;
  }
  tbody.innerHTML = beacons.map((b) => `
    <tr data-id="${sanitize(b.id)}">
      <td class="uuid-cell">${sanitize(b.uuid)}</td>
      <td>${sanitize(b.classroom)}</td>
      <td>
        <button class="btn-edit" onclick="editBeacon('${sanitize(b.id)}','${sanitize(b.uuid)}','${sanitize(b.classroom)}')">Editar</button>
        <button class="btn-delete" onclick="removeBeacon('${sanitize(b.id)}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

async function createOrUpdate(e) {
  e.preventDefault();
  const uuid      = uuidField.value.trim();
  const classroom = classField.value.trim();
  const id        = idField.value;

  if (!uuid || !classroom) return;

  try {
    const isEdit = !!id;
    const res = await fetch(isEdit ? `${API}/${id}` : API, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uuid, classroom }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message || 'Error al guardar', 'error');
      return;
    }

    showToast(isEdit ? 'Beacon actualizado' : 'Beacon creado', 'success');
    resetForm();
    loadBeacons();
  } catch {
    showToast('Error de conexión', 'error');
  }
}

window.editBeacon = function (id, uuid, classroom) {
  idField.value    = id;
  uuidField.value  = uuid;
  classField.value = classroom;
  formTitle.textContent = 'Editar Beacon';
  btnSubmit.textContent = 'Guardar';
  btnCancel.hidden = false;
  uuidField.focus();
};

window.removeBeacon = async function (id) {
  if (!confirm('¿Eliminar este beacon?')) return;
  try {
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      showToast('Error al eliminar', 'error');
      return;
    }
    showToast('Beacon eliminado', 'success');
    loadBeacons();
  } catch {
    showToast('Error de conexión', 'error');
  }
};

function resetForm() {
  form.reset();
  idField.value = '';
  formTitle.textContent = 'Agregar Beacon';
  btnSubmit.textContent = 'Agregar';
  btnCancel.hidden = true;
}

// ── Init ─────────────────────────────────────────────────────────
form.addEventListener('submit', createOrUpdate);
btnCancel.addEventListener('click', resetForm);
loadBeacons();
