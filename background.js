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

  if (message.type === 'CLEAR_ALL') {
    (async () => {
      await chrome.storage.local.set({ jobs: [] });
      sendResponse({ success: true });
    })();
    return true;
  }
});
