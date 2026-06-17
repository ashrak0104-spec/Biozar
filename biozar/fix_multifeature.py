#!/usr/bin/env python3
"""Fix critical issues in multi-feature implementation"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('biozar/web/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

fixes = 0

# ═══════════════════════════════════════════════════
# 1. Fix login screen CSS: remove display:none override
# ═══════════════════════════════════════════════════
old_login = 'id="login-screen" style="display:none;position:fixed;inset:0;background:var(--bg);z-index:9999;display:flex'
new_login = 'id="login-screen" style="display:none;position:fixed;inset:0;background:var(--bg);z-index:9999'
if old_login in c:
    c = c.replace(old_login, new_login, 1)
    fixes += 1
    print('Fix 1: Login screen CSS fixed (removed display:flex override)')
else:
    print('Fix 1: Login screen pattern not found')

# ═══════════════════════════════════════════════════
# 2. Verify/add new nav items
# ═══════════════════════════════════════════════════
nav_items_to_add = [
    ('nav-commandes', "commandes", "📦 Commandes", "hide-production"),
    ('nav-parcelles', "parcelles", "🗺️ Parcelles", "hide-production"),
    ('nav-factures', "factures", "🧾 Factures", "hide-production"),
    ('nav-meteo', "meteo", "🌡️ Météo", "hide-production"),
    ('nav-prix-marche', "prix-marche", "🔄 Prix Marché", "hide-production"),
]

# Find where to insert (before analytics nav)
analytics_nav = '<div class="nav-item hide-production hide-commercial" id="nav-analytics"'
if analytics_nav in c:
    nav_insert = ''
    missing_navs = []
    for nav_id, page, label, css_class in nav_items_to_add:
        if f'id="{nav_id}"' not in c:
            missing_navs.append(f'        <div class="nav-item {css_class}" id="{nav_id}" onclick="showPage(\'{page}\')"><span class="icon">{label}</span></div>')
    if missing_navs:
        nav_insert = '\n'.join(missing_navs) + '\n'
        c = c.replace(analytics_nav, nav_insert + analytics_nav, 1)
        fixes += 1
        print(f'Fix 2: {len(missing_navs)} missing nav items added')
    else:
        print('Fix 2: All nav items already present')
else:
    print('Fix 2: Analytics nav not found')

# ═══════════════════════════════════════════════════
# 3. Add render calls to renderAll for new features
# ═══════════════════════════════════════════════════
old_render = "  renderAnalytics();\n  renderUserInfo();\n  renderSyncHistory();"
new_render = """  renderAnalytics();
  renderCommandes();
  renderParcelles();
  renderFactures();
  renderMeteo();
  renderMarchePrix();
  renderUserInfo();
  renderSyncHistory();"""
if old_render in c:
    c = c.replace(old_render, new_render, 1)
    fixes += 1
    print('Fix 3: New feature render calls added to renderAll()')
else:
    print('Fix 3: renderAll pattern not found')

# ═══════════════════════════════════════════════════
# 4. Fix showLoginScreen to be conditional
# ═══════════════════════════════════════════════════
old_login_check = """// Login check
if (state.currentUser) {
  applyRoleAccess(state.currentRole);
  hideLoginScreen();
} else {
  showLoginScreen();
}"""
new_login_check = """// Login check
if (state.currentUser) {
  applyRoleAccess(state.currentRole);
  var ls = document.getElementById('login-screen');
  if (ls) ls.style.display = 'none';
} else {
  var ls = document.getElementById('login-screen');
  if (ls) ls.style.display = 'flex';
}"""
if old_login_check in c:
    c = c.replace(old_login_check, new_login_check, 1)
    fixes += 1
    print('Fix 4: Login check uses direct style manipulation')
else:
    print('Fix 4: Login check pattern not found')

# ═══════════════════════════════════════════════════
# 5. Verify login screen starts hidden
# ═══════════════════════════════════════════════════
old_doLogin = "  hideLoginScreen();"
new_doLogin = "  var ls = document.getElementById('login-screen');\n  if (ls) ls.style.display = 'none';"
if old_doLogin in c:
    c = c.replace(old_doLogin, new_doLogin, 1)
    fixes += 1
    print('Fix 5: doLogin uses direct style manipulation')
else:
    print('Fix 5: doLogin pattern not found')

with open('biozar/web/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\nTotal fixes applied: {fixes}')
