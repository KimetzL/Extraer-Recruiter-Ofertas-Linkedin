// sidepanel.js — Lógica del panel lateral

(function () {
  'use strict';

  let allJobs = [];
  let searchQuery = '';
  let pendingConfirmAction = null;

  const jobsList = document.getElementById('jobs-list');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const statTotal = document.getElementById('stat-total');
  const statCompanies = document.getElementById('stat-companies');
  const statToday = document.getElementById('stat-today');
  const btnExport = document.getElementById('btn-export');
  const btnClear = document.getElementById('btn-clear');

  const confirmDialog = document.getElementById('confirm-dialog');
  const confirmTitle = document.getElementById('confirm-title');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmBtnOk = document.getElementById('confirm-btn-ok');
  const confirmBtnCancel = document.getElementById('confirm-btn-cancel');

  // ── Cargar ofertas guardadas ───────────────────────────────────────────────
  async function loadJobs() {
    chrome.runtime.sendMessage({ type: 'GET_JOBS' }, (response) => {
      if (chrome.runtime.lastError) return;
      allJobs = response?.jobs || [];
      renderJobs();
      updateStats();
    });
  }

  // ── Actualizar estadísticas ────────────────────────────────────────────────
  function updateStats() {
    const total = allJobs.length;
    const companies = new Set(allJobs.map(j => j.company).filter(Boolean)).size;
    const today = allJobs.filter(j => {
      if (!j.savedAt) return false;
      const saved = new Date(j.savedAt);
      const now = new Date();
      return saved.toDateString() === now.toDateString();
    }).length;

    statTotal.textContent = total;
    statCompanies.textContent = companies;
    statToday.textContent = today;
  }

  // ── Renderizar lista de ofertas ────────────────────────────────────────────
  function renderJobs() {
    const filtered = searchQuery
      ? allJobs.filter(j => {
          const q = searchQuery.toLowerCase();
          return (
            j.recruiterName?.toLowerCase().includes(q) ||
            j.company?.toLowerCase().includes(q) ||
            j.jobTitle?.toLowerCase().includes(q) ||
            j.location?.toLowerCase().includes(q)
          );
        })
      : allJobs;

    if (filtered.length === 0) {
      jobsList.style.display = 'none';
      emptyState.style.display = 'flex';
      emptyState.querySelector('.empty-title').textContent =
        searchQuery ? 'Sin resultados' : 'Aún no hay ofertas guardadas';
      emptyState.querySelector('.empty-desc').textContent =
        searchQuery
          ? `No se encontraron ofertas que coincidan con "${searchQuery}".`
          : 'Navega por ofertas en LinkedIn. Cuando una tenga un recruiter visible, se guardará automáticamente aquí.';
    } else {
      jobsList.style.display = 'flex';
      emptyState.style.display = 'none';
      jobsList.innerHTML = filtered.map(job => buildJobCard(job)).join('');

      // Event listeners para eliminar ofertas individualmente
      jobsList.querySelectorAll('[data-delete]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          requestDeleteJob(btn.dataset.delete);
        });
      });
    }
  }

  // ── Construir HTML de una tarjeta ─────────────────────────────────────────
  function buildJobCard(job) {
    const initials = getInitials(job.recruiterName);
    const date = formatDate(job.savedAt);

    // Fallbacks inteligentes para que ninguna tarjeta quede vacía
    const recruiterName = job.recruiterName && job.recruiterName.trim() ? job.recruiterName.trim() : 'Recruiter de la oferta';
    const recruiterTitle = job.recruiterTitle && job.recruiterTitle.trim() ? job.recruiterTitle.trim() : 'Equipo de contratación';
    const jobTitle = job.jobTitle && job.jobTitle.trim() ? job.jobTitle.trim() : 'Oferta en LinkedIn';
    const company = job.company && job.company.trim() ? job.company.trim() : 'Empresa en LinkedIn';
    
    // Avatar: imagen real si existe, o iniciales estilizadas
    const avatarHtml = job.recruiterAvatar
      ? `<img class="recruiter-avatar" src="${escapeHtml(job.recruiterAvatar)}" alt="${escapeHtml(recruiterName)}" style="object-fit:cover;" />`
      : `<div class="recruiter-avatar">${escapeHtml(initials)}</div>`;

    const recruiterUrl = job.recruiterProfileUrl
      ? `<a href="${escapeHtml(job.recruiterProfileUrl)}" target="_blank" class="card-btn card-btn-ghost" title="Ver perfil en LinkedIn">👤 Perfil</a>`
      : '';

    const messageBtn = job.messageUrl
      ? `<a href="${escapeHtml(job.messageUrl)}" target="_blank" class="card-btn card-btn-msg" title="Enviar mensaje en LinkedIn">💬 Mensaje</a>`
      : '';

    const jobUrl = job.jobUrl
      ? `<a href="${escapeHtml(job.jobUrl)}" target="_blank" class="card-btn card-btn-primary" title="Abrir oferta en LinkedIn">🔗 Oferta</a>`
      : '';

    return `
      <div class="job-card" data-job-id="${escapeHtml(job.jobId)}">
        <div class="recruiter-row">
          ${avatarHtml}
          <div class="recruiter-info">
            <div class="recruiter-name" title="${escapeHtml(recruiterName)}">${escapeHtml(recruiterName)}</div>
            <div class="recruiter-title" title="${escapeHtml(recruiterTitle)}">${escapeHtml(recruiterTitle)}</div>
          </div>
          <div class="recruiter-badge">RECRUITER</div>
        </div>

        <div class="job-body">
          <div class="job-title" title="${escapeHtml(jobTitle)}">${escapeHtml(jobTitle)}</div>
          <div class="job-company">
            ${job.companyUrl
              ? `<a href="${escapeHtml(job.companyUrl)}" target="_blank" style="color:inherit;text-decoration:none">${escapeHtml(company)}</a>`
              : escapeHtml(company)
            }
          </div>
          ${job.location ? `<div class="job-location">📍 <span>${escapeHtml(job.location)}</span></div>` : ''}
        </div>

        <div class="card-actions">
          <div class="card-date" title="Fecha de guardado">${date}</div>
          <div class="card-links">
            ${messageBtn}
            ${recruiterUrl}
            ${jobUrl}
            <button class="card-btn card-btn-delete" data-delete="${escapeHtml(job.jobId)}" title="Eliminar oferta">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ── Sistema de Confirmación ────────────────────────────────────────────────
  function askConfirmation({ title, message, confirmBtnText = 'Eliminar', onConfirm }) {
    if (!confirmDialog) {
      if (confirm(message)) onConfirm();
      return;
    }

    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmBtnOk.textContent = confirmBtnText;

    pendingConfirmAction = onConfirm;
    confirmDialog.showModal();
  }

  function closeConfirmModal() {
    if (confirmDialog && confirmDialog.open) {
      confirmDialog.close();
    }
    pendingConfirmAction = null;
  }

  // ── Solicitar y Ejecutar Eliminación Individual ────────────────────────────
  function requestDeleteJob(jobId) {
    const job = allJobs.find(j => j.jobId === jobId);
    const recruiterName = job?.recruiterName || 'esta oferta';
    const company = job?.company ? ` (${job.company})` : '';

    askConfirmation({
      title: '¿Eliminar oferta?',
      message: `¿Estás seguro de que deseas eliminar la oferta de "${recruiterName}"${company}? Esta acción no se puede deshacer.`,
      confirmBtnText: 'Eliminar',
      onConfirm: () => executeDeleteJob(jobId)
    });
  }

  function executeDeleteJob(jobId) {
    // Animación suave de salida de la tarjeta
    const card = jobsList.querySelector(`[data-job-id="${jobId}"]`);
    if (card) {
      card.style.transition = 'all 0.22s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateX(25px)';
      card.style.maxHeight = '0';
      card.style.paddingTop = '0';
      card.style.paddingBottom = '0';
      card.style.marginTop = '0';
      card.style.marginBottom = '0';
    }

    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'DELETE_JOB', jobId }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response?.success) {
          allJobs = allJobs.filter(j => j.jobId !== jobId);
          renderJobs();
          updateStats();
          showPanelToast('Oferta eliminada correctamente');
        }
      });
    }, card ? 220 : 0);
  }

  // ── Exportar a CSV ─────────────────────────────────────────────────────────
  function exportToCSV() {
    if (allJobs.length === 0) {
      showPanelToast('No hay ofertas para exportar', 'info');
      return;
    }

    const headers = ['Recruiter', 'Título del Recruiter', 'Perfil LinkedIn Recruiter', 'Enlace Mensaje', 'Título del Puesto', 'Empresa', 'Ubicación', 'URL Oferta', 'Fecha Guardado'];
    const rows = allJobs.map(j => [
      j.recruiterName || '',
      j.recruiterTitle || '',
      j.recruiterProfileUrl || '',
      j.messageUrl || '',
      j.jobTitle || '',
      j.company || '',
      j.location || '',
      j.jobUrl || '',
      j.savedAt ? new Date(j.savedAt).toLocaleString('es-ES') : ''
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `linkedin-recruiters-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showPanelToast(`✓ Exportadas ${allJobs.length} ofertas a CSV`);
  }

  // ── Limpiar todo (con confirmación) ────────────────────────────────────────
  function clearAll() {
    if (allJobs.length === 0) {
      showPanelToast('No hay ofertas guardadas para borrar', 'info');
      return;
    }

    askConfirmation({
      title: '¿Borrar todas las ofertas?',
      message: `¿Estás seguro de que deseas eliminar las ${allJobs.length} ofertas guardadas? Esta acción no se puede deshacer.`,
      confirmBtnText: 'Borrar todo',
      onConfirm: () => {
        chrome.runtime.sendMessage({ type: 'CLEAR_ALL' }, (response) => {
          if (chrome.runtime.lastError) return;
          if (response?.success) {
            allJobs = [];
            renderJobs();
            updateStats();
            showPanelToast('Todas las ofertas han sido eliminadas');
          }
        });
      }
    });
  }

  // ── Toast del panel ────────────────────────────────────────────────────────
  function showPanelToast(message, type = 'success') {
    const existing = document.querySelector('.lrf-toast-panel');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'lrf-toast-panel';
    toast.style.background = type === 'info' ? '#0a66c2' : '#22c55e';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'all 0.2s ease';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 2500);
  }

  // ── Escuchar cambios en almacenamiento en tiempo real ──────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.jobs) {
      allJobs = changes.jobs.newValue || [];
      renderJobs();
      updateStats();
    }
  });

  // ── Utilidades ─────────────────────────────────────────────────────────────
  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 2) return 'ahora mismo';
    if (mins < 60) return `hace ${mins}m`;
    if (hours < 24) return `hace ${hours}h`;
    if (days === 1) return 'ayer';
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Event Listeners ────────────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    renderJobs();
  });

  btnExport.addEventListener('click', exportToCSV);
  btnClear.addEventListener('click', clearAll);

  if (confirmBtnCancel) {
    confirmBtnCancel.addEventListener('click', closeConfirmModal);
  }

  if (confirmBtnOk) {
    confirmBtnOk.addEventListener('click', () => {
      if (typeof pendingConfirmAction === 'function') {
        const action = pendingConfirmAction;
        pendingConfirmAction = null;
        if (confirmDialog && confirmDialog.open) {
          confirmDialog.close();
        }
        action();
      } else {
        closeConfirmModal();
      }
    });
  }

  if (confirmDialog) {
    confirmDialog.addEventListener('click', (e) => {
      if (e.target === confirmDialog) {
        closeConfirmModal();
      }
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  loadJobs();
})();
