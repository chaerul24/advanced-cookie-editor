/**
 * Advanced Cookie Editor - Popup Controller
 */

import { CookieService } from '../modules/cookie-service.js';
import { StorageService } from '../modules/storage-service.js';
import { UIService } from '../modules/ui-service.js';
import { formatAsCookieHeader, validateImportPayload } from '../modules/cookie-serializer.js';
import { ImportExportService } from '../modules/import-export.js';

class PopupController {
  constructor() {
    this.activeDomain = '';
    this.allCookies = [];
    this.filteredCookies = [];
    this.activeFilter = 'all';
    this.searchQuery = '';
    this.maskValues = true;
    this.editingCookie = null;
    this.cookieToDelete = null;
    this.pendingImportPayload = null;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.activeDomainDisplay = document.getElementById('active-domain-display');
    this.searchInput = document.getElementById('search-input');
    this.searchClearBtn = document.getElementById('search-clear-btn');
    this.btnThemeToggle = document.getElementById('btn-theme-toggle');
    this.btnOpenDashboard = document.getElementById('btn-open-dashboard');
    this.btnToggleMask = document.getElementById('btn-toggle-mask');
    this.btnRefresh = document.getElementById('btn-refresh');
    this.btnAddCookie = document.getElementById('btn-add-cookie');
    this.cookieListContainer = document.getElementById('cookie-list');
    
    this.loadingSpinner = document.getElementById('loading-spinner');
    this.emptyState = document.getElementById('empty-state');
    this.emptyMessage = document.getElementById('empty-message');
    this.btnEmptyAdd = document.getElementById('btn-empty-add');
    this.errorState = document.getElementById('error-state');
    this.errorMessage = document.getElementById('error-message');
    this.btnRetry = document.getElementById('btn-retry');

    this.footerCount = document.getElementById('footer-count');
    this.btnCopyHeader = document.getElementById('btn-copy-header');
    this.btnCopyAllJson = document.getElementById('btn-copy-all-json');
    this.btnDeleteDomain = document.getElementById('btn-delete-domain');

    // Counts
    this.countAll = document.getElementById('count-all');
    this.countSecure = document.getElementById('count-secure');
    this.countHttpOnly = document.getElementById('count-httponly');
    this.countSession = document.getElementById('count-session');
    this.countPersistent = document.getElementById('count-persistent');

    // Editor Modal
    this.editorModal = document.getElementById('editor-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.cookieForm = document.getElementById('cookie-form');
    this.formName = document.getElementById('form-name');
    this.formValue = document.getElementById('form-value');
    this.formDomain = document.getElementById('form-domain');
    this.formPath = document.getElementById('form-path');
    this.formSameSite = document.getElementById('form-samesite');
    this.formStore = document.getElementById('form-store');
    this.formSecure = document.getElementById('form-secure');
    this.formHttpOnly = document.getElementById('form-httponly');
    this.formSession = document.getElementById('form-session');
    this.formHostOnly = document.getElementById('form-hostonly');
    this.formExpiration = document.getElementById('form-expiration');
    this.expirationGroup = document.getElementById('expiration-group');
    this.formError = document.getElementById('form-error');
    this.modalCloseBtn = document.getElementById('modal-close-btn');
    this.btnModalCancel = document.getElementById('btn-modal-cancel');
    this.btnModalDelete = document.getElementById('btn-modal-delete');
    this.btnModalSave = document.getElementById('btn-modal-save');

    // Confirm Modal
    this.confirmModal = document.getElementById('confirm-modal');
    this.confirmTitle = document.getElementById('confirm-title');
    this.confirmMessage = document.getElementById('confirm-message');
    this.confirmCloseBtn = document.getElementById('confirm-close-btn');
    this.btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    this.btnConfirmProceed = document.getElementById('btn-confirm-proceed');

    // Export Modal & Buttons
    this.btnPopupExport = document.getElementById('btn-popup-export');
    this.exportModal = document.getElementById('export-modal');
    this.exportModalCloseBtn = document.getElementById('export-modal-close-btn');
    this.popupExportScope = document.getElementById('popup-export-scope');
    this.popupExportDomainLabel = document.getElementById('popup-export-domain-label');
    this.popupExportEncrypted = document.getElementById('popup-export-encrypted');
    this.popupExportPwBox = document.getElementById('popup-export-pw-box');
    this.popupExportPassword = document.getElementById('popup-export-password');
    this.popupExportError = document.getElementById('popup-export-error');
    this.btnExportCopyJson = document.getElementById('btn-export-copy-json');
    this.btnExportDownload = document.getElementById('btn-export-download');
    this.btnExportCloud = document.getElementById('btn-export-cloud');

    // Import Modal & Buttons
    this.btnPopupImport = document.getElementById('btn-popup-import');
    this.btnImportCloud = document.getElementById('btn-import-cloud');
    this.importModal = document.getElementById('import-modal');
    this.importModalCloseBtn = document.getElementById('import-modal-close-btn');
    this.tabImportFile = document.getElementById('tab-import-file');
    this.tabImportText = document.getElementById('tab-import-text');
    this.paneImportFile = document.getElementById('pane-import-file');
    this.paneImportText = document.getElementById('pane-import-text');
    this.popupFileInput = document.getElementById('popup-file-input');
    this.popupDropzone = document.getElementById('popup-dropzone');
    this.popupDropzoneFilename = document.getElementById('popup-dropzone-filename');
    this.popupImportTextarea = document.getElementById('popup-import-textarea');
    this.popupImportPwGroup = document.getElementById('popup-import-pw-group');
    this.popupImportPassword = document.getElementById('popup-import-password');
    this.popupImportStrategy = document.getElementById('popup-import-strategy');
    this.popupImportError = document.getElementById('popup-import-error');
    this.btnImportCancel = document.getElementById('btn-import-cancel');
    this.btnImportExecute = document.getElementById('btn-import-execute');

    // AutoSync Modal & Elements
    this.btnAutoSyncStatus = document.getElementById('btn-auto-sync-status');
    this.syncPillText = document.getElementById('sync-pill-text');
    this.autosyncModal = document.getElementById('autosync-modal');
    this.autosyncCloseBtn = document.getElementById('autosync-close-btn');
    this.autosyncEnabled = document.getElementById('autosync-enabled');
    this.autosyncInterval = document.getElementById('autosync-interval');
    this.autosyncPcName = document.getElementById('autosync-pc-name');
    this.autosyncServerUrl = document.getElementById('autosync-server-url');
    this.autosyncStatusInfo = document.getElementById('autosync-status-info');
    this.btnAutosyncTriggerNow = document.getElementById('btn-autosync-trigger-now');
    this.btnAutosyncSave = document.getElementById('btn-autosync-save');
  }

  async init() {
    await this.applyStoredPreferences();
    await this.detectActiveDomain();
    await this.loadCookies();
    await this.initAutoSyncUI();
  }

  async applyStoredPreferences() {
    const settings = await StorageService.getSettings();
    this.maskValues = settings.maskValues ?? true;
    this.updateMaskButtonUI();

    const theme = settings.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }

  async detectActiveDomain() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          const url = new URL(tab.url);
          if (url.protocol.startsWith('http')) {
            this.activeDomain = url.hostname;
            this.activeDomainDisplay.textContent = this.activeDomain;
            this.activeDomainDisplay.title = `Active Site: ${this.activeDomain}`;
            return;
          }
        }
      } catch {
        // Ignored, fallback below
      }
    }
    this.activeDomain = '';
    this.activeDomainDisplay.textContent = 'All Accessible Sites';
  }

  bindEvents() {
    // Theme toggle
    this.btnThemeToggle.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      await StorageService.updateSettings({ theme: next });
    });

    // Auto-Sync Modal Toggle
    if (this.btnAutoSyncStatus) {
      this.btnAutoSyncStatus.addEventListener('click', () => this.openAutoSyncModal());
    }
    if (this.autosyncCloseBtn) {
      this.autosyncCloseBtn.addEventListener('click', () => this.closeAutoSyncModal());
    }
    if (this.btnAutosyncSave) {
      this.btnAutosyncSave.addEventListener('click', () => this.saveAutoSyncConfig());
    }
    if (this.btnAutosyncTriggerNow) {
      this.btnAutosyncTriggerNow.addEventListener('click', () => this.triggerAutoSyncNow());
    }

    // Open Full Dashboard
    this.btnOpenDashboard.addEventListener('click', () => {
      const domainParam = this.activeDomain ? `?domain=${encodeURIComponent(this.activeDomain)}` : '';
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard/dashboard.html${domainParam}`) });
      } else {
        window.open(`../dashboard/dashboard.html${domainParam}`, '_blank');
      }
    });

    // Toggle Mask Values
    this.btnToggleMask.addEventListener('click', async () => {
      this.maskValues = !this.maskValues;
      this.updateMaskButtonUI();
      await StorageService.updateSettings({ maskValues: this.maskValues });
      this.renderCookies();
    });

    // Refresh
    this.btnRefresh.addEventListener('click', () => this.loadCookies());

    // Add Cookie Button
    this.btnAddCookie.addEventListener('click', () => this.openAddCookieModal());
    this.btnEmptyAdd.addEventListener('click', () => this.openAddCookieModal());
    this.btnRetry.addEventListener('click', () => this.loadCookies());

    // Search input
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.searchClearBtn.style.display = this.searchQuery ? 'block' : 'none';
      this.applyFilterAndRender();
    });

    this.searchClearBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchQuery = '';
      this.searchClearBtn.style.display = 'none';
      this.applyFilterAndRender();
    });

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        const target = e.currentTarget;
        target.classList.add('active');
        this.activeFilter = target.getAttribute('data-filter') || 'all';
        this.applyFilterAndRender();
      });
    });

    // Footer actions
    this.btnCopyHeader.addEventListener('click', async () => {
      if (this.filteredCookies.length === 0) {
        UIService.showToast('No cookies available to copy', 'warning');
        return;
      }
      const headerStr = formatAsCookieHeader(this.filteredCookies);
      const success = await UIService.copyToClipboard(headerStr);
      if (success) {
        UIService.showToast('Cookie header copied to clipboard', 'success');
      } else {
        UIService.showToast('Failed to copy to clipboard', 'error');
      }
    });

    this.btnCopyAllJson.addEventListener('click', async () => {
      if (this.filteredCookies.length === 0) {
        UIService.showToast('No cookies available to copy', 'warning');
        return;
      }
      const jsonStr = JSON.stringify(this.filteredCookies, null, 2);
      const success = await UIService.copyToClipboard(jsonStr);
      if (success) {
        UIService.showToast(`Copied ${this.filteredCookies.length} cookies as JSON`, 'success');
      } else {
        UIService.showToast('Failed to copy JSON', 'error');
      }
    });

    this.btnDeleteDomain.addEventListener('click', () => {
      if (!this.activeDomain) {
        UIService.showToast('No active domain selected to clear', 'warning');
        return;
      }
      this.openConfirmModal(
        `Clear cookies for "${this.activeDomain}"?`,
        `This will delete all ${this.filteredCookies.length} cookies matching this domain. Active sessions will be signed out.`,
        async () => {
          try {
            await CookieService.clearDomain(this.activeDomain);
            UIService.showToast(`Cleared cookies for ${this.activeDomain}`, 'success');
            await this.loadCookies();
          } catch (err) {
            UIService.showToast(`Failed to clear: ${err.message}`, 'error');
          }
        }
      );
    });

    // Form Session Checkbox toggle Expiration input
    this.formSession.addEventListener('change', () => {
      this.expirationGroup.style.display = this.formSession.checked ? 'none' : 'flex';
      if (!this.formSession.checked && !this.formExpiration.value) {
        // Default to +30 days
        const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        this.formExpiration.value = date.toISOString().slice(0, 16);
      }
    });

    // SameSite=None constraint with Secure
    this.formSameSite.addEventListener('change', () => {
      if (this.formSameSite.value === 'no_restriction') {
        this.formSecure.checked = true;
      }
    });

    this.formSecure.addEventListener('change', () => {
      if (!this.formSecure.checked && this.formSameSite.value === 'no_restriction') {
        this.formSameSite.value = 'lax';
      }
    });

    // Modal Close
    this.modalCloseBtn.addEventListener('click', () => this.closeEditorModal());
    this.btnModalCancel.addEventListener('click', () => this.closeEditorModal());
    UIService.bindModalEvents(this.editorModal, () => this.closeEditorModal());

    // Modal Delete
    this.btnModalDelete.addEventListener('click', () => {
      if (!this.editingCookie) return;
      const cookie = this.editingCookie;
      this.closeEditorModal();
      this.openConfirmModal(
        `Delete Cookie "${cookie.name}"?`,
        `Are you sure you want to delete this cookie from ${cookie.domain}?`,
        async () => {
          try {
            await CookieService.remove(cookie);
            UIService.showToast(`Deleted cookie "${cookie.name}"`, 'success');
            await this.loadCookies();
          } catch (err) {
            UIService.showToast(`Failed to delete: ${err.message}`, 'error');
          }
        }
      );
    });

    // Form Submit (Save / Create)
    this.cookieForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveCookie();
    });

    // Confirm Modal Close
    this.confirmCloseBtn.addEventListener('click', () => this.closeConfirmModal());
    this.btnConfirmCancel.addEventListener('click', () => this.closeConfirmModal());
    UIService.bindModalEvents(this.confirmModal, () => this.closeConfirmModal());

    // Export Modal Events
    this.btnPopupExport.addEventListener('click', () => this.openExportModal());
    this.exportModalCloseBtn.addEventListener('click', () => this.closeExportModal());
    UIService.bindModalEvents(this.exportModal, () => this.closeExportModal());
    this.popupExportEncrypted.addEventListener('change', () => {
      this.popupExportPwBox.style.display = this.popupExportEncrypted.checked ? 'flex' : 'none';
    });
    this.btnExportCopyJson.addEventListener('click', () => this.handleExportAction(false));
    this.btnExportDownload.addEventListener('click', () => this.handleExportAction(true));
    this.btnExportCloud.addEventListener('click', () => this.handleCloudExport());

    // Import Modal Events
    this.btnPopupImport.addEventListener('click', () => this.openImportModal());
    this.btnImportCloud.addEventListener('click', () => this.handleCloudImport());
    this.importModalCloseBtn.addEventListener('click', () => this.closeImportModal());
    this.btnImportCancel.addEventListener('click', () => this.closeImportModal());
    UIService.bindModalEvents(this.importModal, () => this.closeImportModal());

    // Import Tab Switch
    this.tabImportFile.addEventListener('click', () => {
      this.tabImportFile.classList.add('active');
      this.tabImportText.classList.remove('active');
      this.paneImportFile.style.display = 'flex';
      this.paneImportText.style.display = 'none';
    });
    this.tabImportText.addEventListener('click', () => {
      this.tabImportText.classList.add('active');
      this.tabImportFile.classList.remove('active');
      this.paneImportText.style.display = 'flex';
      this.paneImportFile.style.display = 'none';
      this.popupImportTextarea.focus();
    });

    // Import File Drop & Picker
    this.popupDropzone.addEventListener('click', () => this.popupFileInput.click());
    this.popupDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.popupDropzone.classList.add('dragover');
    });
    this.popupDropzone.addEventListener('dragleave', () => {
      this.popupDropzone.classList.remove('dragover');
    });
    this.popupDropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.popupDropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.length > 0) {
        await this.handleImportFile(e.dataTransfer.files[0]);
      }
    });
    this.popupFileInput.addEventListener('change', async (e) => {
      if (e.target.files?.length > 0) {
        await this.handleImportFile(e.target.files[0]);
      }
    });

    // Check textarea for encrypted envelope on input
    this.popupImportTextarea.addEventListener('input', () => {
      const val = this.popupImportTextarea.value.trim();
      if (val.includes('advanced-cookie-editor-encrypted')) {
        this.popupImportPwGroup.style.display = 'flex';
      } else {
        this.popupImportPwGroup.style.display = 'none';
      }
    });

    // Execute Import
    this.btnImportExecute.addEventListener('click', () => this.handleImportExecute());
  }

  updateMaskButtonUI() {
    this.btnToggleMask.textContent = this.maskValues ? '👁️ Masked' : '👁️ Plain';
    this.btnToggleMask.title = this.maskValues ? 'Values masked for security' : 'Values visible';
  }

  async loadCookies() {
    this.showState('loading');
    try {
      let cookies = [];
      if (CookieService.isAvailable()) {
        cookies = await CookieService.getAll();
      }
      this.allCookies = cookies;
      this.applyFilterAndRender();
    } catch (err) {
      this.showState('error', err.message);
    }
  }

  applyFilterAndRender() {
    // 1. Filter by domain: if activeDomain exists, match exact or parent domain
    let list = this.allCookies;
    if (this.activeDomain) {
      const ad = this.activeDomain.toLowerCase();
      list = list.filter(c => {
        const cd = (c.domain || '').replace(/^\./, '').toLowerCase();
        return ad === cd || ad.endsWith(`.${cd}`);
      });
    }

    // Update badge counts for active domain
    this.countAll.textContent = list.length;
    this.countSecure.textContent = list.filter(c => c.secure).length;
    this.countHttpOnly.textContent = list.filter(c => c.httpOnly).length;
    this.countSession.textContent = list.filter(c => c.session).length;
    this.countPersistent.textContent = list.filter(c => !c.session).length;

    // 2. Filter by category
    if (this.activeFilter === 'secure') {
      list = list.filter(c => c.secure);
    } else if (this.activeFilter === 'httponly') {
      list = list.filter(c => c.httpOnly);
    } else if (this.activeFilter === 'session') {
      list = list.filter(c => c.session);
    } else if (this.activeFilter === 'persistent') {
      list = list.filter(c => !c.session);
    }

    // 3. Search query
    if (this.searchQuery) {
      list = list.filter(c => 
        (c.name && c.name.toLowerCase().includes(this.searchQuery)) ||
        (c.domain && c.domain.toLowerCase().includes(this.searchQuery)) ||
        (c.value && c.value.toLowerCase().includes(this.searchQuery))
      );
    }

    this.filteredCookies = list;
    this.renderCookies();
  }

  renderCookies() {
    this.cookieListContainer.innerHTML = '';
    this.footerCount.textContent = `${this.filteredCookies.length} cookie${this.filteredCookies.length === 1 ? '' : 's'}`;

    if (this.filteredCookies.length === 0) {
      this.showState('empty');
      return;
    }

    this.showState('content');

    const fragment = document.createDocumentFragment();

    for (const cookie of this.filteredCookies) {
      const card = document.createElement('div');
      card.className = 'cookie-card';

      const topRow = document.createElement('div');
      topRow.className = 'cookie-card-top';

      const nameBox = document.createElement('div');
      nameBox.className = 'cookie-name-box';

      const nameEl = document.createElement('span');
      nameEl.className = 'cookie-name';
      nameEl.textContent = cookie.name;

      const metaEl = document.createElement('span');
      metaEl.className = 'cookie-meta';
      metaEl.textContent = `${cookie.domain}${cookie.path || '/'}`;

      nameBox.appendChild(nameEl);
      nameBox.appendChild(metaEl);

      // Card action buttons
      const actions = document.createElement('div');
      actions.className = 'cookie-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'icon-btn';
      copyBtn.title = 'Copy value';
      copyBtn.innerHTML = '📋';
      copyBtn.onclick = async (e) => {
        e.stopPropagation();
        const success = await UIService.copyToClipboard(cookie.value ?? '');
        if (success) {
          UIService.showToast(`Copied value of "${cookie.name}"`, 'success', 2000);
        }
      };

      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn';
      editBtn.title = 'Edit cookie';
      editBtn.innerHTML = '✏️';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        this.openEditCookieModal(cookie);
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.title = 'Delete cookie';
      delBtn.innerHTML = '🗑️';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        this.openConfirmModal(
          `Delete "${cookie.name}"?`,
          `Are you sure you want to delete this cookie?`,
          async () => {
            try {
              await CookieService.remove(cookie);
              UIService.showToast(`Deleted "${cookie.name}"`, 'success');
              await this.loadCookies();
            } catch (err) {
              UIService.showToast(`Failed: ${err.message}`, 'error');
            }
          }
        );
      };

      actions.appendChild(copyBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      topRow.appendChild(nameBox);
      topRow.appendChild(actions);

      // Value Box
      const valBox = document.createElement('div');
      valBox.className = 'cookie-value-box';
      valBox.textContent = UIService.maskValue(cookie.value ?? '', this.maskValues);

      // Badges
      const badges = document.createElement('div');
      badges.className = 'cookie-badges';

      if (cookie.secure) {
        const b = document.createElement('span');
        b.className = 'badge badge-secure';
        b.textContent = 'Secure';
        badges.appendChild(b);
      }

      if (cookie.httpOnly) {
        const b = document.createElement('span');
        b.className = 'badge badge-httponly';
        b.textContent = 'HttpOnly';
        badges.appendChild(b);
      }

      if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
        const b = document.createElement('span');
        b.className = 'badge badge-samesite';
        b.textContent = cookie.sameSite;
        badges.appendChild(b);
      }

      const expBadge = document.createElement('span');
      expBadge.className = 'badge badge-expiry';
      expBadge.textContent = UIService.formatExpiration(cookie.expirationDate, cookie.session);
      badges.appendChild(expBadge);

      card.appendChild(topRow);
      card.appendChild(valBox);
      card.appendChild(badges);

      // Card click opens edit
      card.addEventListener('click', () => this.openEditCookieModal(cookie));

      fragment.appendChild(card);
    }

    this.cookieListContainer.appendChild(fragment);
  }

  showState(state, message = '') {
    this.loadingSpinner.style.display = 'none';
    this.emptyState.style.display = 'none';
    this.errorState.style.display = 'none';
    this.cookieListContainer.style.display = 'none';

    if (state === 'loading') {
      this.loadingSpinner.style.display = 'flex';
    } else if (state === 'empty') {
      this.emptyState.style.display = 'flex';
      this.emptyMessage.textContent = this.searchQuery 
        ? `No cookies match "${this.searchQuery}"`
        : 'No cookies found for this site or filter.';
    } else if (state === 'error') {
      this.errorState.style.display = 'flex';
      this.errorMessage.textContent = message || 'Unknown error occurred';
    } else if (state === 'content') {
      this.cookieListContainer.style.display = 'flex';
    }
  }

  openAddCookieModal() {
    this.editingCookie = null;
    this.modalTitle.textContent = 'Add New Cookie';
    this.formError.style.display = 'none';
    this.btnModalDelete.style.display = 'none';
    this.btnModalSave.textContent = 'Create Cookie';

    this.formName.value = '';
    this.formName.disabled = false;
    this.formValue.value = '';
    this.formDomain.value = this.activeDomain ? `.${this.activeDomain.replace(/^\./, '')}` : '';
    this.formPath.value = '/';
    this.formSameSite.value = 'unspecified';
    this.formStore.value = '0';
    this.formSecure.checked = true;
    this.formHttpOnly.checked = false;
    this.formSession.checked = true;
    this.formHostOnly.checked = false;
    this.expirationGroup.style.display = 'none';

    this.editorModal.style.display = 'flex';
    this.formName.focus();
  }

  openEditCookieModal(cookie) {
    this.editingCookie = cookie;
    this.modalTitle.textContent = `Edit Cookie: ${cookie.name}`;
    this.formError.style.display = 'none';
    this.btnModalDelete.style.display = 'inline-flex';
    this.btnModalSave.textContent = 'Update Cookie';

    this.formName.value = cookie.name;
    this.formValue.value = cookie.value ?? '';
    this.formDomain.value = cookie.domain;
    this.formPath.value = cookie.path || '/';
    this.formSameSite.value = cookie.sameSite || 'unspecified';
    this.formStore.value = cookie.storeId || '0';
    this.formSecure.checked = Boolean(cookie.secure);
    this.formHttpOnly.checked = Boolean(cookie.httpOnly);
    this.formSession.checked = Boolean(cookie.session);
    this.formHostOnly.checked = Boolean(cookie.hostOnly);

    if (cookie.session || !cookie.expirationDate) {
      this.expirationGroup.style.display = 'none';
    } else {
      this.expirationGroup.style.display = 'flex';
      const d = new Date(cookie.expirationDate * 1000);
      this.formExpiration.value = d.toISOString().slice(0, 16);
    }

    this.editorModal.style.display = 'flex';
    this.formValue.focus();
  }

  closeEditorModal() {
    this.editorModal.style.display = 'none';
    this.editingCookie = null;
  }

  async handleSaveCookie() {
    this.formError.style.display = 'none';

    const isSession = this.formSession.checked;
    let expirationDate = null;

    if (!isSession) {
      if (!this.formExpiration.value) {
        this.formError.textContent = 'Please choose an expiration date or mark as Session Cookie.';
        this.formError.style.display = 'block';
        return;
      }
      expirationDate = Math.floor(new Date(this.formExpiration.value).getTime() / 1000);
    }

    const payload = {
      name: this.formName.value.trim(),
      value: this.formValue.value,
      domain: this.formDomain.value.trim(),
      path: this.formPath.value.trim() || '/',
      secure: this.formSecure.checked,
      httpOnly: this.formHttpOnly.checked,
      sameSite: this.formSameSite.value,
      session: isSession,
      expirationDate: isSession ? undefined : expirationDate,
      storeId: this.formStore.value || undefined,
      hostOnly: this.formHostOnly.checked
    };

    try {
      if (this.editingCookie) {
        const result = await CookieService.update(this.editingCookie, payload);
        if (!result.success) {
          throw new Error(result.error || 'Update failed');
        }
        UIService.showToast(`Updated cookie "${payload.name}"`, 'success');
      } else {
        await CookieService.set(payload);
        UIService.showToast(`Created cookie "${payload.name}"`, 'success');
      }

      this.closeEditorModal();
      await this.loadCookies();
    } catch (err) {
      this.formError.textContent = err.message;
      this.formError.style.display = 'block';
    }
  }

  // Export Modal Handlers
  openExportModal() {
    this.popupExportError.style.display = 'none';
    this.popupExportDomainLabel.textContent = this.activeDomain || 'all';
    this.popupExportEncrypted.checked = false;
    this.popupExportPwBox.style.display = 'none';
    this.popupExportPassword.value = '';
    this.exportModal.style.display = 'flex';
  }

  closeExportModal() {
    this.exportModal.style.display = 'none';
  }

  async handleExportAction(download = true) {
    this.popupExportError.style.display = 'none';
    const scope = this.popupExportScope.value;
    const targetCookies = scope === 'active' ? this.filteredCookies : this.allCookies;

    if (targetCookies.length === 0) {
      this.popupExportError.textContent = 'No cookies available to export in this scope.';
      this.popupExportError.style.display = 'block';
      return;
    }

    const encrypt = this.popupExportEncrypted.checked;
    const password = this.popupExportPassword.value;

    if (encrypt && (!password || password.length < 6)) {
      this.popupExportError.textContent = 'Password must be at least 6 characters.';
      this.popupExportError.style.display = 'block';
      return;
    }

    const domainSlug = (this.activeDomain || 'all').replace(/[^a-z0-9]/gi, '-');
    const filename = `cookies-${domainSlug}-${new Date().toISOString().slice(0, 10)}.json`;

    try {
      const res = await ImportExportService.exportCookies(targetCookies, {
        encrypt,
        password,
        filename,
        download,
        metadata: { scope, domain: this.activeDomain }
      });

      if (!download) {
        await UIService.copyToClipboard(res.content);
        UIService.showToast(`Copied ${targetCookies.length} cookies as JSON to clipboard`, 'success');
      } else {
        UIService.showToast(`Exported ${targetCookies.length} cookies (${res.filename})`, 'success');
      }

      this.closeExportModal();
    } catch (err) {
      this.popupExportError.textContent = err.message;
      this.popupExportError.style.display = 'block';
    }
  }

  async handleCloudExport() {
    this.popupExportError.style.display = 'none';
    const scope = this.popupExportScope.value;
    const encrypt = this.popupExportEncrypted.checked;
    const password = this.popupExportPassword.value;

    if (encrypt && (!password || password.length < 6)) {
      this.popupExportError.textContent = 'Password must be at least 6 characters for AES-GCM encryption.';
      this.popupExportError.style.display = 'block';
      this.popupExportPassword.focus();
      return;
    }

    let targetCookies = this.filteredCookies;
    if (scope === 'all') {
      targetCookies = this.allCookies;
    }

    if (targetCookies.length === 0) {
      this.popupExportError.textContent = 'No cookies to export.';
      this.popupExportError.style.display = 'block';
      return;
    }

    this.btnExportCloud.disabled = true;
    this.btnExportCloud.textContent = '☁️ Syncing...';

    try {
      const serverUrl = 'https://warnet.web.id/api/_extension_/cookies';
      const result = await ImportExportService.syncToServer(targetCookies, {
        serverUrl,
        encrypt,
        password,
        metadata: {
          scope,
          domain: this.activeDomain || 'all',
          client: 'Advanced Cookie Editor MV3'
        }
      });

      UIService.showToast(`Backed up ${targetCookies.length} cookies to warnet.web.id (${result.filename})`, 'success');
      this.closeExportModal();
    } catch (err) {
      this.popupExportError.textContent = `Cloud sync failed: ${err.message}`;
      this.popupExportError.style.display = 'block';
    } finally {
      this.btnExportCloud.disabled = false;
      this.btnExportCloud.textContent = '☁️ warnet.web.id';
    }
  }

  // Import Modal Handlers
  openImportModal() {
    this.pendingImportPayload = null;
    this.popupImportError.style.display = 'none';
    this.popupImportPwGroup.style.display = 'none';
    this.popupImportPassword.value = '';
    this.popupImportTextarea.value = '';
    this.popupFileInput.value = '';
    this.popupDropzoneFilename.textContent = 'Supports .json or .enc.json';

    // Default to file tab
    this.tabImportFile.classList.add('active');
    this.tabImportText.classList.remove('active');
    this.paneImportFile.style.display = 'flex';
    this.paneImportText.style.display = 'none';

    this.importModal.style.display = 'flex';
  }

  closeImportModal() {
    this.importModal.style.display = 'none';
    this.pendingImportPayload = null;
  }

  async handleImportFile(file) {
    this.popupImportError.style.display = 'none';
    try {
      const { isEncrypted, parsedData } = await ImportExportService.readFile(file);
      this.pendingImportPayload = parsedData;
      this.popupDropzoneFilename.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)${isEncrypted ? ' - Encrypted' : ''}`;
      this.popupImportPwGroup.style.display = isEncrypted ? 'flex' : 'none';
      if (isEncrypted) {
        this.popupImportPassword.focus();
      }
    } catch (err) {
      this.popupImportError.textContent = err.message;
      this.popupImportError.style.display = 'block';
    }
  }

  async handleImportExecute() {
    this.popupImportError.style.display = 'none';

    const isFileTab = this.tabImportFile.classList.contains('active');
    let rawData = null;

    if (isFileTab) {
      if (!this.pendingImportPayload) {
        this.popupImportError.textContent = 'Please choose a JSON file to import.';
        this.popupImportError.style.display = 'block';
        return;
      }
      rawData = this.pendingImportPayload;
    } else {
      const text = this.popupImportTextarea.value.trim();
      if (!text) {
        this.popupImportError.textContent = 'Please paste cookie JSON in the text area.';
        this.popupImportError.style.display = 'block';
        return;
      }
      try {
        const parsed = ImportExportService.parseJsonText(text);
        rawData = parsed.parsedData;
      } catch (err) {
        this.popupImportError.textContent = err.message;
        this.popupImportError.style.display = 'block';
        return;
      }
    }

    // Check if encrypted
    let payload = rawData;
    if (rawData && rawData.format === 'advanced-cookie-editor-encrypted') {
      const pw = this.popupImportPassword.value;
      if (!pw) {
        this.popupImportPwGroup.style.display = 'flex';
        this.popupImportError.textContent = 'This file is encrypted. Enter password to decrypt.';
        this.popupImportError.style.display = 'block';
        this.popupImportPassword.focus();
        return;
      }
      try {
        payload = await ImportExportService.decryptBackup(rawData, pw);
      } catch (err) {
        this.popupImportError.textContent = `Decryption failed: ${err.message}`;
        this.popupImportError.style.display = 'block';
        return;
      }
    }

    const validation = validateImportPayload(payload);
    if (!validation.valid) {
      this.popupImportError.textContent = `Invalid cookie payload: ${validation.error}`;
      this.popupImportError.style.display = 'block';
      return;
    }

    const strategy = this.popupImportStrategy.value;
    const scopeDomain = strategy === 'replace' ? this.activeDomain : '';

    try {
      const results = await ImportExportService.executeImport(validation.cookies, strategy, scopeDomain);
      UIService.showToast(`Imported ${results.applied} cookies (${results.failed} failed)`, 'success');
      this.closeImportModal();
      await this.loadCookies();
    } catch (err) {
      this.popupImportError.textContent = `Execution failed: ${err.message}`;
      this.popupImportError.style.display = 'block';
    }
  }

  async handleCloudImport() {
    this.popupImportError.style.display = 'none';
    this.btnImportCloud.disabled = true;
    this.btnImportCloud.textContent = '☁️ Fetching...';

    try {
      const serverUrl = 'https://warnet.web.id/api/_extension_/cookies';
      const { payload: rawData, filename } = await ImportExportService.fetchLatestFromServer(serverUrl);

      if (!rawData) {
        throw new Error('No backup data returned from server');
      }

      let payload = rawData;
      if (rawData.format === 'advanced-cookie-editor-encrypted') {
        const pw = this.popupImportPassword.value;
        if (!pw) {
          this.popupImportPwGroup.style.display = 'flex';
          this.popupImportError.textContent = `Server backup is encrypted (${filename}). Enter password, then click "warnet.web.id" again.`;
          this.popupImportError.style.display = 'block';
          this.popupImportPassword.focus();
          return;
        }

        try {
          payload = await ImportExportService.decryptBackup(rawData, pw);
        } catch (pwErr) {
          throw new Error(`Decryption failed: ${pwErr.message}`);
        }
      }

      const validation = validateImportPayload(payload);
      if (!validation.valid) {
        throw new Error(`Invalid cloud payload: ${validation.error}`);
      }

      const strategy = this.popupImportStrategy.value;
      const scopeDomain = strategy === 'replace' ? this.activeDomain : '';

      const results = await ImportExportService.executeImport(validation.cookies, strategy, scopeDomain);
      UIService.showToast(`Restored ${results.applied} cookies from warnet.web.id (${filename})`, 'success');
      this.closeImportModal();
      await this.loadCookies();
    } catch (err) {
      this.popupImportError.textContent = err.message;
      this.popupImportError.style.display = 'block';
    } finally {
      this.btnImportCloud.disabled = false;
      this.btnImportCloud.textContent = '☁️ warnet.web.id';
    }
  }

  openConfirmModal(title, message, onProceed) {
    this.confirmTitle.textContent = title;
    this.confirmMessage.textContent = message;
    this.confirmModal.style.display = 'flex';

    const proceedHandler = async () => {
      this.btnConfirmProceed.removeEventListener('click', proceedHandler);
      this.closeConfirmModal();
      await onProceed();
    };

    this.btnConfirmProceed.onclick = proceedHandler;
  }

  closeConfirmModal() {
    this.confirmModal.style.display = 'none';
  }

  // --- Auto-Sync (5s Interval) Controller Methods ---
  async initAutoSyncUI() {
    await this.updateAutoSyncUI();
    // Poll UI update every 2 seconds
    setInterval(() => this.updateAutoSyncUI(), 2000);
  }

  async updateAutoSyncUI() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    try {
      const data = await chrome.storage.local.get(['ace_monitor_state', 'ace_monitor_config', 'ace_device_uuid', 'ace_pairing_code']);
      const state = data.ace_monitor_state || {};
      const config = data.ace_monitor_config || { enabled: true, intervalMs: 1000, serverUrl: 'https://erul.my.id', deviceName: 'PC-01' };
      const ytStatus = state.domainStatuses?.['youtube.com'] || { sessionState: 'SESSION_UNKNOWN' };

      if (!this.btnAutoSyncStatus) return;

      if (!config.enabled) {
        this.btnAutoSyncStatus.className = 'auto-sync-pill';
        this.syncPillText.textContent = 'Monitor OFF';
      } else if (state.isOnline) {
        this.btnAutoSyncStatus.className = 'auto-sync-pill active';
        this.syncPillText.textContent = '1s Live';
      } else {
        this.btnAutoSyncStatus.className = 'auto-sync-pill';
        this.syncPillText.textContent = 'Connecting';
      }

      if (this.autosyncStatusInfo) {
        let ytBadge = '';
        if (ytStatus.sessionState === 'LOGIN_DETECTED') {
          ytBadge = '<span style="color: #10b981; font-weight: bold;">🟢 LOGIN_DETECTED (Sesi Aktif)</span>';
        } else if (ytStatus.sessionState === 'LOGOUT_DETECTED') {
          ytBadge = '<span style="color: #ef4444; font-weight: bold;">🔴 LOGOUT_DETECTED (Tidak Login)</span>';
        } else {
          ytBadge = '<span style="color: #94a3b8;">⚪ SESSION_UNKNOWN (Belum Diketahui)</span>';
        }

        const onlineBadge = state.isOnline ? '<span style="color: #10b981; font-weight: bold;">🟢 Online (Heartbeat 1s)</span>' : '<span style="color: #ef4444;">🔴 Terputus</span>';

        this.autosyncStatusInfo.innerHTML = `
          <div><strong>Koneksi Server:</strong> ${onlineBadge}</div>
          <div><strong>Device UUID:</strong> <code>${data.ace_device_uuid || state.deviceUuid || '-'}</code></div>
          <div><strong>Kode Pairing:</strong> <code>${data.ace_pairing_code || state.pairingCode || '-'}</code></div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-color);">
            <strong>YouTube Status:</strong> ${ytBadge}
          </div>
          <div style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">
            Target Server: ${config.serverUrl || 'https://erul.my.id'}
          </div>
          ${state.error ? `<div style="color: var(--danger-color); margin-top: 4px;"><strong>Pesan:</strong> ${state.error}</div>` : ''}
        `;
      }
    } catch (_) {}
  }

  async openAutoSyncModal() {
    try {
      const data = await chrome.storage.local.get(['ace_monitor_config', 'ace_device_uuid']);
      const config = data.ace_monitor_config || { enabled: true, intervalMs: 1000, serverUrl: 'https://erul.my.id', deviceName: 'PC-01' };

      if (this.autosyncEnabled) this.autosyncEnabled.checked = config.enabled !== false;
      if (this.autosyncInterval) this.autosyncInterval.value = Math.max(1, Math.round((config.intervalMs || 1000) / 1000));
      if (this.autosyncPcName) this.autosyncPcName.value = config.deviceName || 'PC-01';
      if (this.autosyncServerUrl) this.autosyncServerUrl.value = config.serverUrl || 'https://erul.my.id';

      await this.updateAutoSyncUI();
      if (this.autosyncModal) this.autosyncModal.style.display = 'flex';
    } catch (e) {
      UIService.showToast('Error opening monitor settings: ' + e.message, 'error');
    }
  }

  closeAutoSyncModal() {
    if (this.autosyncModal) this.autosyncModal.style.display = 'none';
  }

  async saveAutoSyncConfig() {
    const intervalSec = parseInt(this.autosyncInterval?.value, 10) || 1;
    const config = {
      enabled: this.autosyncEnabled ? this.autosyncEnabled.checked : true,
      intervalMs: intervalSec * 1000,
      deviceName: (this.autosyncPcName?.value || 'PC-01').trim(),
      serverUrl: (this.autosyncServerUrl?.value || 'https://erul.my.id').replace(/\/api\/cookies$/, '').replace(/\/+$/, '').trim(),
      monitoredDomains: ['youtube.com']
    };

    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'UPDATE_MONITOR_CONFIG', config });
    }
    await chrome.storage.local.set({ ace_monitor_config: config });
    UIService.showToast(`Pengaturan disimpan: Heartbeat ${intervalSec} detik ke ${config.deviceName}`, 'success');
    this.closeAutoSyncModal();
    this.updateAutoSyncUI();
  }

  async triggerAutoSyncNow() {
    if (this.btnAutosyncTriggerNow) {
      this.btnAutosyncTriggerNow.disabled = true;
      this.btnAutosyncTriggerNow.textContent = '⏳ Memeriksa...';
    }

    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'TRIGGER_CHECK_NOW' }, () => {
        if (this.btnAutosyncTriggerNow) {
          this.btnAutosyncTriggerNow.disabled = false;
          this.btnAutosyncTriggerNow.textContent = '🚀 Periksa Sekarang';
        }
        UIService.showToast('Status sesi berhasil diperiksa & dikirim!', 'success');
        this.updateAutoSyncUI();
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupController();
  popup.init();
});
