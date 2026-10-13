#!/usr/bin/env python3

TARGET_FILE = "/var/www/blog.warnet.web.id/media/download/index.html"

with open(TARGET_FILE, "r", encoding="utf-8") as f:
    content = f.read()

# Change grid from md:grid-cols-2 to md:grid-cols-3
old_grid = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">'
new_grid = '<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">'

# Card to insert
android_card = """          <!-- CARD: ANDROID APK WITH BROWSER -->
          <div class="rounded-2xl border-2 border-emerald-600 dark:border-emerald-400 bg-white dark:bg-mono-900/50 p-6 flex flex-col justify-between shadow-lg relative overflow-hidden group">
            <div class="absolute top-0 right-0 bg-emerald-600 text-white font-mono text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
              ANDROID APK + BROWSER
            </div>

            <div class="space-y-4">
              <div class="space-y-1">
                <div class="text-xs font-mono text-emerald-600 dark:text-emerald-400 uppercase font-bold">MOBILE BROWSER & COOKIE INSPECTOR</div>
                <h3 class="text-xl font-bold text-mono-900 dark:text-mono-100">
                  CookieBrowser-v1.0.0.apk
                </h3>
                <p class="text-xs text-mono-600 dark:text-mono-400 leading-relaxed">
                  Aplikasi browser Android lengkap (Address Bar, Navigasi, Desktop Mode) dengan tombol melayang <strong>Cookie Inspector 🍪</strong> untuk inspect, edit, export, dan sync cookie situs secara langsung di HP.
                </p>
              </div>

              <!-- SPECS PILLS -->
              <div class="grid grid-cols-2 gap-2 text-[11px] font-mono py-2 border-y border-mono-200 dark:border-mono-800">
                <div class="flex items-center space-x-1.5 text-mono-600 dark:text-mono-400">
                  <span>📱</span>
                  <span>Ukuran: <strong>48 MB</strong></span>
                </div>
                <div class="flex items-center space-x-1.5 text-mono-600 dark:text-mono-400">
                  <span>🌐</span>
                  <span>Engine: <strong>WebView + Flutter</strong></span>
                </div>
                <div class="flex items-center space-x-1.5 text-mono-600 dark:text-mono-400">
                  <span>🍪</span>
                  <span>Fitur: <strong>Live Cookie Sheet</strong></span>
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
                  <span>Browser web mandiri (buka web apa saja di smartphone).</span>
                </li>
                <li class="flex items-center space-x-2">
                  <span class="text-emerald-500 font-bold">✓</span>
                  <span>Floating button 🍪 untuk baca cookie aktif secara real-time.</span>
                </li>
                <li class="flex items-center space-x-2">
                  <span class="text-emerald-500 font-bold">✓</span>
                  <span>Tambah, edit nilai, hapus cookie, & value masking.</span>
                </li>
                <li class="flex items-center space-x-2">
                  <span class="text-emerald-500 font-bold">✓</span>
                  <span>1-klik sinkronisasi backup ke endpoint cloud <code class="px-1 py-0.5 rounded bg-mono-200 dark:bg-mono-800 text-[11px]">warnet.web.id</code>.</span>
                </li>
              </ul>
            </div>

            <!-- DOWNLOAD BUTTONS -->
            <div class="mt-6 space-y-2">
              <a href="/downloads/CookieBrowser-v1.0.0.apk" download class="w-full inline-flex items-center justify-center space-x-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-md group">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                <span>UNDUH APK ANDROID</span>
                <span class="text-[10px] opacity-80 font-normal">(48 MB)</span>
              </a>

              <div class="flex items-center gap-2">
                <a href="/apk/cookie-browser.apk" download class="flex-1 inline-flex items-center justify-center space-x-1.5 py-2.5 rounded-lg border border-mono-300 dark:border-mono-700 hover:bg-mono-100 dark:hover:bg-mono-900 text-mono-900 dark:text-mono-100 font-mono text-xs font-bold transition-all">
                  <span>DIRECT APK LINK</span>
                </a>
                <button onclick="copyHash('e41b73f18cf99403de0e476af9ceae9b6bd34625f204c29bd6dd5b227c02eaf1')" class="px-3 py-2.5 rounded-lg border border-mono-300 dark:border-mono-700 hover:bg-mono-100 dark:hover:bg-mono-900 text-mono-900 dark:text-mono-100 font-mono text-xs font-bold transition-all" title="Salin SHA-256 Checksum">
                  <span>COPY HASH</span>
                </button>
              </div>
            </div>
          </div>
"""

insert_after = "<!-- CARD: EXTENSION ZIP DOWNLOAD -->"
if "CookieBrowser-v1.0.0.apk" not in content:
    # 1. Update grid column
    if old_grid in content:
        content = content.replace(old_grid, new_grid, 1)

    # 2. Insert android card
    idx = content.find(insert_after)
    if idx != -1:
        # Find the closing tag of this card: </div>\n          </div>
        end_card = content.find("</div>\n          </div>", idx)
        if end_card != -1:
            end_card += len("</div>\n          </div>\n\n")
            content = content[:end_card] + android_card + "\n" + content[end_card:]
            print("Inserted Android APK Card.")
    else:
        print("Warning: insert_after not found")

# 3. Add to Checksum Table
checksum_row = """              <tr>
                <td class="p-3.5 font-bold text-mono-900 dark:text-mono-100">CookieBrowser-v1.0.0.apk</td>
                <td class="p-3.5">48 MB</td>
                <td class="p-3.5 text-[11px] text-mono-500 truncate max-w-xs" title="e41b73f18cf99403de0e476af9ceae9b6bd34625f204c29bd6dd5b227c02eaf1">e41b73f18cf99403de0e476af9ceae9b6bd34625f204c29bd6dd5b227c02eaf1</td>
                <td class="p-3.5 text-right"><button onclick="copyHash('e41b73f18cf99403de0e476af9ceae9b6bd34625f204c29bd6dd5b227c02eaf1')" class="px-2 py-1 rounded bg-mono-200 dark:bg-mono-800 hover:bg-mono-300 dark:hover:bg-mono-700 font-bold">Copy</button></td>
              </tr>
"""
check_target = """              <tr>
                <td class="p-3.5 font-bold text-mono-900 dark:text-mono-100">Advanced-Cookie-Editor-v1.0.0.zip</td>"""

if "CookieBrowser-v1.0.0.apk" not in content and check_target in content:
    content = content.replace(check_target, checksum_row + check_target, 1)
    print("Added APK to Checksum table.")

with open(TARGET_FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("Update completed successfully!")
