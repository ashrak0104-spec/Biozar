const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'biozar-app', 'www', 'index.html');
let content = fs.readFileSync(filePath, 'utf8');
const changes = [];

// Fix splash screen logo path
const oldPath = 'src="../logo BIOZAR.png"';
const newPath = 'src="icons/logo-biozar.png"';

if (content.includes(oldPath)) {
  content = content.replace(new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newPath);
  changes.push('Logo path fixed: ../logo BIOZAR.png → icons/logo-biozar.png');
} else if (content.includes(newPath)) {
  changes.push('Logo path already fixed');
} else {
  changes.push('WARNING: Could not find old logo path');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Done!');
changes.forEach(c => console.log('  • ' + c));
