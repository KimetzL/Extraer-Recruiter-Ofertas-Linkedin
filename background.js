// background.js — Service Worker
// Abre el panel lateral al hacer clic en el icono de la extensión

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// Escucha mensajes del content script para guardar ofertas
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_JOB') {
    (async () => {
      const { jobs = [] } = await chrome.storage.local.get('jobs');

      // Evitar duplicados por jobId
      const alreadyExists = jobs.some(j => j.jobId === message.data.jobId);
      if (!alreadyExists) {
        jobs.unshift({
          ...message.data,
          savedAt: new Date().toISOString()
        });
        await chrome.storage.local.set({ jobs });
        sendResponse({ success: true, isNew: true });
      } else {
        sendResponse({ success: true, isNew: false });
      }
    })();
    return true; // Mantiene el canal abierto para la respuesta asíncrona
  }

  if (message.type === 'GET_JOBS') {
    (async () => {
      const { jobs = [] } = await chrome.storage.local.get('jobs');
      sendResponse({ jobs });
    })();
    return true;
  }

  if (message.type === 'DELETE_JOB') {
    (async () => {
      const { jobs = [] } = await chrome.storage.local.get('jobs');
      const updated = jobs.filter(j => j.jobId !== message.jobId);
      await chrome.storage.local.set({ jobs: updated });
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === 'UPDATE_JOB_DESCRIPTION') {
    (async () => {
      const { jobs = [] } = await chrome.storage.local.get('jobs');
      let changed = false;
      const updated = jobs.map(j => {
        if (j.jobId === message.jobId) {
          let modified = false;
          const updatedJob = { ...j };
          if (!updatedJob.jobDescription && message.jobDescription) {
            updatedJob.jobDescription = message.jobDescription;
            modified = true;
          }
          if (!updatedJob.salary && message.salary) {
            updatedJob.salary = message.salary;
            modified = true;
          }
          if (modified) changed = true;
          return updatedJob;
        }
        return j;
      });
      if (changed) {
        await chrome.storage.local.set({ jobs: updated });
      }
      sendResponse({ success: true, updated: changed });
    })();
    return true;
  }

  if (message.type === 'CLEAR_ALL') {
    (async () => {
      await chrome.storage.local.set({ jobs: [] });
      sendResponse({ success: true });
    })();
    return true;
  }

  // ── Relay de comandos de Autopilot entre Sidepanel y Content Script ──────
  if (message.type?.startsWith('AUTOPILOT_')) {
    // Si viene del panel lateral, reenviar a la pestaña activa de LinkedIn
    if (sender.url?.includes('sidepanel')) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab || !activeTab.id || !activeTab.url?.includes('linkedin.com')) {
          sendResponse({ success: false, error: 'Debes estar en una pestaña activa de LinkedIn' });
          return;
        }
        chrome.tabs.sendMessage(activeTab.id, message, (resp) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse(resp);
          }
        });
      });
      return true; // Asíncrono
    }

    // Si viene del Content Script hacia el Sidepanel (ej. progreso, fin)
    chrome.runtime.sendMessage(message).catch(() => {});
    return false;
  }
});
