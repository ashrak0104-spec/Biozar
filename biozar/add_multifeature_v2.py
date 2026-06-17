#!/usr/bin/env python3
"""Add multi-user role system + 5 new features to biozar/web/index.html"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('biozar/web/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

fixes = 0

# ═══════════════════════════════════════════════════
# 1. Add new state keys for all features
# ═══════════════════════════════════════════════════
new_state = """  currentUser: null,
  currentRole: null,
  users: [
    { login: 'admin', name: 'Admin Direction', role: 'admin', password: 'biozar2026' },
    { login: 'production', name: 'Chef Production', role: 'production', password: 'prod2026' },
    { login: 'commercial', name: 'Commercial', role: 'commercial', password: 'comm2026' },
    { login: 'logistique', name: 'Logistique', role: 'logistics', password: 'logi2026' },
    { login: 'agent', name: 'Agent', role: 'operator', password: 'agent2026' },
  ],
  roleConfig: {
    admin:       { label: '👨\\u200d💼 Admin/Direction', pages: ['dashboard','finances','production','clients','produits','marketing','reporting','risques','bmc','notifications','analytics','admin','commandes','parcelles','factures','meteo','prix-marche'] },
    production:  { label: '🌱 Chef Production',     pages: ['dashboard','production','parcelles','risques','notifications','meteo'] },
    commercial:  { label: '💼 Commercial',           pages: ['dashboard','clients','produits','marketing','reporting','commandes','factures','prix-marche','notifications'] },
    logistics:   { label: '📦 Logistique',           pages: ['dashboard','production','commandes','parcelles','notifications'] },
    operator:    { label: '👁\\u200d Agent',              pages: ['dashboard','production','notifications'] },
  },
  commandes: [],
  parcelles: [
    { id: 1, name: 'Parcelle Est', surface: 2000, product: 'Tomate Grade A', semis: '2026-01-10', recolte: '2026-04-10', rendementObj: 4000, rendementReel: 3800, status: 'En production' },
    { id: 2, name: 'Parcelle Nord', surface: 1500, product: 'Salade Bio', semis: '2026-02-01', recolte: '2026-04-01', rendementObj: 3000, rendementReel: 3200, status: 'Récolté' },
    { id: 3, name: 'Parcelle Ouest', surface: 1800, product: 'Concombre', semis: '2026-03-15', recolte: '2026-06-15', rendementObj: 3600, rendementReel: 0, status: 'En production' },
    { id: 4, name: 'Parcelle Sud', surface: 1200, product: 'Herbes Aromatiques', semis: '2026-04-01', recolte: '2026-06-01', rendementObj: 2400, rendementReel: 0, status: 'Semée' },
  ],
  factures: [],
  marchePrix: [
    { produit: 'Tomate Bio', diego: 5500, nosybe: 5000, mahajanga: 6000, date: '2026-06-15' },
    { produit: 'Salade Bio', diego: 3200, nosybe: 3000, mahajanga: 3500, date: '2026-06-15' },
    { produit: 'Concombre', diego: 3800, nosybe: 3500, mahajanga: 4000, date: '2026-06-15' },
    { produit: 'Herbes Aromatiques', diego: 2200, nosybe: 2000, mahajanga: 2500, date: '2026-06-15' },
    { produit: 'Poivron Bio', diego: 4800, nosybe: 4500, mahajanga: 5200, date: '2026-06-15' },
    { produit: 'Carotte Bio', diego: 2800, nosybe: 2500, mahajanga: 3000, date: '2026-06-15' },
  ],
"""
# Insert before appUsage
old_state_marker = "  appUsage: {"
if 'roleConfig' not in c and old_state_marker in c:
    c = c.replace(old_state_marker, new_state + "  appUsage: {", 1)
    fixes += 1
    print('Fix 1: Multi-user state + 5 feature states added')
else:
    print('Fix 1: Already present or marker not found')

# ═══════════════════════════════════════════════════
# 2. Add login screen HTML (before main content)
# ═══════════════════════════════════════════════════
login_html = """
<div id="login-screen" style="display:none;position:fixed;inset:0;background:var(--bg);z-index:9999;display:flex;align-items:center;justify-content:center">
  <div style="background:var(--surface);border-radius:20px;padding:40px;box-shadow:var(--shadow-lg);max-width:400px;width:90%;text-align:center">
    <div style="font-size:48px;margin-bottom:8px">🌿</div>
    <h2 style="color:var(--green-dark);margin:0 0 4px">BIOZAR</h2>
    <p style="color:var(--text-muted);font-size:13px;margin:0 0 24px">Console de Pilotage Bio</p>
    <div class="form-group" style="text-align:left;margin-bottom:16px">
      <label style="font-weight:600;font-size:12px">Login</label>
      <input type="text" id="login-user" style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;box-sizing:border-box" placeholder="Identifiant" />
    </div>
    <div class="form-group" style="text-align:left;margin-bottom:20px">
      <label style="font-weight:600;font-size:12px">Mot de passe</label>
      <input type="password" id="login-pass" style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;box-sizing:border-box" placeholder="Mot de passe" />
    </div>
    <button class="btn-primary" onclick="doLogin()" style="width:100%;padding:12px;font-size:15px;border-radius:12px">🚀 Connexion</button>
    <p id="login-error" style="color:var(--red);font-size:12px;margin-top:12px;display:none"></p>
  </div>
</div>
"""
if 'login-screen' not in c:
    # Insert after <body> tag
    body_idx = c.find('<body')
    if body_idx >= 0:
        insert_at = c.find('>', body_idx) + 1
        c = c[:insert_at] + login_html + '\n' + c[insert_at:]
        fixes += 1
        print('Fix 2: Login screen HTML added')
    else:
        print('Fix 2: <body> tag not found')
else:
    print('Fix 2: Login screen already exists')

# ═══════════════════════════════════════════════════
# 3. Add new nav items for new features (before analytics)
# ═══════════════════════════════════════════════════
new_nav_items = """        <div class="nav-item hide-production" id="nav-commandes" onclick="showPage('commandes')"><span class="icon">📦</span> Commandes</div>
        <div class="nav-item hide-production" id="nav-parcelles" onclick="showPage('parcelles')"><span class="icon">🗺️</span> Parcelles</div>
        <div class="nav-item hide-production" id="nav-factures" onclick="showPage('factures')"><span class="icon">🧾</span> Factures</div>
        <div class="nav-item hide-production" id="nav-meteo" onclick="showPage('meteo')"><span class="icon">🌡️</span> Météo</div>
        <div class="nav-item hide-production" id="nav-prix-marche" onclick="showPage('prix-marche')"><span class="icon">🔄</span> Prix Marché</div>
        <div class="nav-item hide-production hide-commercial" id="nav-analytics" onclick="showPage('analytics')"><span class="icon">📈</span> Analytics</div>"""
old_nav = '        <div class="nav-item hide-production hide-commercial" id="nav-analytics" onclick="showPage(\'analytics\')"><span class="icon">📈</span> Analytics</div>'
if old_nav in c and 'nav-commandes' not in c:
    c = c.replace(old_nav, new_nav_items, 1)
    fixes += 1
    print('Fix 3: 5 new nav items added')
else:
    print('Fix 3: Already present or pattern not found')

# ═══════════════════════════════════════════════════
# 4. Add new page HTML sections (before analytics page)
# ═══════════════════════════════════════════════════
new_pages = """    <!-- COMMANDES -->
    <div class="page" id="page-commandes">
      <div class="section-header"><h2>📦 Commandes Clients</h2><p>Suivi des commandes et livraisons</p></div>
      <div class="card" style="margin-bottom:20px"><div class="card-header"><div><h3>Nouvelle Commande</h3></div></div><div class="card-body">
        <div class="form-row"><div class="form-group"><label>Client</label><select id="cmd-client" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border)"></select></div>
        <div class="form-group"><label>Produit</label><select id="cmd-product" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border)"></select></div></div>
        <div class="form-row"><div class="form-group"><label>Quantité (kg)</label><input type="number" id="cmd-qty" min="1" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border)" /></div>
        <div class="form-group"><label>Note</label><input type="text" id="cmd-note" placeholder="Ex: Livraison urgente" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border)" /></div></div>
        <button class="btn-primary" onclick="addCommande()">+ Créer la Commande</button>
      </div></div>
      <div class="card"><div class="card-header"><div><h3>📋 Liste des Commandes</h3><p id="commandes-count"></p></div></div><div class="card-body" id="commandes-list"></div></div>
    </div>

    <!-- PARCELLES -->
    <div class="page" id="page-parcelles">
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div><h2>🗺️ Parcelles & Rendements</h2><p>Suivi des parcelles de production</p></div>
        <button class="btn-primary" onclick="showAddParcelleModal()" style="padding:10px 18px;font-size:13px">+ Parcelle</button>
      </div>
      <div class="kpi-grid" id="parcelles-kpis"></div>
      <div class="product-grid" id="parcelles-grid"></div>
    </div>

    <!-- FACTURES -->
    <div class="page" id="page-factures">
      <div class="section-header"><h2>🧾 Factures</h2><p>Génération de factures clients</p></div>
      <div class="card" style="margin-bottom:20px"><div class="card-header"><div><h3>Nouvelle Facture</h3></div></div><div class="card-body">
        <div class="form-row"><div class="form-group"><label>Client</label><select id="fact-client" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border)"></select></div>
        <div class="form-group"><label>Date</label><input type="date" id="fact-date" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border)" /></div></div>
        <div id="fact-lines"></div>
        <button class="btn-primary" onclick="addFactureLine()" style="margin:8px 0">+ Ajouter une ligne</button>
        <div style="display:flex;gap:8px;align-items:center;margin-top:12px">
          <strong>Total: </strong><span id="fact-total" style="font-size:18px;font-weight:700;color:var(--green-dark)">0 Ar</span>
          <button class="btn-primary" onclick="createFacture()" style="margin-left:auto">💾 Enregistrer</button>
        </div>
      </div></div>
      <div class="card"><div class="card-header"><div><h3>📋 Factures Émises</h3></div></div><div class="card-body" id="factures-list"></div></div>
    </div>

    <!-- METEO -->
    <div class="page" id="page-meteo">
      <div class="section-header"><h2>🌡️ Météo Locale</h2><p>Conditions météo pour l'agriculture</p></div>
      <div class="kpi-grid" id="meteo-kpis"></div>
      <div class="two-col">
        <div class="card"><div class="card-header"><div><h3>📊 Prévisions 5 Jours</h3></div></div><div class="card-body" id="meteo-forecast"></div></div>
        <div class="card"><div class="card-header"><div><h3>⚠️ Alertes Agricoles</h3></div></div><div class="card-body" id="meteo-alerts"></div></div>
      </div>
      <div class="card"><div class="card-header"><div><h3>📝 Historique Météo</h3></div></div><div class="card-body" id="meteo-history"></div></div>
    </div>

    <!-- PRIX MARCHÉ -->
    <div class="page" id="page-prix-marche">
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div><h2>🔄 Prix du Marché</h2><p>Comparaison des prix bio locaux</p></div>
        <button class="btn-primary" onclick="addMarchePrix()" style="padding:10px 18px;font-size:13px">+ Ajouter</button>
      </div>
      <div class="card"><div class="card-header"><div><h3>📊 Tableau Comparatif</h3><p>Prix en Ar/kg par marché</p></div></div><div class="card-body"><table class="data-table" id="marche-table"><thead><tr><th>Produit</th><th>Diego</th><th>Nosy Be</th><th>Mahajanga</th><th>Écart Max</th></tr></thead><tbody id="marche-tbody"></tbody></table></div></div>
      <div class="two-col">
        <div class="card"><div class="card-header"><div><h3>📈 Évolution des Prix</h3></div></div><div class="card-body" style="height:240px"><canvas id="chartMarchePrix"></canvas></div></div>
        <div class="card"><div class="card-header"><div><h3>💡 Recommandations</h3></div></div><div class="card-body" id="marche-recos"></div></div>
      </div>
    </div>

"""
# Insert before analytics page
if 'page-commandes' not in c:
    idx = c.find('<!-- ANALYTICS PAGE -->')
    if idx < 0:
        idx = c.find('<!-- ANALYTICS -->')
    if idx >= 0:
        c = c[:idx] + new_pages + c[idx:]
        fixes += 1
        print('Fix 4: 5 new page HTML sections added')
    else:
        print('Fix 4: Analytics page marker not found')
else:
    print('Fix 4: Pages already exist')

# ═══════════════════════════════════════════════════
# 5. Add login/logout JS functions + enhanced role system
# ═══════════════════════════════════════════════════
role_fns = r"""
// ═══════════════════════════════════════════════════
// ═══════════════════ MULTI-USER ROLE SYSTEM ═══════════════════
// ═══════════════════════════════════════════════════

function showLoginScreen() {
  var el = document.getElementById('login-screen');
  if (el) el.style.display = 'flex';
}

function hideLoginScreen() {
  var el = document.getElementById('login-screen');
  if (el) el.style.display = 'none';
}

function doLogin() {
  var login = document.getElementById('login-user').value.trim();
  var pass = document.getElementById('login-pass').value;
  var errEl = document.getElementById('login-error');
  if (!login || !pass) { errEl.textContent = 'Veuillez remplir tous les champs'; errEl.style.display = 'block'; return; }
  var user = (state.users || []).find(function(u) { return u.login === login && u.password === pass; });
  if (!user) { errEl.textContent = 'Login ou mot de passe incorrect'; errEl.style.display = 'block'; return; }
  state.currentUser = user;
  state.currentRole = user.role;
  saveState();
  hideLoginScreen();
  applyRoleAccess(user.role);
  showPage('dashboard');
  showToast('Bienvenue ' + user.name + ' !');
}

function doLogout() {
  state.currentUser = null;
  state.currentRole = null;
  saveState();
  showLoginScreen();
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

function applyRoleAccess(role) {
  var config = state.roleConfig || {};
  var allowed = (config[role] || config.admin || {}).pages || [];
  // Show/hide nav items based on role
  document.querySelectorAll('.nav-item').forEach(function(nav) {
    var navId = nav.id.replace('nav-', '');
    nav.style.display = allowed.indexOf(navId) >= 0 ? '' : 'none';
  });
  // Show/hide pages
  document.querySelectorAll('.page').forEach(function(page) {
    var pageId = page.id.replace('page-', '');
    // Don't hide if it's the current active page
  });
}

function isPageAllowed(page) {
  var role = state.currentRole;
  if (!role) return true;
  var config = state.roleConfig || {};
  var allowed = (config[role] || config.admin || {}).pages || [];
  return allowed.indexOf(page) >= 0;
}

// ═══════════════════════════════════════════════════
// ═══════════════════ COMMANDES ═══════════════════
// ═══════════════════════════════════════════════════

function populateCommandeSelects() {
  var clientSel = document.getElementById('cmd-client');
  var prodSel = document.getElementById('cmd-product');
  if (!clientSel || !prodSel) return;
  clientSel.innerHTML = '<option value="">-- Choisir un client --</option>' +
    (state.clients || []).map(function(c) { return '<option>' + c.nom + '</option>'; }).join('');
  prodSel.innerHTML = '<option value="">-- Choisir un produit --</option>' +
    (state.products || []).map(function(p) { return '<option value="' + p.name + '">' + p.emoji + ' ' + p.name + ' (' + p.price + ' Ar)</option>'; }).join('');
}

function addCommande() {
  var client = document.getElementById('cmd-client').value;
  var product = document.getElementById('cmd-product').value;
  var qty = parseInt(document.getElementById('cmd-qty').value);
  var note = document.getElementById('cmd-note').value.trim();
  if (!client || !product || !qty) { showToast('Remplissez tous les champs obligatoires', 'error'); return; }
  var prod = (state.products || []).find(function(p) { return p.name === product; });
  var total = prod ? prod.price * qty : 0;
  state.commandes.push({
    id: Date.now(), client: client, product: product, qty: qty, total: total,
    note: note, status: 'En attente', date: new Date().toISOString().slice(0,10)
  });
  saveState();
  renderCommandes();
  document.getElementById('cmd-qty').value = '';
  document.getElementById('cmd-note').value = '';
  showToast('Commande créée pour ' + client + ' !');
  trackFeatureClick('addCommande');
}

function renderCommandes() {
  var el = document.getElementById('commandes-list');
  if (!el) return;
  var cmds = (state.commandes || []).slice().reverse();
  document.getElementById('commandes-count').textContent = cmds.length + ' commande(s)';
  if (cmds.length === 0) { el.innerHTML = '<div class="empty-state">Aucune commande</div>'; return; }
  var statusColors = { 'En attente': '#f9a825', 'En préparation': '#1976d2', 'Livrée': '#2d6a35', 'Facturée': '#7b1fa2', 'Annulée': '#e53935' };
  var html = '<table class="data-table"><thead><tr><th>Date</th><th>Client</th><th>Produit</th><th>Qté</th><th>Total</th><th>Statut</th><th>Action</th></tr></thead><tbody>';
  cmds.forEach(function(cmd) {
    var color = statusColors[cmd.status] || '#999';
    html += '<tr>';
    html += '<td>' + cmd.date + '</td>';
    html += '<td><strong>' + cmd.client + '</strong></td>';
    html += '<td>' + cmd.product + '</td>';
    html += '<td>' + cmd.qty + ' kg</td>';
    html += '<td><strong>' + cmd.total.toLocaleString() + ' Ar</strong></td>';
    html += '<td><span style="background:' + color + '22;color:' + color + ';padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600">' + cmd.status + '</span></td>';
    html += '<td><select onchange="updateCmdStatus(' + cmd.id + ',this.value)" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);font-size:11px">';
    ['En attente','En préparation','Livrée','Facturée','Annulée'].forEach(function(s) {
      html += '<option' + (s === cmd.status ? ' selected' : '') + '>' + s + '</option>';
    });
    html += '</select></td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function updateCmdStatus(id, status) {
  var cmd = (state.commandes || []).find(function(c) { return c.id === id; });
  if (cmd) { cmd.status = status; saveState(); renderCommandes(); }
}

// ═══════════════════════════════════════════════════
// ═══════════════════ PARCELLES ═══════════════════
// ═══════════════════════════════════════════════════

function renderParcelles() {
  var kpiEl = document.getElementById('parcelles-kpis');
  var gridEl = document.getElementById('parcelles-grid');
  if (!kpiEl || !gridEl) return;
  var parcelles = state.parcelles || [];
  var totalSurf = parcelles.reduce(function(a,p) { return a + (p.surface || 0); }, 0);
  var totalObj = parcelles.reduce(function(a,p) { return a + (p.rendementObj || 0); }, 0);
  var totalReel = parcelles.reduce(function(a,p) { return a + (p.rendementReel || 0); }, 0);
  var rendementPct = totalObj > 0 ? Math.round(totalReel / totalObj * 100) : 0;

  kpiEl.innerHTML =
    '<div class="kpi-card green"><div class="kpi-icon">🗺️</div><div class="kpi-value">' + parcelles.length + '</div><div class="kpi-label">Parcelles</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-icon">📐</div><div class="kpi-value">' + (totalSurf/1000).toFixed(1) + ' ha</div><div class="kpi-label">Surface totale</div></div>' +
    '<div class="kpi-card gold"><div class="kpi-icon">🎯</div><div class="kpi-value">' + totalObj.toLocaleString() + ' kg</div><div class="kpi-label">Objectif rendement</div></div>' +
    '<div class="kpi-card ' + (rendementPct >= 90 ? 'green' : 'red') + '"><div class="kpi-icon">📊</div><div class="kpi-value">' + rendementPct + '%</div><div class="kpi-label">Rendement réel/objectif</div></div>';

  var statusEmoji = { 'En production': '🌱', 'Récolté': '✅', 'Semée': '💧', 'En attente': '⏳' };
  gridEl.innerHTML = parcelles.map(function(p) {
    var pct = p.rendementObj > 0 ? Math.round(p.rendementReel / p.rendementObj * 100) : 0;
    var color = pct >= 90 ? '#2d6a35' : pct >= 50 ? '#f9a825' : '#e53935';
    return '<div class="product-card">' +
      '<div class="product-emoji">' + (statusEmoji[p.status] || '🌱') + '</div>' +
      '<div class="product-name">' + p.name + '</div>' +
      '<div class="product-price">' + p.product + '</div>' +
      '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">' +
        '📐 ' + p.surface + 'm² · Semis: ' + p.semis + '<br>' +
        '🎯 Objectif: ' + p.rendementObj + ' kg · Réel: ' + p.rendementReel + ' kg' +
      '</div>' +
      '<div style="margin-top:8px;background:var(--bg);border-radius:6px;height:8px;overflow:hidden">' +
        '<div style="width:' + Math.min(pct,100) + '%;background:' + color + ';height:100%;border-radius:6px"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px">' +
        '<span style="color:' + color + ';font-weight:600">' + pct + '%</span>' +
        '<span style="color:var(--text-muted)">' + p.status + '</span>' +
      '</div></div>';
  }).join('');
}

function showAddParcelleModal() {
  var name = prompt('Nom de la parcelle:');
  if (!name) return;
  var surface = parseInt(prompt('Surface (m²):'));
  var product = prompt('Produit principal:');
  if (!name || !surface || !product) return;
  state.parcelles.push({
    id: Date.now(), name: name, surface: surface, product: product,
    semis: new Date().toISOString().slice(0,10), recolte: '',
    rendementObj: Math.round(surface * 2), rendementReel: 0, status: 'Semée'
  });
  saveState();
  renderParcelles();
  showToast('Parcelle ' + name + ' créée !');
}

// ═══════════════════════════════════════════════════
// ═══════════════════ FACTURES ═══════════════════
// ═══════════════════════════════════════════════════

function populateFactureSelects() {
  var clientSel = document.getElementById('fact-client');
  if (!clientSel) return;
  clientSel.innerHTML = '<option value="">-- Client --</option>' +
    (state.clients || []).map(function(c) { return '<option>' + c.nom + '</option>'; }).join('');
  var dateEl = document.getElementById('fact-date');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0,10);
  var linesEl = document.getElementById('fact-lines');
  if (linesEl) linesEl.innerHTML = '';
}

function addFactureLine() {
  var linesEl = document.getElementById('fact-lines');
  if (!linesEl) return;
  var idx = linesEl.children.length;
  var div = document.createElement('div');
  div.className = 'form-row';
  div.style.marginBottom = '8px';
  div.innerHTML =
    '<div class="form-group"><select class="fact-prod" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border)"><option value="">-- Produit --</option>' +
    (state.products || []).map(function(p) { return '<option value="' + p.name + '" data-price="' + p.price + '">' + p.emoji + ' ' + p.name + '</option>'; }).join('') +
    '</select></div>' +
    '<div class="form-group"><input type="number" class="fact-qty" min="1" placeholder="Qté kg" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid var(--border)" oninput="updateFactTotal()" /></div>' +
    '<div class="form-group" style="flex:0 0 auto"><button class="btn-admin" onclick="this.closest(\'.form-row\').remove();updateFactTotal()" style="padding:8px">✕</button></div>';
  linesEl.appendChild(div);
}

function updateFactTotal() {
  var total = 0;
  document.querySelectorAll('.form-row').forEach(function(row) {
    var sel = row.querySelector('.fact-prod');
    var qty = row.querySelector('.fact-qty');
    if (sel && qty && sel.value) {
      var opt = sel.options[sel.selectedIndex];
      var price = parseInt(opt.getAttribute('data-price')) || 0;
      total += price * parseInt(qty.value || 0);
    }
  });
  var el = document.getElementById('fact-total');
  if (el) el.textContent = total.toLocaleString() + ' Ar';
}

function createFacture() {
  var client = document.getElementById('fact-client').value;
  var date = document.getElementById('fact-date').value;
  if (!client) { showToast('Choisissez un client', 'error'); return; }
  var lines = [];
  var total = 0;
  document.querySelectorAll('.form-row').forEach(function(row) {
    var sel = row.querySelector('.fact-prod');
    var qty = row.querySelector('.fact-qty');
    if (sel && qty && sel.value) {
      var opt = sel.options[sel.selectedIndex];
      var price = parseInt(opt.getAttribute('data-price')) || 0;
      var qtyVal = parseInt(qty.value || 0);
      var lineTotal = price * qtyVal;
      lines.push({ product: sel.value, qty: qtyVal, price: price, total: lineTotal });
      total += lineTotal;
    }
  });
  if (lines.length === 0) { showToast('Ajoutez au moins une ligne', 'error'); return; }
  state.factures.push({
    id: Date.now(), client: client, date: date, lines: lines, total: total,
    num: 'FAC-' + (state.factures.length + 1).toString().padStart(4, '0')
  });
  saveState();
  renderFactures();
  document.getElementById('fact-lines').innerHTML = '';
  showToast('Facture créée ! Total: ' + total.toLocaleString() + ' Ar');
  trackFeatureClick('createFacture');
}

function renderFactures() {
  var el = document.getElementById('factures-list');
  if (!el) return;
  var factures = (state.factures || []).slice().reverse();
  if (factures.length === 0) { el.innerHTML = '<div class="empty-state">Aucune facture</div>'; return; }
  var html = '<table class="data-table"><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Articles</th><th>Total</th><th>Action</th></tr></thead><tbody>';
  factures.forEach(function(f) {
    html += '<tr><td><strong>' + f.num + '</strong></td><td>' + f.date + '</td><td>' + f.client + '</td>';
    html += '<td>' + f.lines.length + ' article(s)</td>';
    html += '<td><strong>' + f.total.toLocaleString() + ' Ar</strong></td>';
    html += '<td><button class="btn-admin" onclick="exportFacturePDF(' + f.id + ')" style="padding:4px 10px;font-size:11px">📥 PDF</button></td></tr>';
  });
  html += '</tbody></table>';
  el.innerHTML = html;
}

function exportFacturePDF(factId) {
  var fact = (state.factures || []).find(function(f) { return f.id === factId; });
  if (!fact) return;
  try {
    var jsPDF = window.jspdf.jsPDF;
    var pdf = new jsPDF('p', 'pt', 'a4');
    var pageW = pdf.internal.pageSize.getWidth();
    var margin = 40, y = margin + 6;
    // Header
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(24); pdf.setTextColor(26, 61, 31);
    pdf.text('BIOZAR', margin, y); y += 20;
    pdf.setFontSize(10); pdf.setTextColor(90, 112, 96);
    pdf.text('Facture ' + fact.num, margin, y); y += 14;
    pdf.setDrawColor(45, 106, 53); pdf.setLineWidth(2);
    pdf.line(margin, y, pageW - margin, y); y += 20;
    // Client info
    pdf.setFontSize(11); pdf.setTextColor(26, 61, 31);
    pdf.text('Client: ' + fact.client, margin, y); y += 16;
    pdf.text('Date: ' + fact.date, margin, y); y += 16;
    pdf.text('Numéro: ' + fact.num, margin, y); y += 24;
    // Table header
    pdf.setFillColor(45, 106, 53); pdf.rect(margin, y, pageW - margin*2, 20, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(255, 255, 255);
    pdf.text('Produit', margin + 8, y + 14);
    pdf.text('Qté', margin + 250, y + 14);
    pdf.text('Prix unit.', margin + 320, y + 14);
    pdf.text('Total', margin + 420, y + 14);
    y += 24;
    // Lines
    pdf.setTextColor(26, 61, 31); pdf.setFont('helvetica', 'normal');
    fact.lines.forEach(function(line, i) {
      if (i % 2 === 0) { pdf.setFillColor(244, 246, 240); pdf.rect(margin, y - 2, pageW - margin*2, 18, 'F'); }
      pdf.text(line.product, margin + 8, y + 12);
      pdf.text(line.qty + ' kg', margin + 250, y + 12);
      pdf.text(line.price.toLocaleString() + ' Ar', margin + 320, y + 12);
      pdf.text(line.total.toLocaleString() + ' Ar', margin + 420, y + 12);
      y += 18;
    });
    // Total
    y += 8;
    pdf.setDrawColor(45, 106, 53); pdf.setLineWidth(1);
    pdf.line(margin, y, pageW - margin, y); y += 20;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
    pdf.text('TOTAL: ' + fact.total.toLocaleString() + ' Ar', margin, y); y += 30;
    // Footer
    pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
    pdf.text('BIOZAR · Fraîcheur du bazar, Le bio est la star · ' + new Date().toLocaleString('fr-FR'), margin, y);
    pdf.save(fact.num + '-' + fact.client.replace(/\s/g, '_') + '.pdf');
    showToast('Facture ' + fact.num + ' exportée !');
  } catch(e) { console.error('Erreur export facture:', e); }
}

// ═══════════════════════════════════════════════════
// ═══════════════════ MÉTÉO ═══════════════════
// ═══════════════════════════════════════════════════

var meteoData = null;

function renderMeteo() {
  var kpiEl = document.getElementById('meteo-kpis');
  var forecastEl = document.getElementById('meteo-forecast');
  var alertsEl = document.getElementById('meteo-alerts');
  if (!kpiEl) return;

  // Simulated meteo data for Antsiranana (since we can't call API in this demo)
  var now = new Date();
  var temp = 26 + Math.round(Math.random() * 6);
  var humidity = 65 + Math.round(Math.random() * 20);
  var rain = Math.round(Math.random() * 10);
  var wind = 5 + Math.round(Math.random() * 15);

  kpiEl.innerHTML =
    '<div class="kpi-card green"><div class="kpi-icon">🌡️</div><div class="kpi-value">' + temp + '°C</div><div class="kpi-label">Température</div></div>' +
    '<div class="kpi-card blue"><div class="kpi-icon">💧</div><div class="kpi-value">' + humidity + '%</div><div class="kpi-label">Humidité</div></div>' +
    '<div class="kpi-card ' + (rain > 5 ? 'gold' : 'green') + '"><div class="kpi-icon">🌧️</div><div class="kpi-value">' + rain + ' mm</div><div class="kpi-label">Précipitations</div></div>' +
    '<div class="kpi-card red"><div class="kpi-icon">💨</div><div class="kpi-value">' + wind + ' km/h</div><div class="kpi-label">Vent</div></div>';

  if (forecastEl) {
    var days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    var forecastHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    for (var i = 0; i < 5; i++) {
      var d = new Date(); d.setDate(d.getDate() + i);
      var fTemp = 24 + Math.round(Math.random() * 8);
      var fRain = Math.round(Math.random() * 15);
      var emoji = fRain > 10 ? '🌧️' : fRain > 3 ? '⛅' : '☀️';
      forecastHtml += '<div style="flex:1;min-width:80px;text-align:center;padding:12px;background:var(--bg);border-radius:12px">';
      forecastHtml += '<div style="font-size:11px;color:var(--text-muted)">' + (i === 0 ? "Aujourd'hui" : days[d.getDay()]) + '</div>';
      forecastHtml += '<div style="font-size:28px;margin:6px 0">' + emoji + '</div>';
      forecastHtml += '<div style="font-weight:700;color:var(--text)">' + fTemp + '°C</div>';
      forecastHtml += '<div style="font-size:10px;color:var(--text-muted)">' + fRain + ' mm</div>';
      forecastHtml += '</div>';
    }
    forecastHtml += '</div>';
    forecastEl.innerHTML = forecastHtml;
  }

  if (alertsEl) {
    var alerts = [];
    if (temp > 33) alerts.push({ type: 'warning', icon: '🌡️', text: 'Température élevée (' + temp + '°C) — arroser tôt le matin' });
    if (humidity < 50) alerts.push({ type: 'warning', icon: '💧', text: 'Humidité basse (' + humidity + '%) — vérifier irrigation' });
    if (rain > 8) alerts.push({ type: 'info', icon: '🌧️', text: 'Pluie importante (' + rain + ' mm) — protéger les semis' });
    if (wind > 20) alerts.push({ type: 'danger', icon: '💨', text: 'Vent fort (' + wind + ' km/h) — sécuriser les tuteurs' });
    if (temp > 35 && humidity > 80) alerts.push({ type: 'danger', icon: '⚠️', text: 'Risque de maladies fongiques — surveiller les plantes' });
    if (alerts.length === 0) alerts.push({ type: 'success', icon: '✅', text: 'Conditions idéales pour la culture' });
    alertsEl.innerHTML = alerts.map(function(a) {
      var bg = a.type === 'danger' ? 'var(--red-light)' : a.type === 'warning' ? 'var(--gold-light)' : a.type === 'success' ? 'var(--green-pale)' : 'var(--blue-light)';
      return '<div style="padding:10px 14px;background:' + bg + ';border-radius:10px;margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:18px">' + a.icon + '</span>' + a.text + '</div>';
    }).join('');
  }
}

// ═══════════════════════════════════════════════════
// ═══════════════════ PRIX DU MARCHÉ ═══════════════════
// ═══════════════════════════════════════════════════

function renderMarchePrix() {
  var tbody = document.getElementById('marche-tbody');
  var recosEl = document.getElementById('marche-recos');
  if (!tbody) return;
  var data = state.marchePrix || [];

  tbody.innerHTML = data.map(function(row) {
    var prices = [row.diego, row.nosybe, row.mahajanga];
    var min = Math.min.apply(null, prices);
    var max = Math.max.apply(null, prices);
    var ecart = max - min;
    return '<tr><td><strong>' + row.produit + '</strong></td>' +
      '<td>' + row.diego.toLocaleString() + ' Ar</td>' +
      '<td>' + row.nosybe.toLocaleString() + ' Ar</td>' +
      '<td>' + row.mahajanga.toLocaleString() + ' Ar</td>' +
      '<td style="color:' + (ecart > 500 ? 'var(--red)' : 'var(--text-muted)') + ';font-weight:600">' + ecart.toLocaleString() + ' Ar</td></tr>';
  }).join('');

  // Recommendations
  if (recosEl) {
    var recos = [];
    data.forEach(function(row) {
      var biozarPrice = (state.products || []).find(function(p) { return p.name === row.produit; });
      if (biozarPrice) {
        var avg = Math.round((row.diego + row.nosybe + row.mahajanga) / 3);
        var diff = biozarPrice.price - avg;
        if (diff > 200) recos.push('💡 ' + row.produit + ': votre prix (' + biozarPrice.price + ' Ar) est supérieur à la moyenne (' + avg + ' Ar) — ajuster ou justifier la qualité bio');
        else if (diff < -200) recos.push('💰 ' + row.produit + ': vous êtes compétitif (' + biozarPrice.price + ' Ar vs moy. ' + avg + ' Ar) — augmenter légèrement possible');
        else recos.push('✅ ' + row.produit + ': prix aligné au marché (' + biozarPrice.price + ' Ar vs moy. ' + avg + ' Ar)');
      }
    });
    recosEl.innerHTML = recos.length > 0 ? recos.map(function(r) {
      return '<div style="padding:8px 12px;background:var(--bg);border-radius:8px;margin-bottom:6px;font-size:12px">' + r + '</div>';
    }).join('') : '<div class="empty-state">Aucune recommandation</div>';
  }

  // Chart
  var chartEl = document.getElementById('chartMarchePrix');
  if (chartEl && window.Chart) {
    var colors = getChartColors ? getChartColors() : { green: '#2d6a35', blue: '#1976d2', gold: '#f9a825', grid: 'rgba(0,0,0,0.06)', tick: '#5a7060' };
    if (window._chartMarche) window._chartMarche.destroy();
    window._chartMarche = new Chart(chartEl, {
      type: 'bar',
      data: {
        labels: data.map(function(r) { return r.produit; }),
        datasets: [
          { label: 'Diego', data: data.map(function(r) { return r.diego; }), backgroundColor: colors.green, borderRadius: 4 },
          { label: 'Nosy Be', data: data.map(function(r) { return r.nosybe; }), backgroundColor: colors.blue, borderRadius: 4 },
          { label: 'Mahajanga', data: data.map(function(r) { return r.mahajanga; }), backgroundColor: colors.gold, borderRadius: 4 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: colors.tick, font: { size: 11 } } } },
        scales: {
          x: { grid: { color: colors.grid }, ticks: { color: colors.tick } },
          y: { grid: { color: colors.grid }, ticks: { color: colors.tick } }
        }
      }
    });
  }
}

function addMarchePrix() {
  var produit = prompt('Nom du produit:');
  if (!produit) return;
  var diego = parseInt(prompt('Prix à Diego (Ar/kg):')) || 0;
  var nosybe = parseInt(prompt('Prix à Nosy Be (Ar/kg):')) || 0;
  var mahajanga = parseInt(prompt('Prix à Mahajanga (Ar/kg):')) || 0;
  state.marchePrix.push({ produit: produit, diego: diego, nosybe: nosybe, mahajanga: mahajanga, date: new Date().toISOString().slice(0,10) });
  saveState();
  renderMarchePrix();
  showToast('Prix ajouté pour ' + produit);
}

"""

if 'function doLogin' not in c:
    idx = c.find('function trackPageView')
    if idx >= 0:
        c = c[:idx] + role_fns + '\n' + c[idx:]
        fixes += 1
        print('Fix 5: Multi-user + 5 feature JS functions added')
    else:
        print('Fix 5: trackPageView not found')
else:
    print('Fix 5: Functions already exist')

# ═══════════════════════════════════════════════════
# 6. Update showPage to include new pages + role check
# ═══════════════════════════════════════════════════
old_showpage = """function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.getElementById('nav-' + name);
  if (nav) nav.classList.add('active');
  closeSidebar();
  if (name === 'reporting') renderProductionForecast();
  if (name === 'notifications') renderNotifications();
  if (name === 'analytics') renderAnalytics();
  trackPageView(name);
}"""

new_showpage = """function showPage(name) {
  if (state.currentRole && !isPageAllowed(name)) {
    showToast('Accès non autorisé pour ce profil', 'error');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const nav = document.getElementById('nav-' + name);
  if (nav) nav.classList.add('active');
  closeSidebar();
  if (name === 'reporting') renderProductionForecast();
  if (name === 'notifications') renderNotifications();
  if (name === 'analytics') renderAnalytics();
  if (name === 'commandes') { populateCommandeSelects(); renderCommandes(); }
  if (name === 'parcelles') renderParcelles();
  if (name === 'factures') { populateFactureSelects(); renderFactures(); }
  if (name === 'meteo') renderMeteo();
  if (name === 'prix-marche') renderMarchePrix();
  trackPageView(name);
}"""

if old_showpage in c:
    c = c.replace(old_showpage, new_showpage, 1)
    fixes += 1
    print('Fix 6: showPage updated with new pages + role check')
else:
    print('Fix 6: showPage pattern not found')

# ═══════════════════════════════════════════════════
# 7. Add login check on load + new features in renderAll
# ═══════════════════════════════════════════════════
# Add login check after state load
old_track = "// Track session\ntrackSession();"
new_track = """// Login check
if (state.currentUser) {
  applyRoleAccess(state.currentRole);
  hideLoginScreen();
} else {
  showLoginScreen();
}
// Track session
trackSession();"""
if old_track in c and 'showLoginScreen' not in c.split('trackSession')[0][-200:]:
    c = c.replace(old_track, new_track, 1)
    fixes += 1
    print('Fix 7: Login check on load added')
else:
    print('Fix 7: Already present or pattern not found')

# ═══════════════════════════════════════════════════
# 8. Add logout button to sidebar footer
# ═══════════════════════════════════════════════════
old_footer = '<div class="sidebar-footer">'
new_footer = '<div class="sidebar-footer">\n      <div id="user-info" style="padding:8px 12px;font-size:12px;color:var(--text-muted);border-top:1px solid var(--border);margin-bottom:4px"></div>'
if old_footer in c and 'user-info' not in c:
    c = c.replace(old_footer, new_footer, 1)
    fixes += 1
    print('Fix 8: User info + logout area added to sidebar')
else:
    print('Fix 8: Already present or pattern not found')

# ═══════════════════════════════════════════════════
# 9. Add renderUserInfo function in role_fns area
# ═══════════════════════════════════════════════════
renderUserInfo = r"""
function renderUserInfo() {
  var el = document.getElementById('user-info');
  if (!el) return;
  if (state.currentUser) {
    var roleLabel = (state.roleConfig[state.currentRole] || {}).label || state.currentRole;
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div><strong style="color:var(--text)">' + state.currentUser.name + '</strong><br><span style="font-size:11px">' + roleLabel + '</span></div>' +
      '<button onclick="doLogout()" style="background:none;border:1px solid var(--border);border-radius:8px;padding:4px 10px;font-size:11px;cursor:pointer;color:var(--red)">🚪 Déconnexion</button></div>';
  } else {
    el.innerHTML = '';
  }
}
"""
if 'function renderUserInfo' not in c:
    idx = c.find('function renderAll()')
    if idx >= 0:
        c = c[:idx] + renderUserInfo + '\n' + c[idx:]
        fixes += 1
        print('Fix 9: renderUserInfo() added')
    else:
        print('Fix 9: renderAll not found')
else:
    print('Fix 9: renderUserInfo already exists')

# Add renderUserInfo to renderAll
old_renderall = "  renderAnalytics();\n  renderSyncHistory();"
new_renderall = "  renderAnalytics();\n  renderUserInfo();\n  renderSyncHistory();"
if old_renderall in c:
    c = c.replace(old_renderall, new_renderall, 1)
    fixes += 1
    print('Fix 10: renderUserInfo() added to renderAll()')
else:
    print('Fix 10: Pattern not found')

# ═══════════════════════════════════════════════════
# Write result
# ═══════════════════════════════════════════════════
with open('biozar/web/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print(f'\nTotal fixes applied: {fixes}')
