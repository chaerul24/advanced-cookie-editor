#!/usr/bin/env python3

TARGET_FILE = "/var/www/blog.warnet.web.id/media/download/index.html"

with open(TARGET_FILE, "r", encoding="utf-8") as f:
    content = f.read()

target = '<td class="p-3.5 font-bold text-mono-900 dark:text-mono-100">Advanced-Cookie-Editor-v1.0.0.zip</td>'
row = """              <tr>
                <td class="p-3.5 font-bold text-mono-900 dark:text-mono-100">CookieBrowser-v1.0.0.apk</td>
                <td class="p-3.5">48 MB</td>
                <td class="p-3.5 text-[11px] text-mono-500 truncate max-w-xs" title="e41b73f18cf99403de0e476af9ceae9b6bd34625f204c29bd6dd5b227c02eaf1">e41b73f18cf99403de0e476af9ceae9b6bd34625f204c29bd6dd5b227c02eaf1</td>
                <td class="p-3.5 text-right"><button onclick="copyHash('e41b73f18cf99403de0e476af9ceae9b6bd34625f204c29bd6dd5b227c02eaf1')" class="px-2 py-1 rounded bg-mono-200 dark:bg-mono-800 hover:bg-mono-300 dark:hover:bg-mono-700 font-bold">Copy</button></td>
              </tr>
              <tr>
                <td class="p-3.5 font-bold text-mono-900 dark:text-mono-100">Advanced-Cookie-Editor-v1.0.0.zip</td>"""

if 'CookieBrowser-v1.0.0.apk</td>' not in content:
    content = content.replace('              <tr>\n                ' + target, row, 1)
    with open(TARGET_FILE, "w", encoding="utf-8") as f:
        f.write(content)
    print("Added APK checksum row!")
else:
    print("Already in table!")
