#!/usr/bin/env python3
import sys

TARGET_FILE = "/var/www/blog.warnet.web.id/media/download/index.html"

with open(TARGET_FILE, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Navigation Pills in Hero
nav_marker = """          <a href="#section-linux" class="px-3 py-1.5 rounded-lg border border-mono-300 dark:border-mono-800 bg-white dark:bg-mono-900 hover:bg-mono-900 hover:text-white dark:hover:bg-mono-100 dark:hover:text-mono-950 transition-all font-semibold">
            🐧 Linux (GUI, Lite & CLI)
          </a>"""

new_nav_item = """          <a href="#section-linux" class="px-3 py-1.5 rounded-lg border border-mono-300 dark:border-mono-800 bg-white dark:bg-mono-900 hover:bg-mono-900 hover:text-white dark:hover:bg-mono-100 dark:hover:text-mono-950 transition-all font-semibold">
            🐧 Linux (GUI, Lite & CLI)
          </a>
          <a href="#section-extension" class="px-3 py-1.5 rounded-lg border border-mono-300 dark:border-mono-800 bg-white dark:bg-mono-900 hover:bg-mono-900 hover:text-white dark:hover:bg-mono-100 dark:hover:text-mono-950 transition-all font-semibold text-emerald-600 dark:text-emerald-400">
            🍪 Chrome Extension (Cookie Editor)
          </a>"""

if "#section-extension" not in content:
    if nav_marker in content:
        content = content.replace(nav_marker, new_nav_item, 1)
        print("Updated navigation pills.")
    else:
        print("Warning: nav_marker not found exactly.")

# 2. Add Section for Chrome Extension
section_marker = '<section id="section-tools"'

extension_section = """      <!-- ========================================== -->
      <!-- SECTION: CHROME EXTENSION (COOKIE EDITOR)  -->
      <!-- ========================================== -->
      <section id="section-extension" class="space-y-6">
        <div class="flex items-center justify-between pb-3 border-b border-mono-200 dark:border-mono-800">
          <div class="flex items-center space-x-3">
            <div class="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg">
              🍪
            </div>
            <div>
              <h2 class="text-xl sm:text-2xl font-black text-mono-900 dark:text-mono-100 tracking-tight">
                Advanced Cookie Editor — Chrome Extension MV3
              </h2>
              <p class="text-xs font-mono text-mono-600 dark:text-mono-400">Ekstensi browser Chrome / Chromium untuk inspeksi, modifikasi, enkripsi AES-GCM 256-bit, dan sinkronisasi cookie cloud ke warnet.web.id.</p>
            </div>
          </div>
          <span class="text-xs font-mono px-2.5 py-1 rounded bg-mono-200 dark:bg-mono-800 text-mono-900 dark:text-mono-100 font-bold">v1.0.0 MV3</span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">

          <!-- CARD: EXTENSION ZIP DOWNLOAD -->
          <div class="rounded-2xl border-2 border-mono-900 dark:border-mono-100 bg-white dark:bg-mono-900/50 p-6 flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div class="absolute top-0 right-0 bg-mono-900 dark:bg-mono-100 text-white dark:text-mono-950 font-mono text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
              MANIFEST V3 RESMI
            </div>

            <div class="space-y-4">
              <div class="space-y-1">
                <div class="text-xs font-mono text-mono-500 uppercase">CHROME EXTENSION PACKAGE</div>
                <h3 class="text-xl font-bold text-mono-900 dark:text-mono-100">
                  Advanced-Cookie-Editor-v1.0.0.zip
                </h3>
                <p class="text-xs text-mono-600 dark:text-mono-400 leading-relaxed">
                  Ekstensi Chrome modular berbasis Manifest V3 dengan native ES Modules, Web Crypto API AES-GCM (PBKDF2 SHA-256), Cookie Sets snapshot, developer dashboard & popup interface responsif.
                </p>
              </div>

              <!-- SPECS PILLS -->
              <div class="grid grid-cols-2 gap-2 text-[11px] font-mono py-2 border-y border-mono-200 dark:border-mono-800">
                <div class="flex items-center space-x-1.5 text-mono-600 dark:text-mono-400">
                  <span>📦</span>
                  <span>Ukuran: <strong>65 KB</strong></span>
                </div>
                <div class="flex items-center space-x-1.5 text-mono-600 dark:text-mono-400">
                  <span>⚙️</span>
                  <span>Engine: <strong>Manifest V3</strong></span>
                </div>
                <div class="flex items-center space-x-1.5 text-mono-600 dark:text-mono-400">
                  <span>🔐</span>
                  <span>Cipher: <strong>AES-GCM 256</strong></span>
                </div>
                <div class="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400">
                  <span>☁️</span>
                  <span>Sync: <strong>warnet.web.id</strong></span>
                </div>
              </div>

              <!-- FEATURE BULLETS -->
              <ul class="text-xs font-mono text-mono-700 dark:text-mono-300 space-y-1.5">
                <li class="flex items-center space-x-2">
                  <span class="text-emerald-500 font-bold">✓</span>
                  <span>Operasi CRUD penuh (Create, Read, Update, Delete) cookie.</span>
                </li>
                <li class="flex items-center space-x-2">
                  <span class="text-emerald-500 font-bold">✓</span>
                  <span>Backup terenkripsi client-side dengan PBKDF2 SHA-256.</span>
                </li>
                <li class="flex items-center space-x-2">
                  <span class="text-emerald-500 font-bold">✓</span>
                  <span>Sinkronisasi instan 1-klik ke API cloud <code class="px-1 py-0.5 rounded bg-mono-200 dark:bg-mono-800 text-[11px]">warnet.web.id</code>.</span>
                </li>
                <li class="flex items-center space-x-2">
                  <span class="text-emerald-500 font-bold">✓</span>
                  <span>Multi-profile session switching via Cookie Sets snapshot.</span>
                </li>
              </ul>
            </div>

            <!-- DOWNLOAD BUTTONS -->
            <div class="mt-6 space-y-2">
              <a href="/downloads/Advanced-Cookie-Editor-v1.0.0.zip" download class="w-full inline-flex items-center justify-center space-x-2 py-3.5 rounded-xl bg-mono-900 hover:bg-mono-800 dark:bg-mono-100 dark:hover:bg-mono-200 text-white dark:text-mono-950 font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-md group">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                <span>UNDUH EXTENSION (.ZIP)</span>
                <span class="text-[10px] opacity-75 font-normal">(65 KB)</span>
              </a>

              <div class="flex items-center gap-2">
                <a href="#install-extension-guide" class="flex-1 inline-flex items-center justify-center space-x-1.5 py-2.5 rounded-lg border border-mono-300 dark:border-mono-700 hover:bg-mono-100 dark:hover:bg-mono-900 text-mono-900 dark:text-mono-100 font-mono text-xs font-bold transition-all">
                  <span>📖 CARA PASANG</span>
                </a>
                <button onclick="copyHash('bd3c0392a6cfcd0c28b54fc697f2edeea44de342f4b0f53444f76f1bbbd8f3e2')" class="px-3 py-2.5 rounded-lg border border-mono-300 dark:border-mono-700 hover:bg-mono-100 dark:hover:bg-mono-900 text-mono-900 dark:text-mono-100 font-mono text-xs font-bold transition-all" title="Salin SHA-256 Checksum">
                  <span>COPY HASH</span>
                </button>
              </div>
            </div>
          </div>

          <!-- CARD: CLOUD SYNC & INSTALLATION INSTRUCTIONS -->
          <div class="rounded-2xl border border-mono-200 dark:border-mono-800 bg-white dark:bg-mono-900/30 p-6 flex flex-col justify-between space-y-6">
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-mono text-mono-500 uppercase">SERVER ENDPOINT & CLOUD SYNC</span>
                <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>ONLINE</span>
                </span>
              </div>

              <h3 class="text-base font-bold text-mono-900 dark:text-mono-100">
                Integrasi Cloudflare Backup (warnet.web.id)
              </h3>

              <p class="text-xs text-mono-600 dark:text-mono-400 leading-relaxed font-mono">
                Ekstensi terhubung langsung ke mikroservis cadangan privat Anda via Cloudflare Tunnel. Enkripsi terjadi di browser Anda (client-side) sehingga data cookie tersimpan aman di server.
              </p>

              <!-- ENDPOINT CODE BLOCK -->
              <div class="space-y-2 font-mono text-xs">
                <div class="p-3 rounded-xl bg-mono-950 text-mono-200 space-y-1">
                  <div class="text-[10px] text-mono-500 uppercase">ENDPOINT BACKUP SYNC:</div>
                  <div class="text-emerald-400 text-[11px] select-all">https://warnet.web.id/api/_extension_/cookies</div>
                  <div class="text-[10px] text-mono-500 uppercase mt-2">HEALTH CHECK:</div>
                  <div class="text-mono-400 text-[11px] select-all">https://warnet.web.id/api/_extension_/health</div>
                </div>
              </div>

              <!-- INSTALL STEPS -->
              <div id="install-extension-guide" class="pt-2 border-t border-mono-200 dark:border-mono-800 space-y-2 font-mono text-xs">
                <span class="font-bold text-mono-900 dark:text-mono-100 block">Langkah Pemasangan di Chrome:</span>
                <ol class="space-y-1.5 text-mono-600 dark:text-mono-400 text-[11px] list-decimal list-inside">
                  <li>Unduh file <code class="px-1 py-0.5 rounded bg-mono-200 dark:bg-mono-800 text-mono-900 dark:text-mono-100">Advanced-Cookie-Editor-v1.0.0.zip</code> lalu ekstrak ke folder komputer Anda.</li>
                  <li>Buka browser Google Chrome dan ketik URL <code class="px-1 py-0.5 rounded bg-mono-200 dark:bg-mono-800 text-mono-900 dark:text-mono-100">chrome://extensions</code>.</li>
                  <li>Aktifkan toggle <strong>Developer mode</strong> di sudut kanan atas.</li>
                  <li>Klik tombol <strong>Load unpacked</strong> dan pilih folder hasil ekstrak tadi.</li>
                  <li>Ikon Cookie Editor siap digunakan di toolbar browser Anda!</li>
                </ol>
              </div>
            </div>

            <a href="https://warnet.web.id/api/_extension_/health" target="_blank" rel="noopener noreferrer" class="w-full inline-flex items-center justify-center space-x-2 py-2.5 rounded-lg border border-mono-300 dark:border-mono-700 hover:bg-mono-100 dark:hover:bg-mono-900 text-mono-900 dark:text-mono-100 font-mono text-xs font-bold transition-all">
              <span>TEST CLOUD ENDPOINT (JSON) ↗</span>
            </a>
          </div>

        </div>
      </section>

""" + section_marker

if 'id="section-extension"' not in content:
    if section_marker in content:
        content = content.replace(section_marker, extension_section, 1)
        print("Added extension section.")
    else:
        print("Warning: section_marker not found.")

# 3. Add to Checksums Table
checksum_marker = """              <tr>
                <td class="p-3.5 font-bold text-mono-900 dark:text-mono-100">WarnetPCClient-Linux-1.0.18.zip</td>"""

checksum_row = """              <tr>
                <td class="p-3.5 font-bold text-mono-900 dark:text-mono-100">Advanced-Cookie-Editor-v1.0.0.zip</td>
                <td class="p-3.5">65 KB</td>
                <td class="p-3.5 text-[11px] text-mono-500 truncate max-w-xs" title="bd3c0392a6cfcd0c28b54fc697f2edeea44de342f4b0f53444f76f1bbbd8f3e2">bd3c0392a6cfcd0c28b54fc697f2edeea44de342f4b0f53444f76f1bbbd8f3e2</td>
                <td class="p-3.5 text-right"><button onclick="copyHash('bd3c0392a6cfcd0c28b54fc697f2edeea44de342f4b0f53444f76f1bbbd8f3e2')" class="px-2 py-1 rounded bg-mono-200 dark:bg-mono-800 hover:bg-mono-300 dark:hover:bg-mono-700 font-bold">Copy</button></td>
              </tr>
""" + checksum_marker

if "Advanced-Cookie-Editor-v1.0.0.zip" not in content:
    if checksum_marker in content:
        content = content.replace(checksum_marker, checksum_row, 1)
        print("Added checksum table row.")
    else:
        print("Warning: checksum_marker not found.")

with open(TARGET_FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("Update completed successfully!")
