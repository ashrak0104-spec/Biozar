const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'biozar', 'web', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');

// Track changes
const changes = [];

// 1. Fix splash screen logo path
if (content.includes('../logo BIOZAR.png')) {
  content = content.replace(
    'src="../logo BIOZAR.png"',
    'src="icons/logo-biozar.png"'
  );
  changes.push('Logo path fixed');
}

// 2. Replace default state password with null
if (content.includes("password: 'biozar2026'")) {
  content = content.replace("password: 'biozar2026'", 'password: null');
  changes.push('Default state password replaced with null');
}

// 3. Hash user passwords in state.users
const passwordHash = {
  biozar2026: 'f2117626cb3800365e06eb9decafeabb1f6c0401afd4b08f1e888561bad2d302',
  prod2026: '58e969fe04ca7b020ce4d21f4a4998122f8561c72f942516b6271bba0f1689ac',
  comm2026: '792b8c73c28e1aef470d463b3cc44c814c3fc70636fe51f8c1fae8fb45bab860',
  logi2026: 'b4cda9b41c79304e8d40fdef0bbe6b070b3a601d19fc14110f8a7bef9d8c861c',
  agent2026: 'a96fc074e25bdf002b08db51688454b2d22402841c73322124f48e164906fcfa'
};

Object.entries(passwordHash).forEach(([plain, hash]) => {
  const pattern = `password: '${plain}'`;
  if (content.includes(pattern)) {
    content = content.replace(new RegExp(pattern.replace("'", "\\'"), 'g'), `passwordHash: '${hash}'`);
    changes.push(`Password '${plain}' replaced with SHA-256 hash`);
  }
});

// 4. Update saveState to also delete passwordHashed
content = content.replace(
  "delete s.user; delete s.role; delete s.password; delete s.syncHistory;",
  "delete s.user; delete s.role; delete s.password; delete s.passwordHashed; delete s.syncHistory;"
);
changes.push('saveState: added passwordHashed to delete list');

// 5. Update doLoginAsync to hash password before comparison
// Find the local user lookup line and replace it
const oldLoginFind = `user = (state.users || []).find(function(u) { return u.login === login && u.password === pass; });`;
const newLoginFind = `    var passHash = await sha256(pass);\n    user = (state.users || []).find(function(u) { return u.login === login && (u.passwordHash === passHash || u.passwordHash === pass); });`;
if (content.includes(oldLoginFind)) {
  content = content.replace(oldLoginFind, newLoginFind);
  changes.push('doLoginAsync: password comparison now uses SHA-256');
}

// 6. Update addUserAsync to hash password before storing
const oldAddUser = `state.users.push({ login: login, name: name, role: role, password: password });`;
const newAddUser = `  var passHash = await sha256(password);\n  state.users.push({ login: login, name: name, role: role, passwordHash: passHash });`;
if (content.includes(oldAddUser)) {
  content = content.replace(oldAddUser, newAddUser);
  changes.push('addUserAsync: password is now hashed before storage');
}

// 7. Add login attempt rate limiting before doLogin function
const doLoginFunc = `function doLogin() {`;
const rateLimiterCode = `// ═══════════════════ LOGIN RATE LIMITING ═══════════════════
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 300000; // 5 minutes
let loginAttempts = 0;
let loginLockedUntil = null;

function isLoginLocked() {
  if (loginLockedUntil && Date.now() < loginLockedUntil) {
    return Math.ceil((loginLockedUntil - Date.now()) / 1000);
  }
  loginLockedUntil = null;
  loginAttempts = 0;
  return 0;
}

${doLoginFunc}`;

if (content.includes(doLoginFunc)) {
  content = content.replace(doLoginFunc, rateLimiterCode);
  changes.push('Login rate limiting added (max 5 attempts, 5 min lockout)');
}

// 8. Update doLogin function to check lockout
const oldDoLoginBody = `function doLogin() {
  var login = document.getElementById('login-user').value.trim().toLowerCase();
  var pass = document.getElementById('login-pass').value;
  var errEl = document.getElementById('login-error');
  if (!login || !pass) { errEl.textContent = 'Veuillez remplir tous les champs'; errEl.style.display = 'block'; return; }
  setLoginLoading(true);
  doLoginAsync(login, pass, errEl);
}`;

const newDoLoginBody = `function doLogin() {
  var locked = isLoginLocked();
  if (locked > 0) {
    var errEl = document.getElementById('login-error');
    errEl.textContent = 'Trop de tentatives. Réessayez dans ' + locked + ' secondes.';
    errEl.style.display = 'block';
    return;
  }
  var login = document.getElementById('login-user').value.trim().toLowerCase();
  var pass = document.getElementById('login-pass').value;
  var errEl = document.getElementById('login-error');
  if (!login || !pass) { errEl.textContent = 'Veuillez remplir tous les champs'; errEl.style.display = 'block'; return; }
  setLoginLoading(true);
  doLoginAsync(login, pass, errEl);
}`;

// Only replace if we haven't already modified doLogin
if (content.includes(oldDoLoginBody) && !content.includes('isLoginLocked()')) {
  content = content.replace(oldDoLoginBody, newDoLoginBody);
  changes.push('doLogin: lockout check added');
}

// 9. Update the error handling in doLoginAsync to track failed attempts
// Find the error block
const oldErrorBlock = `  if (!user) {
    errEl.textContent = 'Login ou mot de passe incorrect';
    errEl.style.display = 'block';
    setLoginLoading(false);
    return;
  }`;

const newErrorBlock = `  if (!user) {
    loginAttempts++;
    if (loginAttempts >= LOGIN_MAX_ATTEMPTS) {
      loginLockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
      errEl.textContent = 'Trop de tentatives échouées. Réessayez dans 5 minutes.';
    } else {
      errEl.textContent = 'Login ou mot de passe incorrect (' + (LOGIN_MAX_ATTEMPTS - loginAttempts) + ' tentative(s) restante(s))';
    }
    errEl.style.display = 'block';
    setLoginLoading(false);
    return;
  }`;

if (content.includes(oldErrorBlock)) {
  content = content.replace(oldErrorBlock, newErrorBlock);
  changes.push('doLoginAsync: failed attempt tracking added');
}

// 10. Reset login attempts on successful login
// Add attempts reset after successful login
const afterLoginSuccess = `  state.currentUser = user;`;
if (content.includes(afterLoginSuccess) && !content.includes('loginAttempts = 0')) {
  content = content.replace(afterLoginSuccess, `  loginAttempts = 0;\n  loginLockedUntil = null;\n  state.currentUser = user;`);
  changes.push('Login attempts reset on successful login');
}

// 11. Add Content-Security-Policy meta tag after the existing meta tags
const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-src 'self';" />`;

// Insert after the last meta tag
const metaEndMarker = `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`;
if (content.includes(metaEndMarker) && !content.includes('Content-Security-Policy')) {
  content = content.replace(metaEndMarker, metaEndMarker + '\n  ' + cspMeta);
  changes.push('Content-Security-Policy meta tag added');
}

// Write the modified content
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Security patches applied successfully!');
changes.forEach(c => console.log('  • ' + c));
