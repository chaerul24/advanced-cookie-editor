# Advanced Cookie Editor — Chrome Extension MV3

**Advanced Cookie Editor** is a modern, developer-grade Chrome Extension built with **Manifest V3** and pure native ES Modules. It provides full inspection, creation, modification, deletion, and management of browser cookies with military-grade client-side encryption (**AES-GCM 256-bit with PBKDF2**).

No external frameworks, zero third-party telemetry, and 100% local in-browser processing.

---

## 🌟 Fitur Utama

- **Manifest V3 Compliant**: Event-driven background service worker, secure CSP without inline scripts or `eval()`.
- **Dual Interface Modes**:
  - **Quick Popup**: Fast inspection, value masking, quick search, category filtering, and one-click edit/delete for the active tab domain.
  - **Full Developer Dashboard**: Complete multi-column data table, multi-select bulk operations, custom domain selector, cookie set management, and import/export center.
- **Robust CRUD Operations**:
  - **Create**: Add session or persistent cookies with granular attributes (`SameSite`, `HttpOnly`, `Secure`, `Path`, `Domain`, `StoreId`, `PartitionKey`, `HostOnly`).
  - **Read**: Direct integration with `chrome.cookies.getAll()`.
  - **Safe Update Strategy**: Chrome Cookies API does not offer atomic updates. This extension uses a transactional remove-and-recreate workflow with automatic rollback if creation fails.
  - **Delete & Delete All**: Delete individual cookies, clear active site scope, or wipe all accessible cookies with explicit confirmation.
- **Format-Preserving Copy**:
  - Copy as `name=value`.
  - Copy as **RFC 6265 Request Header** (`Cookie: name1=val1; name2=val2`), correctly excluding response attributes (`HttpOnly`, `Path`, `Secure`).
  - Copy as formatted JSON.
- **Versioned JSON Backup**:
  - Schema v1 export structure with metadata and ISO-8601 timestamps.
  - Interoperable with generic array format.
  - Pre-import validation, size limit checks (max 5 MB), and conflict detection.
  - Choice of **Merge** or **Replace** import strategies.
- **Client-Side AES-GCM Encryption**:
  - Uses the **Web Crypto API** (`crypto.subtle`).
  - 256-bit AES-GCM authenticated encryption.
  - PBKDF2 key derivation using SHA-256 with 250,000 iterations (OWASP recommendation).
  - 16-byte random salt and 12-byte random IV per export.
  - Protected against tampering via AES-GCM authentication tag.
- **Custom Cookie Sets**:
  - Save named snapshots of active session cookies.
  - Instantly switch accounts, roles, or testing environments.
  - Restore sets with Merge or Replace options.
- **Developer Tool UX**:
  - Dark and Light themes with persistent preference.
  - Sensitive token value masking (`••••••••`) to protect against shoulder surfing during screencasts.
  - Keyboard accessible modals (Escape to close, focus trapping).
  - Non-intrusive toasts (no blocking native `alert()` dialogs).
- **Context Menus**:
  - Right-click shortcut to launch the dashboard.
  - Right-click shortcut to inspect cookies for the active domain.

---

## 📱 Versi Android APK — Cookie Browser Mobile

Tersedia aplikasi Android mandiri bernama **Cookie Browser** yang mengintegrasikan browser web lengkap (WebView) dengan fitur inspeksi cookie melayang (**Floating Cookie Inspector 🍪**):
- **Full Mobile Web Browser**: Address bar dengan search engine integration, SSL lock badge, Back/Forward, Refresh, Desktop Mode.
- **Live Cookie Sheet**: Tap ikon 🍪 untuk langsung menginspeksi cookie aktif situs yang sedang dibuka secara real-time.
- **CRUD & Masking**: Tambah, ubah nilai, hapus cookie, dan sensor nilai token sensitif.
- **Cloudflare Sync**: 1-klik push/pull backup cookie langsung ke `warnet.web.id/api/_extension_/cookies`.
- **Direct Download**:
  - `https://warnet.web.id/downloads/CookieBrowser-v1.0.0.apk` (48 MB)
  - `https://warnet.web.id/apk/cookie-browser.apk`

---

## 📥 Panduan Instalasi Ekstensi Chrome (Load Unpacked)

1. Buka browser Google Chrome (versi 102 atau yang lebih baru).
2. Kunjungi halaman ekstensi Chrome dengan mengetik `chrome://extensions/` di address bar.
3. Di pojok kanan atas, aktifkan tombol **Developer mode** (Mode pengembang).
4. Klik tombol **Load unpacked** (Muat yang belum dibongkar) di pojok kiri atas.
5. Pilih folder:
   ```
   C:\Users\kusyn\advanced-cookie-editor
   ```
6. Ekstensi **Advanced Cookie Editor** akan segera terpasang dan icon cookie muncul di toolbar Chrome Anda.

---

## 🛡️ Penjelasan Permissions

Ekstensi ini membatasi izin hanya pada apa yang benar-benar esensial untuk fungsinya:

| Permission | Alasan Penggunaan |
| :--- | :--- |
| `cookies` | Diperlukan untuk membaca, memodifikasi, menambah, dan menghapus cookie via `chrome.cookies` API. |
| `storage` | Digunakan untuk menyimpan preferensi pengguna (tema, iterasi KDF, value masking) dan Cookie Sets secara lokal di perangkat Anda. |
| `contextMenus` | Menyediakan menu klik kanan untuk langsung membuka dashboard atau menginspeksi cookie domain aktif. |
| `tabs` & `activeTab` | Mendeteksi domain tab yang sedang aktif saat popup dibuka atau konteks menu diklik agar otomatis memfilter cookie yang relevan. |
| `<all_urls>` | Sebagai universal cookie editor bagi developer, izin host ini diperlukan agar ekstensi dapat mengakses dan mengelola cookie di berbagai domain HTTP/HTTPS yang dipilih pengguna. **Data tidak pernah dikirim ke internet.** |

---

## 📁 Struktur Direktori

```
advanced-cookie-editor/
├── manifest.json                # Chrome Extension Manifest V3 configuration
├── package.json                 # Project scripts (test, icon generation)
├── README.md                    # Dokumentasi lengkap & instalasi
├── SECURITY.md                  # Model ancaman, kriptografi & privasi
├── background/
│   └── service-worker.js        # Event-driven MV3 background worker & context menus
├── popup/
│   ├── popup.html               # Popup HTML interface
│   ├── popup.css                # Popup developer tool styles
│   └── popup.js                 # Popup logic (active domain, quick edit, masking)
├── dashboard/
│   ├── dashboard.html           # Full developer dashboard interface
│   ├── dashboard.css            # Dashboard styling (dark/light theme, data table)
│   └── dashboard.js             # Dashboard controller (table, sets, import/export)
├── modules/
│   ├── cookie-service.js        # Abstraksi Chrome Cookies API & safe transaction updates
│   ├── cookie-validation.js     # Validasi RFC 6265 & Chrome Cookies API rules
│   ├── cookie-serializer.js     # Clipboard formatting & versioned JSON schema
│   ├── crypto-service.js        # Web Crypto AES-GCM + PBKDF2 engine
│   ├── import-export.js         # Import/export pipeline & conflict analysis
│   ├── cookie-sets.js           # Session snapshot management
│   ├── storage-service.js       # chrome.storage.local abstraction & fallback
│   └── ui-service.js            # Toast notifications, modal lifecycle & helpers
├── icons/
│   ├── generate-icons.js        # Script pembuat icon PNG valid menggunakan zlib
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── tests/
    ├── test-runner.js           # Automated test runner
    ├── crypto.test.js           # Unit tests untuk AES-GCM & PBKDF2
    ├── validation.test.js       # Unit tests untuk RFC 6265 cookie validation
    ├── serializer.test.js       # Unit tests untuk schema v1 & header formatting
    └── import-export.test.js    # Unit tests untuk import/export & roundtrip enkripsi
```

---

## 🔒 Format JSON Backup

### 1. Plain JSON Backup (Schema Version 1)
```json
{
  "format": "advanced-cookie-editor",
  "version": 1,
  "exportedAt": "2026-10-13T12:00:00.000Z",
  "itemCount": 2,
  "metadata": {
    "scope": "active_domain",
    "domain": "example.com"
  },
  "cookies": [
    {
      "name": "session_id",
      "value": "s_9f3a8b",
      "domain": ".example.com",
      "hostOnly": false,
      "path": "/",
      "secure": true,
      "httpOnly": true,
      "sameSite": "lax",
      "session": false,
      "expirationDate": 1893456000
    }
  ]
}
```

### 2. Encrypted JSON Backup (Envelope AES-GCM)
```json
{
  "format": "advanced-cookie-editor-encrypted",
  "version": 1,
  "algorithm": "AES-GCM",
  "kdf": "PBKDF2",
  "hash": "SHA-256",
  "iterations": 250000,
  "salt": "base64...",
  "iv": "base64...",
  "ciphertext": "base64...",
  "timestamp": "2026-10-13T12:00:00.000Z"
}
```

---

## 🧪 Menjalankan Automated Unit Tests

Proyek ini dilengkapi dengan rangkaian unit test otomatis tanpa dependensi eksternal (menggunakan native Node.js ES Modules dan `crypto.subtle`):

Jalankan:
```bash
npm test
```
atau langsung:
```bash
node tests/test-runner.js
```

Cakupan pengujian:
1. **Crypto Service**:
   - Base64 encoding/decoding byte arrays.
   - Enkripsi dan dekripsi payload AES-GCM 256-bit.
   - Penolakan password salah.
   - Deteksi modifikasi/tampering pada ciphertext (integritas AES-GCM).
   - Validasi panjang password minimum (>= 6 karakter).
2. **Cookie Validation**:
   - Aturan token nama cookie RFC 6265 (penolakan spasi, titik koma, kontrol karakter).
   - Validasi nilai cookie.
   - Format domain (domain cookie dengan titik awal, IPv4, localhost).
   - Penegakan aturan `SameSite=None` wajib `Secure=true`.
   - Validasi session vs persistent expiration timestamp.
   - Konstruksi URL kanonik (`http://` vs `https://`).
3. **Cookie Serializer**:
   - Format tunggal `name=value`.
   - Format RFC 6265 HTTP Cookie request header (hanya name-value pairs tanpa HttpOnly/Secure/Path).
   - Format Set-Cookie untuk debugging.
   - Validasi struktur Schema v1 JSON export.
   - Validasi payload import terhadap batas keamanan item.
4. **Import / Export Service**:
   - Parsing JSON array langsung dan format schema v1.
   - Deteksi otomatis envelope terenkripsi (`advanced-cookie-editor-encrypted`).
   - Penolakan sintaks JSON tidak valid / rusak.
   - Pembuatan string plain export tanpa download otomatis.
   - Verifikasi ekspor & dekripsi terenkripsi AES-GCM secara menyeluruh (roundtrip).

---

## ☁️ Cloudflare Remote Backup & Sync (`warnet.web.id`)

Fitur sinkronisasi cadangan cookie ke server cloud pribadi via Cloudflare Tunnel:
- **Public Endpoints**:
  - `GET https://warnet.web.id/api/_extension_/health` — Health check endpoint mikroservis
  - `POST https://warnet.web.id/api/_extension_/cookies` — Simpan backup (otomatis dirotasi max 50 file)
  - `GET https://warnet.web.id/api/_extension_/cookies/latest` — Ambil backup terbaru
  - `GET https://warnet.web.id/api/_extension_/cookies` — Daftar seluruh file backup
  - Alias: `https://warnet.web.id/api/backup/cookies`
- **Keamanan & Privasi**:
  - Mendukung enkripsi AES-GCM 256-bit client-side (PBKDF2 SHA-256) sebelum diunggah ke server.
  - Server tidak mengetahui isi plaintext cookie yang terenkripsi password.
  - Backend utama warnet (port 8000) terlindungi penuh tanpa modifikasi kode backend lama.

---

## ⚠️ Batasan Chrome Cookies API

1. **Host Permissions Required**: Ekstensi tidak dapat membaca atau memodifikasi cookie dari origin mana pun tanpa izin host yang cocok di manifest.
2. **SameSite=None Memerlukan Secure**: Chrome memblokir cookie dengan `SameSite=None` (`no_restriction`) jika tidak ditandai `Secure: true`.
3. **Host-Only vs Domain Cookie**: Jika flag `hostOnly` bernilai `true`, atribut `domain` tidak boleh disetel saat memanggil `chrome.cookies.set()`, karena Chrome akan menganggapnya sebagai domain cookie biasa.
4. **Partitioned Cookies (CHIPS)**: Memerlukan browser Chromium 114+ dan hanya tersedia pada konteks `partitionKey`.
5. **No Native Update API**: Mengubah cookie yang sudah ada memerlukan penghapusan (`chrome.cookies.remove()`) lalu pembuatan baru (`chrome.cookies.set()`). Kegagalan selama pembuatan ulang ditangani dengan mekanisme rollback otomatis.

---

## 🛠️ Troubleshooting

- **Popup menampilkan "All Accessible Sites"**: Terjadi jika tab aktif adalah halaman internal browser (`chrome://`, `edge://`, `about:blank`). Buka situs web HTTP/HTTPS biasa untuk mengaktifkan deteksi domain otomatis.
- **Import gagal dengan pesan "Decryption failed"**: Pastikan password yang dimasukkan sama persis dengan saat ekspor dibuat. Jika file diubah atau rusak, AES-GCM akan menolaknya demi alasan keamanan data.
- **Cookie tidak tersimpan**: Periksa apakah cookie memiliki nama kosong, domain tidak valid, atau `SameSite=None` tanpa `Secure`.
