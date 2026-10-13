import sys

cf_path = '/etc/cloudflared/config.yml'
with open(cf_path, 'r') as f:
    content = f.read()

target = '  - hostname: warnet.web.id\n    path: ^/(api|v1|ws|health|docs|openapi.json|uploads)'
new_rule = '''  - hostname: warnet.web.id
    path: ^/(api/_extension_|api/backup/cookies)
    service: http://127.0.0.1:8099
  - hostname: api.warnet.web.id
    path: ^/(api/_extension_|_extension_|api/backup/cookies|backup/cookies)
    service: http://127.0.0.1:8099
'''

if target in content and '8099' not in content:
    content = content.replace(target, new_rule + target, 1)
    with open(cf_path, 'w') as f:
        f.write(content)
    print('SUCCESS_UPDATED_CLOUDFLARED')
else:
    print('TARGET_NOT_FOUND_OR_ALREADY_UPDATED')
