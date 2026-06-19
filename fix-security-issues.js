const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'biozar', 'web', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');
const changes = [];

// 1. Fix changePassword() to update current user's passwordHash
const oldChangePwd = `async function changePassword() {
  const pwd = document.getElementById("new-password").value.trim();
  if (!pwd || pwd.length < 4) { showToast("Minimum 4 caractères.", "error"); return; }
  const hashed = await sha256(pwd);
  state.password = hashed;
  try { localStorage.setItem("biozar_password", hashed); } catch(e) {}
  saveState();
  showToast("Mot de passe changé !");
  document.getElementById("new-password").value = "";
}`;

const newChangePwd = `async function changePassword() {
  const pwd = document.getElementById("new-password").value.trim();
  if (!pwd || pwd.length < 4) { showToast("Minimum 4 caractères.", "error"); return; }
  if (!state.currentUser) { showToast("Aucun utilisateur connecté.", "error"); return; }
  const hashed = await sha256(pwd);
  // Update the current user's passwordHash in the users array
  var userIdx = state.users.findIndex(function(u) { return u.login === state.currentUser.login; });
  if (userIdx >= 0) {
    state.users[userIdx].passwordHash = hashed;
    saveState();
    showToast("Mot de passe changé !");
  } else {
    showToast("Utilisateur non trouvé.", "error");
  }
  document.getElementById("new-password").value = "";
}`;

if (content.includes(oldChangePwd)) {
  content = content.replace(oldChangePwd, newChangePwd);
  changes.push('changePassword: now updates user.passwordHash instead of state.password');
} else {
  changes.push('WARNING: changePassword pattern not found!');
}

// 2. Remove plaintext fallback in password comparison
const oldCompare = `(u.passwordHash === passHash || u.passwordHash === pass)`;
const newCompare = `(u.passwordHash === passHash)`;
if (content.includes(oldCompare)) {
  content = content.replace(oldCompare, newCompare);
  changes.push('Removed plaintext password fallback in login comparison');
} else {
  changes.push('WARNING: plaintext fallback pattern not found!');
}

// 3. Remove dead code that restores state.password from localStorage
const oldDeadCode = `  const stored = localStorage.getItem('biozar_password');
  if (stored) state.password = stored;
  const seen`;
const newDeadCode = `  const seen`;
if (content.includes(oldDeadCode)) {
  content = content.replace(oldDeadCode, newDeadCode);
  changes.push('Removed dead code restoring state.password from localStorage');
} else {
  changes.push('WARNING: dead code pattern not found!');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Fixes applied!');
changes.forEach(c => console.log('  • ' + c));
