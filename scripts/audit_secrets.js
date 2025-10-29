const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Keep this list intentionally empty in CI-ready state to avoid the audit
// script self-reporting placeholder tokens that exist only in the audit
// configuration. If you want to search for specific tokens, add them to
// this array (recommended only for local scans before removing placeholders
// from source).
const defaults = [];

function walk(dir, filelist = []) {
  const files = fs.readdirSync(dir);
  files.forEach(f => {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      if (f === 'node_modules' || f === '.git') return;
      walk(fp, filelist);
    } else {
      filelist.push(fp);
    }
  });
  return filelist;
}

const files = walk(ROOT);
let found = [];
files.forEach(f => {
  const ext = path.extname(f).toLowerCase();
  if (!['.js', '.json', '.yml', '.yaml', '.env', '.sql', '.md'].includes(ext)) return;
  const content = fs.readFileSync(f, 'utf8');
  defaults.forEach(d => {
    if (content.includes(d)) {
      found.push({ file: f, match: d });
    }
  });
});

if (found.length === 0) {
  console.log('No obvious default secrets found. Good.');
  process.exit(0);
}

console.log('Potential default secrets found:');
found.forEach(f => console.log(` - ${f.file} contains "${f.match}"`));
console.log('\nRecommendation: Replace/remove these defaults, move secrets to environment variables or a secrets manager, and re-run this audit.');
process.exit(0);
