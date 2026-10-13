/**
 * Advanced Cookie Editor - UI Support Service
 * Handles non-intrusive toasts, modal dialog lifecycle, clipboard interaction,
 * value masking, and date formatting.
 */

export class UIService {
  /**
   * Display a non-intrusive toast message
   * @param {string} message 
   * @param {'success'|'error'|'info'|'warning'} [type='info'] 
   * @param {number} [duration=3500] 
   */
  static showToast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('ace-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ace-toast-container';
      container.className = 'ace-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `ace-toast ace-toast-${type}`;
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'ace-toast-icon';
    iconSpan.innerHTML = this.getToastIcon(type);

    const textSpan = document.createElement('span');
    textSpan.className = 'ace-toast-text';
    textSpan.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ace-toast-close';
    closeBtn.setAttribute('aria-label', 'Close toast');
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
      toast.classList.add('ace-toast-hiding');
      setTimeout(() => toast.remove(), 200);
    };

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    toast.appendChild(closeBtn);
    container.appendChild(toast);

    // Auto dismiss
    setTimeout(() => {
      if (toast.isConnected) {
        toast.classList.add('ace-toast-hiding');
        setTimeout(() => toast.remove(), 200);
      }
    }, duration);
  }

  static getToastIcon(type) {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      default:
        return 'ℹ';
    }
  }

  /**
   * Copy text to clipboard with modern navigator.clipboard and fallback
   * @param {string} text 
   * @returns {Promise<boolean>}
   */
  static async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Fallback for non-secure contexts
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand('copy');
      textArea.remove();
      return success;
    } catch {
      return false;
    }
  }

  /**
   * Format cookie expiration
   * @param {number|undefined|null} expirationDate Seconds timestamp
   * @param {boolean} session 
   * @returns {string}
   */
  static formatExpiration(expirationDate, session) {
    if (session || !expirationDate) {
      return 'Session';
    }
    const date = new Date(expirationDate * 1000);
    const now = new Date();
    
    if (date < now) {
      return 'Expired';
    }

    // Relative string + local format
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 365) {
      const years = (diffDays / 365).toFixed(1);
      return `In ${years} yrs (${date.toLocaleDateString()})`;
    } else if (diffDays > 0) {
      return `In ${diffDays}d (${date.toLocaleDateString()})`;
    } else {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      return `In ${diffHours}h (${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    }
  }

  /**
   * Mask sensitive cookie value
   * @param {string} value 
   * @param {boolean} masked 
   * @returns {string}
   */
  static maskValue(value, masked = true) {
    if (!value) return '';
    if (!masked) return value;
    if (value.length <= 6) return '••••••';
    return `${value.slice(0, 2)}••••••••${value.slice(-2)}`;
  }

  /**
   * Setup modal close on escape & backdrop click
   * @param {HTMLElement} modalElement 
   * @param {Function} onClose 
   */
  static bindModalEvents(modalElement, onClose) {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) {
        onClose();
      }
    });

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }
}
