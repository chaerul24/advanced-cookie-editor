# Security Policy — Advanced Cookie Editor

Dokumen ini menguraikan model keamanan, arsitektur enkripsi, dan langkah-langkah perlindungan data yang diterapkan pada **Advanced Cookie Editor**.

---

## 1. Model Ancaman & Prinsip Desain

Cookie browser sering kali berisi token autentikasi (JWT, OAuth session tokens, auth cookies) yang memungkinkan pengambilalihan akun jika bocor. Oleh karena itu, ekstensi ini dibangun berdasarkan prinsip:

1. **Zero External Communication**:
   - Ekstensi **tidak memiliki server eksternal, analitik, atau backend**.
   - Tidak ada panggilan `fetch()`, `XMLHttpRequest`, atau WebSocket ke pihak ketiga.
   - Semua pemrosesan cookie, serialisasi, dan kriptografi berjalan 100% secara lokal dalam memori browser.

2. **No Content Script Cookie Scraping**:
   - Ekstensi **tidak menyuntikkan content script** ke halaman web untuk membaca `document.cookie`.
   - Menggunakan `chrome.cookies` API yang terisolasi dan dikontrol oleh sistem permission Chrome.

3. **Protection Against Memory Exhaustion**:
   - File import dibatasi maksimal **5 MB** dan **10.000 item cookie** untuk mencegah freeze atau Denial of Service (DoS) pada tab browser.

4. **Zero Console Logging of Sensitive Data**:
   - Password pengguna, nilai cookie sensitif, dan ciphertext kriptografis **tidak pernah dicatat ke console log** (`console.log`).

---

## 2. Arsitektur Kriptografi (AES-GCM + PBKDF2)

Fitur ekspor terenkripsi menggunakan implementasi standar industri melalui **Web Crypto API** bawaan browser (`crypto.subtle`):

| Parameter | Spesifikasi | Keterangan |
| :--- | :--- | :--- |
| **Cipher** | AES-GCM | Kunci 256-bit dengan integritas terautentikasi (Auth Tag 128-bit). |
| **KDF** | PBKDF2 | Penurunan kunci dari master password pengguna. |
| **Hash Function** | SHA-256 | Algoritma hashing KDF. |
| **Iterasi KDF** | 250.000 (Default) | Mematuhi rekomendasi OWASP untuk mempersulit serangan brute-force. |
| **Salt** | 16 byte acak | Dibuat menggunakan `crypto.getRandomValues()` untuk setiap sesi ekspor. |
| **IV (Nonce)** | 12 byte acak | 96-bit initialization vector unik untuk setiap enkripsi AES-GCM. |
| **Envelope** | JSON Base64 | Parameter salt, iv, iterasi, dan ciphertext dikemas dalam envelope terstruktur. |

### Deteksi Modifikasi (Tampering Detection)
Mode **AES-GCM** menyediakan enkripsi terautentikasi (*Authenticated Encryption with Associated Data / AEAD*). Jika file backup diubah meskipun hanya 1 bit, verifikasi cryptographic tag akan gagal, dan proses dekripsi akan langsung dibatalkan sebelum data dapat dibaca atau dieksekusi.

---

## 3. Penyamaran Nilai Cookie (Value Masking)

Untuk mencegah kebocoran kredensial akibat *shoulder surfing*, perekaman layar (screencast), atau presentasi daring:
- Fitur penyamaran nilai cookie (`••••••••`) diaktifkan secara default.
- Pengguna dapat beralih antara mode *Masked* dan *Plain* menggunakan tombol toggle di popup maupun dashboard.
- Preferensi ini tersimpan di `chrome.storage.local`.

---

## 4. Keamanan Cookie Sets

- Fitur **Cookie Sets** menyimpan snapshot cookie (termasuk session id dan token) ke dalam `chrome.storage.local`.
- Penyimpanan lokal browser Chrome dilindungi oleh sandbox profil pengguna sistem operasi.
- **Penting**: Jangan mengekspor atau membagikan snapshot Cookie Sets kepada orang lain kecuali dalam format **Encrypted JSON** dengan kata sandi yang kuat.

---

## 5. Melaporkan Kerentanan Keamanan

Jika Anda menemukan potensi kerentanan keamanan dalam Advanced Cookie Editor:
1. Jangan membuat issue publik di repository.
2. Laporkan temuan beserta bukti konsep (Proof of Concept) yang dapat direproduksi kepada tim pengembang.
3. Kerentanan yang valid akan ditinjau dan diperbaiki dengan prioritas tertinggi.
