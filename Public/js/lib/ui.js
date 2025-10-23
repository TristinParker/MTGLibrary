// Shared UI helpers: toasts, modals, hover preview, floating header utils
export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  let bgColor, icon;
  switch (type) {
    case 'success':
      bgColor = 'bg-green-600';
      icon = `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
      break;
    case 'error':
      bgColor = 'bg-red-600';
      icon = `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
      break;
    case 'warning':
      bgColor = 'bg-yellow-500';
      icon = `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
      break;
    default:
      bgColor = 'bg-blue-600';
      icon = `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
  }

  toast.className = `toast text-white ${bgColor}`;
  toast.innerHTML = `${icon}<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
  return toast;
}

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  // Small accessibility/UX: autofocus primary inputs for known modals
  try {
    // Delay slightly to allow modal to become visible
    setTimeout(() => {
      if (modalId === 'ai-suggestions-modal') {
        const el = document.getElementById('ai-chat-input'); if (el) try { el.focus(); } catch(e){}
      } else if (modalId === 'rule-lookup-modal') {
        const el = document.getElementById('rule-lookup-input'); if (el) try { el.focus(); } catch(e){}
      } else if (modalId === 'mtg-chat-modal') {
        const el = document.getElementById('mtg-chat-input'); if (el) try { el.focus(); } catch(e){}
      }
    }, 60);
  } catch (e) {}
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// Progress toast helpers
export function showToastWithProgress(message, current, total) {
  const container = document.getElementById('toast-container');
  if (!container) return null;
  const toast = document.createElement('div');
  const toastId = `toast-progress-${Date.now()}`;
  toast.id = toastId;
  toast.className = 'toast text-white bg-blue-600';
  toast.innerHTML = `
    <svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
    <span>${message} <span id="${toastId}-counter">${current} / ${total}</span></span>
    <div class="w-full bg-gray-700 rounded h-2 mt-2 overflow-hidden">
      <div id="${toastId}-bar" class="bg-green-400 h-2 transition-all duration-300" style="width:${total ? (current/total*100) : 0}%"></div>
    </div>
  `;
  toast.style.animation = 'slideIn 0.5s forwards';
  container.appendChild(toast);
  return toastId;
}

export function updateToastProgress(toastId, current, total) {
  const counter = document.getElementById(`${toastId}-counter`);
  const bar = document.getElementById(`${toastId}-bar`);
  if (counter) counter.textContent = `${current} / ${total}`;
  if (bar) bar.style.width = `${total ? (current/total*100) : 0}%`;
}

export function removeToastById(toastId) {
  const toast = document.getElementById(toastId);
  if (toast) toast.remove();
}

// Generic toast updater for non-progress toasts (preserves legacy API)
export function updateToast(id, message, type) {
  try {
    const toast = document.getElementById(id);
    if (!toast) return;
    let bgColor, icon;
    switch (type) {
      case 'success':
        bgColor = 'bg-green-600';
        icon = `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        break;
      case 'error':
        bgColor = 'bg-red-600';
        icon = `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
        break;
      default:
        bgColor = 'bg-gray-700';
        icon = `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
    }
    toast.className = `toast text-white ${bgColor}`;
    toast.style.animation = 'none';
    toast.innerHTML = `${icon}<span>${message}</span>`;
    // auto-dismiss after a short delay
    setTimeout(() => {
      try { toast.style.animation = 'slideOut 0.5s forwards'; } catch (e) {}
      setTimeout(() => { try { toast.remove(); } catch(e){}; }, 500);
    }, 4500);
  } catch (err) {
    console.error('[updateToast] error', err);
  }
}

// Helpers for floating table headers (kept lightweight)
export function computeTableHeaderTop(container) {
  try {
    const appHeader = document.querySelector('header');
    const containerRect = container.getBoundingClientRect();
    let topOffset = 0;
    if (appHeader) {
      const rect = appHeader.getBoundingClientRect();
      topOffset = Math.max(0, Math.ceil(rect.bottom - containerRect.top));
    }
    const banner = document.querySelector('.page-banner');
    if (banner) {
      const bRect = banner.getBoundingClientRect();
      topOffset = Math.max(topOffset, Math.ceil(bRect.bottom - containerRect.top));
    }
    topOffset = Math.max(0, topOffset);
    container.querySelectorAll('table thead').forEach(thead => {
      thead.style.top = `${topOffset}px`;
    });
  } catch (err) {
    console.error('[computeTableHeaderTop] error', err);
  }
}

// Export commonly used modal helpers onto window for legacy inline code
if (typeof window !== 'undefined') {
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.showToast = showToast;
  window.showToastWithProgress = showToastWithProgress;
  window.updateToastProgress = updateToastProgress;
  window.removeToastById = removeToastById;
  window.updateToast = updateToast;
  window.computeTableHeaderTop = computeTableHeaderTop;
  // Provide a default toggleEditMode implementation that focuses on UI state
  // and delegates heavy re-render work to existing window renderers if present.
  window.toggleEditMode = function toggleEditMode() {
    try {
      const appWrapper = document.getElementById('app-wrapper');
      if (!appWrapper) return;
      const isEditMode = appWrapper.classList.toggle('edit-mode');
      const buttonText = document.getElementById('edit-mode-text');
      if (buttonText) buttonText.textContent = isEditMode ? 'Exit Edit Mode' : 'Edit Mode';
      if (isEditMode) showToast && showToast('Edit mode enabled. Deletion is now possible.', 'warning');
      // Re-render views that might be affected by edit mode if renderers exist
      try { if (typeof window.renderCollection === 'function') window.renderCollection(); } catch(e) {}
      try { if (typeof window.renderDecksList === 'function') window.renderDecksList(); } catch(e) {}
      try { const activeDeckId = document.getElementById('single-deck-view')?.dataset?.deckId; if (activeDeckId && typeof window.renderSingleDeck === 'function') window.renderSingleDeck(activeDeckId); } catch(e) {}
    } catch (err) {
      console.warn('[UI.toggleEditMode] error', err);
    }
  };
}
