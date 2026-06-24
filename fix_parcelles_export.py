import re

with open('biozar/web/index.html', 'rb') as f:
    content = f.read()

# Fix 1: Add the CSV export button in the parcelles section header
old_btn = b'        <button class="btn-primary" onclick="showAddParcelleModal()" style="padding:10px 18px;font-size:13px">+ Parcelle</button>\r\n      </div>\r\n      <div class="kpi-grid" id="parcelles-kpis">'
new_btn = b'        <div style="display:flex;gap:8px">\r\n          <button class="btn-primary" onclick="showAddParcelleModal()" style="padding:10px 18px;font-size:13px">+ Parcelle</button>\r\n          <button class="btn-admin" onclick="exportParcellesCSV()" style="padding:10px 18px;font-size:13px">\xf0\x9f\x93\xa5 CSV</button>\r\n        </div>\r\n      </div>\r\n      <div class="kpi-grid" id="parcelles-kpis">'

if old_btn in content:
    content = content.replace(old_btn, new_btn, 1)
    print("Fix 1: CSV button added to parcelles header!")
else:
    print("Fix 1 ERROR: Could not find button location!")

# Fix 2: Add missing showToast call in the empty check
old_empty = b'  if (parcelles.length === 0) {\r\n\r\n    return;\r\n  }'
new_empty = b'  if (parcelles.length === 0) {\r\n    showToast(\'Aucune parcelle \xe0 exporter.\', \'error\');\r\n    return;\r\n  }'

if old_empty in content:
    content = content.replace(old_empty, new_empty, 1)
    print("Fix 2: showToast added on empty check!")
else:
    print("Fix 2 ERROR: Could not find empty check!")

# Fix 3: Add missing lines.push for surface totale and rendement reel
old_lines = b"  var totalReel = parcelles.reduce(function(a,p) { return a + (p.rendementReel || 0); }, 0);\r\n\r\n  lines.push('Rendement objectif total (kg);' + totalObj);"
new_lines = b"  var totalReel = parcelles.reduce(function(a,p) { return a + (p.rendementReel || 0); }, 0);\r\n  lines.push('Surface totale (m\\xc2\\xb2);' + totalSurf);\r\n  lines.push('Rendement objectif total (kg);' + totalObj);\r\n  lines.push('Rendement r\\xc3\\xa9el total (kg);' + totalReel);"

if old_lines in content:
    content = content.replace(old_lines, new_lines, 1)
    print("Fix 3: Missing lines.push added!")
else:
    print("Fix 3 ERROR: Could not find lines location!")
    idx = content.find(b'var totalReel = parcelles.reduce')
    if idx >= 0:
        print(f"Found at {idx}: {content[idx:idx+200]}")

with open('biozar/web/index.html', 'wb') as f:
    f.write(content)

print("Done!")
