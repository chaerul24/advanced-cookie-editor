/**
 * Advanced Cookie Editor - Developer Dashboard Controller
 */

import { CookieService } from '../modules/cookie-service.js';
import { StorageService } from '../modules/storage-service.js';
import { CookieSetsService } from '../modules/cookie-sets.js';
import { ImportExportService } from '../modules/import-export.js';
import { UIService } from '../modules/ui-service.js';
import {
  formatAsNameValue,
  formatAsCookieHeader,
  validateImportPayload
} from '../modules/cookie-serializer.js';

class DashboardController {
  constructor() {
    this.allCookies = [];
    this.filteredCookies = [];
    this.selectedCookieKeys = new Set();
    this.activeScopeDomain = '__all__';
    this.activeFilter = 'all';
    this.activeSort = 'name_asc';
    this.searchQuery = '';
    this.maskValues = true;
    this.pbkdf2Iterations = 250000;

    // State for modals & pending tasks
    this.editingCookie = null;
    this.pendingImportFile = null;
    this.pendingImportData = null;
    this.pendingSetCookies = [];

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    // Navigation
    this.navItems = document.querySelectorAll('.nav-item');
    this.tabPanels = document.querySelectorAll('.tab-panel');
    this.navCookieCount = document.getElementById('nav-cookie-count');
    this.navSetsCount = document.getElementById('nav-sets-count');
    this.btnThemeToggle = document.getElementById('btn-theme-toggle');

    // Explorer top
    this.domainSelect = document.getElementById('domain-select');
    this.btnToggleMask = document.getElementById('btn-toggle-mask');
    this.btnRefresh = document.getElementById('btn-refresh');
    this.btnAddCookie = document.getElementById('btn-add-cookie');
    this.btnNavImport = document.getElementById('btn-nav-import');
    this.btnNavExport = document.getElementById('btn-nav-export');

    // Filter & Search
    this.searchInput = document.getElementById('search-input');
    this.btnClearSearch = document.getElementById('btn-clear-search');
    this.sortSelect = document.getElementById('sort-select');
    this.countAll = document.getElementById('count-all');
    this.countSecure = document.getElementById('count-secure');
    this.countHttpOnly = document.getElementById('count-httponly');
    this.countSession = document.getElementById('count-session');
    this.countPersistent = document.getElementById('count-persistent');

    // Table & Ribbon
    this.bulkRibbon = document.getElementById('bulk-ribbon');
    this.selectedCountLabel = document.getElementById('selected-count-label');
    this.btnCopySelectedNv = document.getElementById('btn-copy-selected-nv');
    this.btnCopySelectedHeader = document.getElementById('btn-copy-selected-header');
    this.btnCopySelectedJson = document.getElementById('btn-copy-selected-json');
    this.btnSaveAsSet = document.getElementById('btn-save-as-set');
    this.btnDeleteSelected = document.getElementById('btn-delete-selected');

    this.cookieTableBody = document.getElementById('cookie-table-body');
    this.thSelectAll = document.getElementById('th-select-all');
    this.tableLoading = document.getElementById('table-loading');
    this.tableEmpty = document.getElementById('table-empty');
    this.tableEmptyDesc = document.getElementById('table-empty-desc');
    this.btnTableEmptyAdd = document.getElementById('btn-table-empty-add');
    this.tableTotalCount = document.getElementById('table-total-count');
    this.btnClearCurrentScope = document.getElementById('btn-clear-current-scope');
    this.btnClearAllCookies = document.getElementById('btn-clear-all-cookies');

    // Cookie Sets
    this.btnNewSetDialog = document.getElementById('btn-new-set-dialog');
    this.setsEmpty = document.getElementById('sets-empty');
    this.setsGrid = document.getElementById('sets-grid');

    // Import & Export
    this.exportScope = document.getElementById('export-scope');
    this.exportFilename = document.getElementById('export-filename');
    this.exportEncryptedCheckbox = document.getElementById('export-encrypted-checkbox');
    this.exportPasswordGroup = document.getElementById('export-password-group');
    this.exportPassword = document.getElementById('export-password');
    this.exportPasswordConfirm = document.getElementById('export-password-confirm');
    this.btnRunExport = document.getElementById('btn-run-export');
    this.btnCopyExportJson = document.getElementById('btn-copy-export-json');

    this.dashTabImportFile = document.getElementById('dash-tab-import-file');
    this.dashTabImportText = document.getElementById('dash-tab-import-text');
    this.dashPaneImportFile = document.getElementById('dash-pane-import-file');
    this.dashPaneImportText = document.getElementById('dash-pane-import-text');
    this.dashImportTextarea = document.getElementById('dash-import-textarea');

    this.importDropzone = document.getElementById('import-dropzone');
    this.importFileInput = document.getElementById('import-file-input');
    this.importFileStatus = document.getElementById('import-file-status');
    this.importFileName = document.getElementById('import-file-name');
    this.importFileMeta = document.getElementById('import-file-meta');
    this.btnImportReset = document.getElementById('btn-import-reset');
    this.importStrategy = document.getElementById('import-strategy');
    this.btnRunImportPreview = document.getElementById('btn-run-import-preview');

    this.importResultsContainer = document.getElementById('import-results-container');
    this.importSummaryBadge = document.getElementById('import-summary-badge');
    this.importLogTable = document.getElementById('import-log-table');

    // Cloudflare Server Sync
    this.cloudHealthBadge = document.getElementById('cloud-health-badge');
    this.cloudServerUrl = document.getElementById('cloud-server-url');
    this.btnCloudHealth = document.getElementById('btn-cloud-health');
    this.cloudExportScope = document.getElementById('cloud-export-scope');
    this.cloudExportEncrypted = document.getElementById('cloud-export-encrypted');
    this.cloudExportPwBox = document.getElementById('cloud-export-pw-box');
    this.cloudExportPassword = document.getElementById('cloud-export-password');
    this.btnCloudPush = document.getElementById('btn-cloud-push');
    this.cloudImportStrategy = document.getElementById('cloud-import-strategy');
    this.cloudImportPassword = document.getElementById('cloud-import-password');
    this.btnCloudPull = document.getElementById('btn-cloud-pull');
    this.btnCloudList = document.getElementById('btn-cloud-list');
    this.cloudStatusMsg = document.getElementById('cloud-status-msg');

    // Auto-Sync 5s controls
    this.dashAutosyncStatusPill = document.getElementById('dash-autosync-status-pill');
    this.dashAutosyncEnabled = document.getElementById('dash-autosync-enabled');
    this.dashAutosyncInterval = document.getElementById('dash-autosync-interval');
    this.dashAutosyncPc = document.getElementById('dash-autosync-pc');
    this.btnDashAutosyncSave = document.getElementById('btn-dash-autosync-save');

    // Settings
    this.settingKdfIterations = document.getElementById('setting-kdf-iterations');
    this.settingMaskDefault = document.getElementById('setting-mask-default');

    // Editor Modal
    this.editorModal = document.getElementById('editor-modal');
    this.modalTitle = document.getElementById('modal-title');
    this.cookieForm = document.getElementById('cookie-form');
    this.formName = document.getElementById('form-name');
    this.formValue = document.getElementById('form-value');
    this.formDomain = document.getElementById('form-domain');
    this.formPath = document.getElementById('form-path');
    this.formSameSite = document.getElementById('form-samesite');
    this.formPartitionKey = document.getElementById('form-partition-key');
    this.formStore = document.getElementById('form-store');
    this.formSecure = document.getElementById('form-secure');
    this.formHttpOnly = document.getElementById('form-httponly');
    this.formSession = document.getElementById('form-session');
    this.formHostOnly = document.getElementById('form-hostonly');
    this.expirationGroup = document.getElementById('expiration-group');
    this.formExpiration = document.getElementById('form-expiration');
    this.formError = document.getElementById('form-error');
    this.modalCloseBtn = document.getElementById('modal-close-btn');
    this.btnModalCancel = document.getElementById('btn-modal-cancel');
    this.btnModalDelete = document.getElementById('btn-modal-delete');
    this.btnModalSave = document.getElementById('btn-modal-save');

    // Password Modal (for import)
    this.passwordModal = document.getElementById('password-modal');
    this.pwModalCloseBtn = document.getElementById('pw-modal-close-btn');
    this.passwordForm = document.getElementById('password-form');
    this.importPasswordInput = document.getElementById('import-password-input');
    this.pwError = document.getElementById('pw-error');
    this.btnPwCancel = document.getElementById('btn-pw-cancel');

    // Import Preview Modal
    this.importConfirmModal = document.getElementById('import-confirm-modal');
    this.icCloseBtn = document.getElementById('ic-close-btn');
    this.previewTotalCount = document.getElementById('preview-total-count');
    this.previewAdditionsCount = document.getElementById('preview-additions-count');
    this.previewConflictsCount = document.getElementById('preview-conflicts-count');
    this.conflictListContainer = document.getElementById('conflict-list-container');
    this.conflictItems = document.getElementById('conflict-items');
    this.btnIcCancel = document.getElementById('btn-ic-cancel');
    this.btnIcConfirm = document.getElementById('btn-ic-confirm');

    // Confirm Modal
    this.confirmModal = document.getElementById('confirm-modal');
    this.confirmTitle = document.getElementById('confirm-title');
    this.confirmMessage = document.getElementById('confirm-message');
    this.confirmTypedBox = document.getElementById('confirm-typed-box');
    this.confirmTypedInput = document.getElementById('confirm-typed-input');
    this.confirmCloseBtn = document.getElementById('confirm-close-btn');
    this.btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    this.btnConfirmProceed = document.getElementById('btn-confirm-proceed');

    // Create Cookie Set Modal
    this.setCreateModal = document.getElementById('set-create-modal');
    this.setCreateCloseBtn = document.getElementById('set-create-close-btn');
    this.setCreateForm = document.getElementById('set-create-form');
    this.setNameInput = document.getElementById('set-name-input');
    this.setDescInput = document.getElementById('set-desc-input');
    this.setItemCountInfo = document.getElementById('set-item-count-info');
    this.btnSetCreateCancel = document.getElementById('btn-set-create-cancel');
  }

  async init() {
    await this.loadPreferences();
    this.checkUrlQueryDomain();
    await this.loadCookies();
    await this.loadCookieSets();
    this.checkCloudHealth();
    this.initDashAutoSync();
  }

  async loadPreferences() {
    const settings = await StorageService.getSettings();
    this.maskValues = settings.maskValues ?? true;
    this.pbkdf2Iterations = settings.pbkdf2Iterations ?? 250000;
    
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
    this.settingMaskDefault.checked = this.maskValues;
    this.settingKdfIterations.value = String(this.pbkdf2Iterations);
    this.updateMaskButtonUI();
  }

  checkUrlQueryDomain() {
    const params = new URLSearchParams(window.location.search);
    const domain = params.get('domain');
    if (domain) {
      this.activeScopeDomain = domain.toLowerCase();
    }
  }

  updateMaskButtonUI() {
    this.btnToggleMask.textContent = this.maskValues ? '👁️ Masked' : '👁️ Plain';
  }

  switchTab(tab) {
    this.navItems.forEach(n => {
      if (n.getAttribute('data-tab') === tab) {
        n.classList.add('active');
      } else {
        n.classList.remove('active');
      }
    });
    this.tabPanels.forEach(p => {
      if (p.id === `panel-${tab}`) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
    if (tab === 'sets') this.loadCookieSets();
  }

  bindEvents() {
    // Navigation Tabs
    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    if (this.btnNavImport) {
      this.btnNavImport.addEventListener('click', () => this.switchTab('import-export'));
    }
    if (this.btnNavExport) {
      this.btnNavExport.addEventListener('click', () => this.switchTab('import-export'));
    }

    // Theme Toggle
    this.btnThemeToggle.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      await StorageService.updateSettings({ theme: next });
    });

    // Mask Values Toggle
    this.btnToggleMask.addEventListener('click', async () => {
      this.maskValues = !this.maskValues;
      this.updateMaskButtonUI();
      await StorageService.updateSettings({ maskValues: this.maskValues });
      this.renderTable();
    });

    // Refresh
    this.btnRefresh.addEventListener('click', () => this.loadCookies());

    // Domain Scope Select
    this.domainSelect.addEventListener('change', (e) => {
      this.activeScopeDomain = e.target.value;
      this.selectedCookieKeys.clear();
      this.updateBulkRibbon();
      this.applyFilterAndRender();
    });

    // Search Input
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.btnClearSearch.style.display = this.searchQuery ? 'block' : 'none';
      this.applyFilterAndRender();
    });

    this.btnClearSearch.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchQuery = '';
      this.btnClearSearch.style.display = 'none';
      this.applyFilterAndRender();
    });

    // Filter Chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.activeFilter = e.currentTarget.getAttribute('data-filter') || 'all';
        this.applyFilterAndRender();
      });
    });

    // Sort Select
    this.sortSelect.addEventListener('change', (e) => {
      this.activeSort = e.target.value;
      this.applyFilterAndRender();
    });

    // Select All Checkbox
    this.thSelectAll.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      if (isChecked) {
        this.filteredCookies.forEach(c => {
          this.selectedCookieKeys.add(this.getCookieKey(c));
        });
      } else {
        this.selectedCookieKeys.clear();
      }
      this.updateBulkRibbon();
      this.renderTable();
    });

    // Bulk Actions
    this.btnCopySelectedNv.addEventListener('click', async () => {
      const selected = this.getSelectedCookies();
      if (selected.length === 0) return;
      const text = selected.map(formatAsNameValue).join('\n');
      const ok = await UIService.copyToClipboard(text);
      if (ok) UIService.showToast(`Copied ${selected.length} cookies as name=value`, 'success');
    });

    this.btnCopySelectedHeader.addEventListener('click', async () => {
      const selected = this.getSelectedCookies();
      if (selected.length === 0) return;
      const text = formatAsCookieHeader(selected);
      const ok = await UIService.copyToClipboard(text);
      if (ok) UIService.showToast('Copied selected cookies as Cookie request header', 'success');
    });

    this.btnCopySelectedJson.addEventListener('click', async () => {
      const selected = this.getSelectedCookies();
      if (selected.length === 0) return;
      const text = JSON.stringify(selected, null, 2);
      const ok = await UIService.copyToClipboard(text);
      if (ok) UIService.showToast(`Copied ${selected.length} cookies as JSON`, 'success');
    });

    this.btnSaveAsSet.addEventListener('click', () => {
      const selected = this.getSelectedCookies();
      if (selected.length === 0) return;
      this.openCreateSetModal(selected);
    });

    this.btnDeleteSelected.addEventListener('click', () => {
      const selected = this.getSelectedCookies();
      if (selected.length === 0) return;
      this.openConfirmModal(
        `Delete ${selected.length} Selected Cookies?`,
        `This will permanently remove the selected cookies from the browser.`,
        false,
        async () => {
          const res = await CookieService.removeMultiple(selected);
          UIService.showToast(`Deleted ${res.deleted} cookies (${res.failed} failed)`, 'success');
          this.selectedCookieKeys.clear();
          await this.loadCookies();
        }
      );
    });

    // Danger Footer Actions
    this.btnClearCurrentScope.addEventListener('click', () => {
      if (this.activeScopeDomain === '__all__') {
        UIService.showToast('Select a specific domain scope first, or use "Delete All Accessible Cookies"', 'warning');
        return;
      }
      this.openConfirmModal(
        `Clear Cookies for "${this.activeScopeDomain}"?`,
        `All cookies matching this domain scope will be cleared immediately.`,
        false,
        async () => {
          const res = await CookieService.clearDomain(this.activeScopeDomain);
          UIService.showToast(`Cleared ${res.deleted} cookies for ${this.activeScopeDomain}`, 'success');
          await this.loadCookies();
        }
      );
    });

    this.btnClearAllCookies.addEventListener('click', () => {
      this.openConfirmModal(
        'DELETE ALL ACCESSIBLE COOKIES ACROSS ALL SITES?',
        'Warning: This action will log you out of all sessions and websites in this browser profile. You must type DELETE to proceed.',
        true,
        async () => {
          const res = await CookieService.clearAll();
          UIService.showToast(`Cleared ${res.deleted} cookies across browser`, 'success');
          this.selectedCookieKeys.clear();
          await this.loadCookies();
        }
      );
    });

    // Add Cookie Buttons
    this.btnAddCookie.addEventListener('click', () => this.openAddCookieModal());
    this.btnTableEmptyAdd.addEventListener('click', () => this.openAddCookieModal());

    // Password Toggle Buttons
    document.querySelectorAll('.btn-toggle-pw').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const targetId = e.currentTarget.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (input) {
          const isPw = input.type === 'password';
          input.type = isPw ? 'text' : 'password';
          e.currentTarget.textContent = isPw ? '🙈' : '👁️';
        }
      });
    });

    // Cookie Editor Form Interactivity
    this.formSession.addEventListener('change', () => {
      this.expirationGroup.style.display = this.formSession.checked ? 'none' : 'flex';
      if (!this.formSession.checked && !this.formExpiration.value) {
        const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        this.formExpiration.value = date.toISOString().slice(0, 16);
      }
    });

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

    // Editor Modal Lifecycle
    this.modalCloseBtn.addEventListener('click', () => this.closeEditorModal());
    this.btnModalCancel.addEventListener('click', () => this.closeEditorModal());
    UIService.bindModalEvents(this.editorModal, () => this.closeEditorModal());

    this.cookieForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveCookie();
    });

    this.btnModalDelete.addEventListener('click', () => {
      if (!this.editingCookie) return;
      const cookie = this.editingCookie;
      this.closeEditorModal();
      this.openConfirmModal(
        `Delete Cookie "${cookie.name}"?`,
        `Permanently remove this cookie from ${cookie.domain}.`,
        false,
        async () => {
          try {
            await CookieService.remove(cookie);
            UIService.showToast(`Deleted "${cookie.name}"`, 'success');
            await this.loadCookies();
          } catch (err) {
            UIService.showToast(`Delete failed: ${err.message}`, 'error');
          }
        }
      );
    });

    // Confirmation Modal Events
    this.confirmCloseBtn.addEventListener('click', () => this.closeConfirmModal());
    this.btnConfirmCancel.addEventListener('click', () => this.closeConfirmModal());
    UIService.bindModalEvents(this.confirmModal, () => this.closeConfirmModal());

    // Password Modal Events
    this.pwModalCloseBtn.addEventListener('click', () => this.closePasswordModal());
    this.btnPwCancel.addEventListener('click', () => this.closePasswordModal());
    UIService.bindModalEvents(this.passwordModal, () => this.closePasswordModal());

    this.passwordForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handlePasswordDecrypt();
    });

    // Import Preview Modal Events
    this.icCloseBtn.addEventListener('click', () => this.closeImportPreviewModal());
    this.btnIcCancel.addEventListener('click', () => this.closeImportPreviewModal());
    UIService.bindModalEvents(this.importConfirmModal, () => this.closeImportPreviewModal());

    this.btnIcConfirm.addEventListener('click', async () => {
      this.closeImportPreviewModal();
      await this.executeImportWorkflow();
    });

    // Cookie Set Create Modal Events
    this.setCreateCloseBtn.addEventListener('click', () => this.closeCreateSetModal());
    this.btnSetCreateCancel.addEventListener('click', () => this.closeCreateSetModal());
    UIService.bindModalEvents(this.setCreateModal, () => this.closeCreateSetModal());

    this.setCreateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSaveCookieSet();
    });

    this.btnNewSetDialog.addEventListener('click', () => {
      const cookies = this.selectedCookieKeys.size > 0 
        ? this.getSelectedCookies() 
        : this.filteredCookies;
      if (cookies.length === 0) {
        UIService.showToast('No cookies available to create a set', 'warning');
        return;
      }
      this.openCreateSetModal(cookies);
    });

    // Import / Export Controls
    this.exportEncryptedCheckbox.addEventListener('change', () => {
      this.exportPasswordGroup.style.display = this.exportEncryptedCheckbox.checked ? 'flex' : 'none';
    });

    this.btnRunExport.addEventListener('click', () => this.handleRunExport(true));
    if (this.btnCopyExportJson) {
      this.btnCopyExportJson.addEventListener('click', () => this.handleRunExport(false));
    }

    // Dashboard Import Tabs (File vs Paste Text)
    if (this.dashTabImportFile && this.dashTabImportText) {
      this.dashTabImportFile.addEventListener('click', () => {
        this.dashTabImportFile.classList.add('active');
        this.dashTabImportText.classList.remove('active');
        this.dashPaneImportFile.style.display = 'block';
        this.dashPaneImportText.style.display = 'none';
        this.btnRunImportPreview.disabled = !this.pendingImportData;
      });

      this.dashTabImportText.addEventListener('click', () => {
        this.dashTabImportText.classList.add('active');
        this.dashTabImportFile.classList.remove('active');
        this.dashPaneImportText.style.display = 'block';
        this.dashPaneImportFile.style.display = 'none';
        this.btnRunImportPreview.disabled = !this.dashImportTextarea.value.trim();
        this.dashImportTextarea.focus();
      });

      this.dashImportTextarea.addEventListener('input', () => {
        this.btnRunImportPreview.disabled = !this.dashImportTextarea.value.trim();
      });
    }

    // Import Dropzone
    this.importDropzone.addEventListener('click', () => this.importFileInput.click());
    this.importDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.importDropzone.classList.add('dragover');
    });
    this.importDropzone.addEventListener('dragleave', () => {
      this.importDropzone.classList.remove('dragover');
    });
    this.importDropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.importDropzone.classList.remove('dragover');
      if (e.dataTransfer.files?.length > 0) {
        await this.handleFileSelection(e.dataTransfer.files[0]);
      }
    });

    this.importFileInput.addEventListener('change', async (e) => {
      if (e.target.files?.length > 0) {
        await this.handleFileSelection(e.target.files[0]);
      }
    });

    this.btnImportReset.addEventListener('click', () => this.resetImportFile());
    this.btnRunImportPreview.addEventListener('click', () => this.runImportInspection());

    // Cloudflare Sync Controls
    if (this.cloudExportEncrypted) {
      this.cloudExportEncrypted.addEventListener('change', () => {
        this.cloudExportPwBox.style.display = this.cloudExportEncrypted.checked ? 'block' : 'none';
      });
    }
    if (this.btnCloudHealth) {
      this.btnCloudHealth.addEventListener('click', () => this.checkCloudHealth(true));
    }
    if (this.btnCloudPush) {
      this.btnCloudPush.addEventListener('click', () => this.handleCloudPush());
    }
    if (this.btnCloudPull) {
      this.btnCloudPull.addEventListener('click', () => this.handleCloudPull());
    }
    if (this.btnCloudList) {
      this.btnCloudList.addEventListener('click', () => this.handleCloudList());
    }
    if (this.btnDashAutosyncSave) {
      this.btnDashAutosyncSave.addEventListener('click', () => this.saveDashAutoSyncConfig());
    }

    // Settings inputs
    this.settingKdfIterations.addEventListener('change', async (e) => {
      this.pbkdf2Iterations = Number(e.target.value);
      await StorageService.updateSettings({ pbkdf2Iterations: this.pbkdf2Iterations });
      UIService.showToast(`PBKDF2 iterations updated to ${this.pbkdf2Iterations.toLocaleString()}`, 'success');
    });

    this.settingMaskDefault.addEventListener('change', async (e) => {
      this.maskValues = e.target.checked;
      this.updateMaskButtonUI();
      await StorageService.updateSettings({ maskValues: this.maskValues });
      this.renderTable();
    });
  }

  getCookieKey(cookie) {
    return `${(cookie.domain || '').toLowerCase()}|${cookie.path || '/'}|${cookie.name}`;
  }

  getSelectedCookies() {
    return this.filteredCookies.filter(c => this.selectedCookieKeys.has(this.getCookieKey(c)));
  }

  updateBulkRibbon() {
    const count = this.selectedCookieKeys.size;
    if (count > 0) {
      this.bulkRibbon.style.display = 'flex';
      this.selectedCountLabel.textContent = `${count} cookie${count === 1 ? '' : 's'} selected`;
    } else {
      this.bulkRibbon.style.display = 'none';
    }
  }

  async loadCookies() {
    this.showTableState('loading');
    try {
      let cookies = [];
      if (CookieService.isAvailable()) {
        cookies = await CookieService.getAll();
      }
      this.allCookies = cookies;
      this.navCookieCount.textContent = cookies.length;

      this.populateDomainSelector();
      this.applyFilterAndRender();
    } catch (err) {
      this.showTableState('empty', err.message);
    }
  }

  populateDomainSelector() {
    const domains = new Set();
    this.allCookies.forEach(c => {
      if (c.domain) {
        domains.add(c.domain.replace(/^\./, '').toLowerCase());
      }
    });

    const sortedDomains = Array.from(domains).sort();
    const currentVal = this.activeScopeDomain;

    // Reset options
    this.domainSelect.innerHTML = '<option value="__all__">All Accessible Domains</option>';

    sortedDomains.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      if (d === currentVal) {
        opt.selected = true;
      }
      this.domainSelect.appendChild(opt);
    });

    if (currentVal !== '__all__' && !sortedDomains.includes(currentVal)) {
      const opt = document.createElement('option');
      opt.value = currentVal;
      opt.textContent = currentVal;
      opt.selected = true;
      this.domainSelect.appendChild(opt);
    }
  }

  applyFilterAndRender() {
    let list = this.allCookies;

    // 1. Domain Scope Filter
    if (this.activeScopeDomain !== '__all__') {
      const target = this.activeScopeDomain.toLowerCase();
      list = list.filter(c => {
        const cd = (c.domain || '').replace(/^\./, '').toLowerCase();
        return cd === target || cd.endsWith(`.${target}`) || target.endsWith(`.${cd}`);
      });
    }

    // Update Category Badges
    this.countAll.textContent = list.length;
    this.countSecure.textContent = list.filter(c => c.secure).length;
    this.countHttpOnly.textContent = list.filter(c => c.httpOnly).length;
    this.countSession.textContent = list.filter(c => c.session).length;
    this.countPersistent.textContent = list.filter(c => !c.session).length;

    // 2. Filter Category
    if (this.activeFilter === 'secure') {
      list = list.filter(c => c.secure);
    } else if (this.activeFilter === 'httponly') {
      list = list.filter(c => c.httpOnly);
    } else if (this.activeFilter === 'session') {
      list = list.filter(c => c.session);
    } else if (this.activeFilter === 'persistent') {
      list = list.filter(c => !c.session);
    }

    // 3. Search Query
    if (this.searchQuery) {
      list = list.filter(c => 
        (c.name && c.name.toLowerCase().includes(this.searchQuery)) ||
        (c.domain && c.domain.toLowerCase().includes(this.searchQuery)) ||
        (c.path && c.path.toLowerCase().includes(this.searchQuery)) ||
        (c.value && c.value.toLowerCase().includes(this.searchQuery))
      );
    }

    // 4. Sorting
    list.sort((a, b) => {
      switch (this.activeSort) {
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'domain_asc':
          return (a.domain || '').localeCompare(b.domain || '');
        case 'expiry_asc':
          return (a.expirationDate || Infinity) - (b.expirationDate || Infinity);
        case 'expiry_desc':
          return (b.expirationDate || 0) - (a.expirationDate || 0);
        case 'name_asc':
        default:
          return (a.name || '').localeCompare(b.name || '');
      }
    });

    this.filteredCookies = list;
    this.renderTable();
  }

  renderTable() {
    this.cookieTableBody.innerHTML = '';
    this.tableTotalCount.textContent = `Showing ${this.filteredCookies.length} of ${this.allCookies.length} total cookies`;

    if (this.filteredCookies.length === 0) {
      this.showTableState('empty');
      return;
    }

    this.showTableState('content');

    const fragment = document.createDocumentFragment();

    for (const cookie of this.filteredCookies) {
      const key = this.getCookieKey(cookie);
      const isSelected = this.selectedCookieKeys.has(key);

      const tr = document.createElement('tr');

      // Checkbox
      const tdCheck = document.createElement('td');
      tdCheck.className = 'col-checkbox';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = isSelected;
      chk.setAttribute('aria-label', `Select ${cookie.name}`);
      chk.addEventListener('change', () => {
        if (chk.checked) {
          this.selectedCookieKeys.add(key);
        } else {
          this.selectedCookieKeys.delete(key);
        }
        this.updateBulkRibbon();
      });
      tdCheck.appendChild(chk);

      // Name
      const tdName = document.createElement('td');
      tdName.className = 'col-name';
      tdName.textContent = cookie.name;

      // Value
      const tdVal = document.createElement('td');
      tdVal.className = 'col-value';
      tdVal.textContent = UIService.maskValue(cookie.value ?? '', this.maskValues);

      // Domain
      const tdDomain = document.createElement('td');
      tdDomain.className = 'col-domain';
      tdDomain.textContent = cookie.domain;

      // Path
      const tdPath = document.createElement('td');
      tdPath.className = 'col-path';
      tdPath.textContent = cookie.path || '/';

      // Expiry
      const tdExpiry = document.createElement('td');
      tdExpiry.className = 'col-expiry';
      tdExpiry.textContent = UIService.formatExpiration(cookie.expirationDate, cookie.session);

      // Flags & Badges
      const tdFlags = document.createElement('td');
      tdFlags.className = 'col-flags';

      if (cookie.secure) {
        const b = document.createElement('span');
        b.className = 'badge badge-secure';
        b.textContent = 'Secure';
        tdFlags.appendChild(b);
      }
      if (cookie.httpOnly) {
        const b = document.createElement('span');
        b.className = 'badge badge-httponly';
        b.textContent = 'HttpOnly';
        tdFlags.appendChild(b);
      }
      if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
        const b = document.createElement('span');
        b.className = 'badge badge-samesite';
        b.textContent = cookie.sameSite;
        tdFlags.appendChild(b);
      }
      if (cookie.hostOnly) {
        const b = document.createElement('span');
        b.className = 'badge badge-hostonly';
        b.textContent = 'HostOnly';
        tdFlags.appendChild(b);
      }
      if (cookie.partitionKey) {
        const b = document.createElement('span');
        b.className = 'badge badge-partitioned';
        b.textContent = 'Partitioned';
        tdFlags.appendChild(b);
      }

      // Actions
      const tdActions = document.createElement('td');
      tdActions.className = 'col-actions';

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-secondary btn-xs';
      copyBtn.title = 'Copy value';
      copyBtn.textContent = '📋';
      copyBtn.onclick = async (e) => {
        e.stopPropagation();
        await UIService.copyToClipboard(cookie.value ?? '');
        UIService.showToast(`Copied value of "${cookie.name}"`, 'success', 2000);
      };

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-secondary btn-xs';
      editBtn.title = 'Edit cookie';
      editBtn.textContent = '✏️';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        this.openEditCookieModal(cookie);
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-danger btn-xs';
      delBtn.title = 'Delete cookie';
      delBtn.textContent = '🗑️';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        this.openConfirmModal(
          `Delete "${cookie.name}"?`,
          `Are you sure you want to remove this cookie from ${cookie.domain}?`,
          false,
          async () => {
            await CookieService.remove(cookie);
            UIService.showToast(`Deleted "${cookie.name}"`, 'success');
            await this.loadCookies();
          }
        );
      };

      tdActions.appendChild(copyBtn);
      tdActions.appendChild(editBtn);
      tdActions.appendChild(delBtn);

      tr.appendChild(tdCheck);
      tr.appendChild(tdName);
      tr.appendChild(tdVal);
      tr.appendChild(tdDomain);
      tr.appendChild(tdPath);
      tr.appendChild(tdExpiry);
      tr.appendChild(tdFlags);
      tr.appendChild(tdActions);

      fragment.appendChild(tr);
    }

    this.cookieTableBody.appendChild(fragment);

    // Update select-all checkbox state
    const allFilteredSelected = this.filteredCookies.length > 0 && 
      this.filteredCookies.every(c => this.selectedCookieKeys.has(this.getCookieKey(c)));
    this.thSelectAll.checked = allFilteredSelected;
  }

  showTableState(state, message = '') {
    this.tableLoading.style.display = 'none';
    this.tableEmpty.style.display = 'none';
    this.cookieTableBody.parentElement.style.display = 'table';

    if (state === 'loading') {
      this.tableLoading.style.display = 'flex';
      this.cookieTableBody.parentElement.style.display = 'none';
    } else if (state === 'empty') {
      this.tableEmpty.style.display = 'flex';
      this.tableEmptyDesc.textContent = message || (this.searchQuery 
        ? `No cookies match search "${this.searchQuery}".` 
        : 'No cookies found in this scope.');
      this.cookieTableBody.parentElement.style.display = 'none';
    }
  }

  // Cookie Editor Dialog
  openAddCookieModal() {
    this.editingCookie = null;
    this.modalTitle.textContent = 'Add New Cookie';
    this.formError.style.display = 'none';
    this.btnModalDelete.style.display = 'none';
    this.btnModalSave.textContent = 'Create Cookie';

    this.formName.value = '';
    this.formValue.value = '';
    this.formDomain.value = this.activeScopeDomain !== '__all__' 
      ? `.${this.activeScopeDomain.replace(/^\./, '')}` 
      : '';
    this.formPath.value = '/';
    this.formSameSite.value = 'unspecified';
    this.formPartitionKey.value = '';
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
    this.btnModalSave.textContent = 'Save Changes';

    this.formName.value = cookie.name;
    this.formValue.value = cookie.value ?? '';
    this.formDomain.value = cookie.domain;
    this.formPath.value = cookie.path || '/';
    this.formSameSite.value = cookie.sameSite || 'unspecified';
    this.formPartitionKey.value = cookie.partitionKey?.topLevelSite || '';
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

    if (this.formPartitionKey.value.trim()) {
      payload.partitionKey = {
        topLevelSite: this.formPartitionKey.value.trim()
      };
    }

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

  // Confirmation Modal
  openConfirmModal(title, message, requireTypedDelete, onProceed) {
    this.confirmTitle.textContent = title;
    this.confirmMessage.textContent = message;
    this.confirmTypedBox.style.display = requireTypedDelete ? 'block' : 'none';
    this.confirmTypedInput.value = '';
    this.confirmModal.style.display = 'flex';

    this.btnConfirmProceed.onclick = async () => {
      if (requireTypedDelete && this.confirmTypedInput.value.trim().toUpperCase() !== 'DELETE') {
        UIService.showToast('Please type "DELETE" exactly to confirm this destructive operation', 'warning');
        return;
      }
      this.closeConfirmModal();
      try {
        await onProceed();
      } catch (err) {
        UIService.showToast(`Error: ${err.message}`, 'error');
      }
    };
  }

  closeConfirmModal() {
    this.confirmModal.style.display = 'none';
  }

  // Cookie Sets
  async loadCookieSets() {
    const sets = await CookieSetsService.listSets();
    this.navSetsCount.textContent = sets.length;

    if (sets.length === 0) {
      this.setsEmpty.style.display = 'flex';
      this.setsGrid.style.display = 'none';
      return;
    }

    this.setsEmpty.style.display = 'none';
    this.setsGrid.style.display = 'grid';
    this.setsGrid.innerHTML = '';

    sets.forEach(set => {
      const card = document.createElement('div');
      card.className = 'set-card';

      const header = document.createElement('div');
      header.className = 'set-card-header';

      const title = document.createElement('h3');
      title.className = 'set-title';
      title.textContent = set.name;

      const badge = document.createElement('span');
      badge.className = 'badge badge-accent';
      badge.textContent = `${set.itemCount || set.cookies.length} cookies`;

      header.appendChild(title);
      header.appendChild(badge);

      const desc = document.createElement('p');
      desc.className = 'set-desc';
      desc.textContent = set.description || 'No description provided';

      const meta = document.createElement('div');
      meta.className = 'set-meta';
      meta.textContent = `Domain: ${set.domain} • Created: ${new Date(set.createdAt).toLocaleDateString()}`;

      const actions = document.createElement('div');
      actions.className = 'set-card-actions';

      const restoreMergeBtn = document.createElement('button');
      restoreMergeBtn.className = 'btn btn-primary btn-xs';
      restoreMergeBtn.textContent = 'Restore (Merge)';
      restoreMergeBtn.onclick = () => this.handleRestoreSet(set.id, 'merge');

      const restoreReplaceBtn = document.createElement('button');
      restoreReplaceBtn.className = 'btn btn-secondary btn-xs';
      restoreReplaceBtn.textContent = 'Restore (Replace)';
      restoreReplaceBtn.onclick = () => this.handleRestoreSet(set.id, 'replace');

      const exportSetBtn = document.createElement('button');
      exportSetBtn.className = 'btn btn-secondary btn-xs';
      exportSetBtn.textContent = 'Export';
      exportSetBtn.onclick = () => {
        ImportExportService.exportCookies(set.cookies, {
          filename: `cookie-set-${set.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`,
          metadata: { setName: set.name, setDescription: set.description }
        });
      };

      const delSetBtn = document.createElement('button');
      delSetBtn.className = 'btn btn-danger btn-xs';
      delSetBtn.textContent = 'Delete';
      delSetBtn.onclick = () => {
        this.openConfirmModal(
          `Delete Cookie Set "${set.name}"?`,
          'This snapshot will be removed from your local storage.',
          false,
          async () => {
            await CookieSetsService.deleteSet(set.id);
            UIService.showToast(`Deleted cookie set "${set.name}"`, 'success');
            await this.loadCookieSets();
          }
        );
      };

      actions.appendChild(restoreMergeBtn);
      actions.appendChild(restoreReplaceBtn);
      actions.appendChild(exportSetBtn);
      actions.appendChild(delSetBtn);

      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(meta);
      card.appendChild(actions);

      this.setsGrid.appendChild(card);
    });
  }

  async handleRestoreSet(setId, strategy) {
    this.openConfirmModal(
      `Restore Cookie Set (${strategy.toUpperCase()})?`,
      strategy === 'replace'
        ? 'Existing cookies for the set domain will be cleared before applying this snapshot.'
        : 'Cookies from the set will be written to the browser, updating matching cookies.',
      false,
      async () => {
        const report = await CookieSetsService.restoreSet(setId, strategy);
        UIService.showToast(`Restored: ${report.applied} applied (${report.failed} failed)`, 'success');
        await this.loadCookies();
      }
    );
  }

  openCreateSetModal(cookies) {
    this.pendingSetCookies = cookies;
    this.setItemCountInfo.textContent = `Saving snapshot of ${cookies.length} cookie(s).`;
    this.setNameInput.value = '';
    this.setDescInput.value = '';
    this.setCreateModal.style.display = 'flex';
    this.setNameInput.focus();
  }

  closeCreateSetModal() {
    this.setCreateModal.style.display = 'none';
    this.pendingSetCookies = [];
  }

  async handleSaveCookieSet() {
    const name = this.setNameInput.value.trim();
    const desc = this.setDescInput.value.trim();
    if (!name) return;

    try {
      await CookieSetsService.createSet(name, desc, this.pendingSetCookies, this.activeScopeDomain);
      UIService.showToast(`Created Cookie Set "${name}"`, 'success');
      this.closeCreateSetModal();
      await this.loadCookieSets();
    } catch (err) {
      UIService.showToast(`Failed: ${err.message}`, 'error');
    }
  }

  // Import & Export Workflows
  async handleRunExport(download = true) {
    const scope = this.exportScope.value;
    let targetCookies = [];

    if (scope === 'selected') {
      targetCookies = this.getSelectedCookies();
      if (targetCookies.length === 0) {
        UIService.showToast('No cookies currently selected. Select cookies in the explorer table first.', 'warning');
        return;
      }
    } else if (scope === 'active_domain') {
      targetCookies = this.filteredCookies;
    } else {
      targetCookies = this.allCookies;
    }

    if (targetCookies.length === 0) {
      UIService.showToast('No cookies available in the chosen scope to export.', 'warning');
      return;
    }

    const encrypt = this.exportEncryptedCheckbox.checked;
    let password = '';

    if (encrypt) {
      password = this.exportPassword.value;
      const confirm = this.exportPasswordConfirm.value;
      if (!password || password.length < 6) {
        UIService.showToast('Password must be at least 6 characters long.', 'error');
        return;
      }
      if (password !== confirm) {
        UIService.showToast('Password confirmation does not match.', 'error');
        return;
      }
    }

    const filename = this.exportFilename.value.trim() || undefined;

    try {
      const res = await ImportExportService.exportCookies(targetCookies, {
        encrypt,
        password,
        iterations: this.pbkdf2Iterations,
        filename,
        download,
        metadata: {
          scope,
          domain: this.activeScopeDomain
        }
      });
      if (!download) {
        await UIService.copyToClipboard(res.content);
        UIService.showToast(`Copied ${targetCookies.length} cookies as JSON to clipboard`, 'success');
      } else {
        UIService.showToast(`Exported ${targetCookies.length} cookies (${res.filename})`, 'success');
      }
    } catch (err) {
      UIService.showToast(`Export failed: ${err.message}`, 'error');
    }
  }

  async handleFileSelection(file) {
    try {
      const { isEncrypted, parsedData } = await ImportExportService.readFile(file);
      this.pendingImportFile = file;
      this.pendingImportData = parsedData;

      this.importFileName.textContent = file.name;
      this.importFileMeta.textContent = `${(file.size / 1024).toFixed(1)} KB • ${isEncrypted ? '🔒 AES-GCM Encrypted' : '📄 Plain JSON'}`;
      this.importDropzone.style.display = 'none';
      this.importFileStatus.style.display = 'flex';
      this.btnRunImportPreview.disabled = false;
    } catch (err) {
      UIService.showToast(`File error: ${err.message}`, 'error');
      this.resetImportFile();
    }
  }

  resetImportFile() {
    this.pendingImportFile = null;
    this.pendingImportData = null;
    this.importFileInput.value = '';
    this.importDropzone.style.display = 'block';
    this.importFileStatus.style.display = 'none';
    this.btnRunImportPreview.disabled = true;
  }

  async runImportInspection() {
    const isTextTab = this.dashTabImportText?.classList.contains('active');
    if (isTextTab) {
      const text = this.dashImportTextarea.value.trim();
      if (!text) {
        UIService.showToast('Please paste cookie JSON in the text area first.', 'warning');
        return;
      }
      try {
        const parsed = ImportExportService.parseJsonText(text);
        this.pendingImportData = parsed.parsedData;
      } catch (err) {
        UIService.showToast(`JSON parse error: ${err.message}`, 'error');
        return;
      }
    }

    if (!this.pendingImportData) return;

    if (this.pendingImportData.format === 'advanced-cookie-editor-encrypted') {
      // Prompt for password
      this.openPasswordModal();
    } else {
      await this.processDecryptedPayload(this.pendingImportData);
    }
  }

  openPasswordModal() {
    this.pwError.style.display = 'none';
    this.importPasswordInput.value = '';
    this.passwordModal.style.display = 'flex';
    this.importPasswordInput.focus();
  }

  closePasswordModal() {
    this.passwordModal.style.display = 'none';
  }

  async handlePasswordDecrypt() {
    const pw = this.importPasswordInput.value;
    if (!pw) return;

    try {
      const decrypted = await ImportExportService.decryptBackup(this.pendingImportData, pw);
      this.closePasswordModal();
      await this.processDecryptedPayload(decrypted);
    } catch (err) {
      this.pwError.textContent = err.message;
      this.pwError.style.display = 'block';
    }
  }

  async processDecryptedPayload(payload) {
    const validation = validateImportPayload(payload);
    if (!validation.valid) {
      UIService.showToast(`Invalid backup format: ${validation.error}`, 'error');
      return;
    }

    const { conflicts, additions } = await ImportExportService.analyzeImport(validation.cookies);

    this.previewTotalCount.textContent = validation.cookies.length;
    this.previewAdditionsCount.textContent = additions.length;
    this.previewConflictsCount.textContent = conflicts.length;

    if (conflicts.length > 0) {
      this.conflictListContainer.style.display = 'block';
      this.conflictItems.innerHTML = '';
      conflicts.slice(0, 50).forEach(c => {
        const item = document.createElement('div');
        item.textContent = `• ${c.imported.name} (${c.imported.domain})`;
        this.conflictItems.appendChild(item);
      });
      if (conflicts.length > 50) {
        const more = document.createElement('div');
        more.textContent = `...and ${conflicts.length - 50} more conflicts.`;
        this.conflictItems.appendChild(more);
      }
    } else {
      this.conflictListContainer.style.display = 'none';
    }

    this.pendingValidatedCookies = validation.cookies;
    this.importConfirmModal.style.display = 'flex';
  }

  closeImportPreviewModal() {
    this.importConfirmModal.style.display = 'none';
  }

  async executeImportWorkflow() {
    if (!this.pendingValidatedCookies) return;

    const strategy = this.importStrategy.value;
    const scopeDomain = this.activeScopeDomain !== '__all__' ? this.activeScopeDomain : '';

    try {
      const results = await ImportExportService.executeImport(
        this.pendingValidatedCookies,
        strategy,
        scopeDomain
      );

      UIService.showToast(`Import finished: ${results.applied} applied, ${results.failed} failed.`, 'success');

      // Display results log table
      this.importResultsContainer.style.display = 'block';
      this.importSummaryBadge.textContent = `${results.applied} / ${results.total}`;
      this.importLogTable.innerHTML = '';

      results.details.forEach(item => {
        const row = document.createElement('div');
        row.className = `log-row ${item.success ? 'log-success' : 'log-fail'}`;
        row.innerHTML = `<span>${item.name} (${item.domain})</span><span>${item.success ? '✓ Added' : `✗ Failed: ${item.error}`}</span>`;
        this.importLogTable.appendChild(row);
      });

      await this.loadCookies();
    } catch (err) {
      UIService.showToast(`Import execution failed: ${err.message}`, 'error');
    }
  }

  // Cloudflare Server Sync Handlers (warnet.web.id)
  async checkCloudHealth(verbose = false) {
    if (!this.cloudHealthBadge) return;
    this.cloudHealthBadge.textContent = 'Checking...';
    this.cloudHealthBadge.className = 'badge';

    const url = this.cloudServerUrl.value.trim() || 'https://warnet.web.id/api/_extension_/cookies';
    const isHealthy = await ImportExportService.checkServerHealth(url);

    if (isHealthy) {
      this.cloudHealthBadge.textContent = '🟢 Online (v1.0.0)';
      this.cloudHealthBadge.className = 'badge badge-secure';
      if (verbose) {
        UIService.showToast('Cloudflare server is ONLINE & healthy (warnet.web.id)', 'success');
      }
    } else {
      this.cloudHealthBadge.textContent = '🔴 Offline';
      this.cloudHealthBadge.className = 'badge badge-warning';
      if (verbose) {
        UIService.showToast('Could not connect to server health endpoint.', 'warning');
      }
    }
  }

  async handleCloudPush() {
    const scope = this.cloudExportScope.value;
    let targetCookies = [];

    if (scope === 'active_domain') {
      targetCookies = this.filteredCookies;
    } else {
      targetCookies = this.allCookies;
    }

    if (targetCookies.length === 0) {
      UIService.showToast('No cookies available in selected scope to push.', 'warning');
      return;
    }

    const encrypt = this.cloudExportEncrypted.checked;
    const password = this.cloudExportPassword.value;

    if (encrypt && (!password || password.length < 6)) {
      UIService.showToast('Password must be at least 6 characters for AES-GCM encryption.', 'error');
      this.cloudExportPassword.focus();
      return;
    }

    this.btnCloudPush.disabled = true;
    this.btnCloudPush.textContent = '⬆️ Backing up...';

    try {
      const serverUrl = this.cloudServerUrl.value.trim() || 'https://warnet.web.id/api/_extension_/cookies';
      const result = await ImportExportService.syncToServer(targetCookies, {
        serverUrl,
        encrypt,
        password,
        iterations: this.pbkdf2Iterations,
        metadata: {
          scope,
          domain: this.activeScopeDomain || 'all',
          client: 'Advanced Cookie Editor Dashboard MV3'
        }
      });

      UIService.showToast(`Backed up ${targetCookies.length} cookies to warnet.web.id (${result.filename})`, 'success');
      this.showCloudStatus(`Backup saved: ${result.filename} (${targetCookies.length} cookies, ${result.size ? (result.size/1024).toFixed(1) + ' KB' : 'ok'})`);
    } catch (err) {
      UIService.showToast(`Cloud backup failed: ${err.message}`, 'error');
      this.showCloudStatus(`Error: ${err.message}`, true);
    } finally {
      this.btnCloudPush.disabled = false;
      this.btnCloudPush.textContent = '⬆️ Push Backup to Server';
    }
  }

  async handleCloudPull() {
    this.btnCloudPull.disabled = true;
    this.btnCloudPull.textContent = '⬇️ Fetching...';

    try {
      const serverUrl = this.cloudServerUrl.value.trim() || 'https://warnet.web.id/api/_extension_/cookies';
      const { payload: rawData, filename } = await ImportExportService.fetchLatestFromServer(serverUrl);

      if (!rawData) {
        throw new Error('No backup data returned from server');
      }

      let payload = rawData;
      if (rawData.format === 'advanced-cookie-editor-encrypted') {
        const pw = this.cloudImportPassword.value;
        if (!pw) {
          UIService.showToast(`Server backup (${filename}) is encrypted. Please enter password and try again.`, 'warning');
          this.cloudImportPassword.focus();
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
        throw new Error(`Invalid cloud backup: ${validation.error}`);
      }

      const strategy = this.cloudImportStrategy.value;
      const scopeDomain = strategy === 'replace' && this.activeScopeDomain !== '__all__' ? this.activeScopeDomain : '';

      const results = await ImportExportService.executeImport(validation.cookies, strategy, scopeDomain);
      UIService.showToast(`Restored ${results.applied} cookies from warnet.web.id (${filename})`, 'success');
      this.showCloudStatus(`Restored ${results.applied} cookies from ${filename} (${results.failed} failed)`);
      await this.loadCookies();
    } catch (err) {
      UIService.showToast(`Cloud restore failed: ${err.message}`, 'error');
      this.showCloudStatus(`Error: ${err.message}`, true);
    } finally {
      this.btnCloudPull.disabled = false;
      this.btnCloudPull.textContent = '⬇️ Restore Latest';
    }
  }

  async handleCloudList() {
    this.btnCloudList.disabled = true;
    try {
      const serverUrl = this.cloudServerUrl.value.trim() || 'https://warnet.web.id/api/_extension_/cookies';
      const backups = await ImportExportService.listServerBackups(serverUrl);

      if (!backups || backups.length === 0) {
        UIService.showToast('No backups stored on server yet.', 'info');
        this.showCloudStatus('No backups stored on server yet.');
        return;
      }

      const summary = backups.slice(0, 5).map(b => `${b.filename} (${(b.size / 1024).toFixed(1)} KB)`).join('\n');
      UIService.showToast(`Found ${backups.length} backups on warnet.web.id`, 'success');
      this.showCloudStatus(`Backups on server (${backups.length} total):\n${summary}`);
    } catch (err) {
      UIService.showToast(`Failed to list backups: ${err.message}`, 'error');
      this.showCloudStatus(`Error: ${err.message}`, true);
    } finally {
      this.btnCloudList.disabled = false;
    }
  }

  showCloudStatus(msg, isError = false) {
    if (!this.cloudStatusMsg) return;
    this.cloudStatusMsg.textContent = msg;
    this.cloudStatusMsg.style.display = 'block';
    this.cloudStatusMsg.style.whiteSpace = 'pre-line';
    this.cloudStatusMsg.style.color = isError ? 'var(--danger)' : 'var(--text-secondary)';
  }

  // --- Realtime Auto-Sync (5s Interval) Methods ---
  async initDashAutoSync() {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    try {
      const data = await chrome.storage.local.get(['ace_autosync_config', 'ace_autosync_status']);
      const config = data.ace_autosync_config || { enabled: true, intervalSec: 5, serverUrl: 'https://erul.my.id/api/cookies', pcName: 'PC-01' };

      if (this.dashAutosyncEnabled) this.dashAutosyncEnabled.checked = config.enabled !== false;
      if (this.dashAutosyncInterval) this.dashAutosyncInterval.value = config.intervalSec || 5;
      if (this.dashAutosyncPc) this.dashAutosyncPc.value = config.pcName || 'PC-01';

      this.updateDashAutoSyncPill(data.ace_autosync_status, config);
      setInterval(async () => {
        try {
          const d = await chrome.storage.local.get(['ace_autosync_status', 'ace_autosync_config']);
          this.updateDashAutoSyncPill(d.ace_autosync_status, d.ace_autosync_config);
        } catch (_) {}
      }, 3000);
    } catch (_) {}
  }

  updateDashAutoSyncPill(status, config) {
    if (!this.dashAutosyncStatusPill) return;
    const isEnabled = config ? config.enabled !== false : true;
    if (!isEnabled) {
      this.dashAutosyncStatusPill.className = 'badge badge-secondary';
      this.dashAutosyncStatusPill.textContent = 'Auto OFF';
    } else if (status && status.lastStatus === 'error') {
      this.dashAutosyncStatusPill.className = 'badge badge-danger';
      this.dashAutosyncStatusPill.textContent = 'Sync Error';
    } else {
      this.dashAutosyncStatusPill.className = 'badge badge-success';
      const sec = config?.intervalSec || 5;
      this.dashAutosyncStatusPill.textContent = `🟢 Active ${sec}s`;
    }
  }

  async saveDashAutoSyncConfig() {
    const config = {
      enabled: this.dashAutosyncEnabled ? this.dashAutosyncEnabled.checked : true,
      intervalSec: parseInt(this.dashAutosyncInterval?.value, 10) || 5,
      pcName: (this.dashAutosyncPc?.value || 'PC-01').trim(),
      serverUrl: (this.cloudServerUrl?.value || 'https://erul.my.id/api/cookies').trim(),
      scope: 'all'
    };

    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'UPDATE_AUTOSYNC_CONFIG', config });
    }
    await chrome.storage.local.set({ ace_autosync_config: config });
    UIService.showToast(`Auto-Sync disimpan: setiap ${config.intervalSec} detik ke ${config.pcName}`, 'success');
    this.updateDashAutoSyncPill(null, config);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const dashboard = new DashboardController();
  dashboard.init();
});
