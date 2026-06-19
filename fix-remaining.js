const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'biozar', 'web', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');
const changes = [];

// Fix 1: changePassword() - update user's passwordHash instead of state.password
// Use CRLF line endings to match the file
const oldChangePwd = 
  "async function changePassword() {\r\n" +
  "  const pwd = document.getElementById(\"new-password\").value.trim();\r\n" +
  '  if (!pwd || pwd.length < 4) { showToast("Minimum 4 caractères.", "error"); return; }\r\n' +
  "  const hashed = await sha256(pwd);\r\n" +
  "  state.password = hashed;\r\n" +
  '  try { localStorage.setItem("biozar_password", hashed); } catch(e) {}\r\n' +
  "  saveState();\r\n" +
  '  showToast("Mot de passe changé !");\r\n' +
  '  document.getElementById("new-password").value = "";\r\n' +
  "}";

const newChangePwd = 
  "async function changePassword() {\r\n" +
  '  const pwd = document.getElementById("new-password").value.trim();\r\n' +
  '  if (!pwd || pwd.length < 4) { showToast("Minimum 4 caractères.", "error"); return; }\r\n' +
  '  if (!state.currentUser) { showToast("Aucun utilisateur connecté.", "error"); return; }\r\n' +
  "  const hashed = await sha256(pwd);\r\n" +
  "  // Update the current user's passwordHash in the users array\r\n" +
  "  var userIdx = state.users.findIndex(function(u) { return u.login === state.currentUser.login; });\r\n" +
  "  if (userIdx >= 0) {\r\n" +
  "    state.users[userIdx].passwordHash = hashed;\r\n" +
  "    saveState();\r\n" +
  '    showToast("Mot de passe changé !");\r\n' +
  "  } else {\r\n" +
  '    showToast("Utilisateur non trouvé.", "error");\r\n' +
  "  }\r\n" +
  '  document.getElementById("new-password").value = "";\r\n' +
  "}";

if (content.includes(oldChangePwd)) {
  content = content.replace(oldChangePwd, newChangePwd);
  changes.push('changePassword: now updates user.passwordHash');
} else {
  changes.push('WARNING: changePassword pattern not found - checking file...');
  // Debug: find the function
  const idx = content.indexOf('async function changePassword');
  if (idx >= 0) {
    changes.push('Found at index ' + idx + ', first 200 chars: ' + JSON.stringify(content.substring(idx, idx + 200)));
  }
}

// Fix 2: Remove dead code restoring state.password from localStorage
const oldDeadCode = 
  "  const stored = localStorage.getItem('biozar_password');\r\n" +
  "  if (stored) state.password = stored;\r\n" +
  "  const seen";

const newDeadCode = 
  "  const seen";

if (content.includes(oldDeadCode)) {
  content = content.replace(oldDeadCode, newDeadCode);
  changes.push('Removed dead code (state.password restore from localStorage)');
} else {
  changes.push('WARNING: dead code pattern not found');
  const idx2 = content.indexOf('biozar_password');
  if (idx2 >= 0) {
    changes.push('Found biozar_password at index ' + idx2 + ', context: ' + JSON.stringify(content.substring(idx2 - 20, idx2 + 80)));
  }
}

// Fix 3: Verify that the plaintext fallback was already removed
if (content.includes('passwordHash === passHash || u.passwordHash === pass')) {
  changes.push('WARNING: plaintext fallback STILL present!');
} else if (content.includes('passwordHash === passHash)')) {
  changes.push('OK: plaintext fallback already removed');
} else {
  changes.push('WARNING: could not verify password compare status');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Remaining fixes applied!');
changes.forEach(c => console.log('  • ' + c));
