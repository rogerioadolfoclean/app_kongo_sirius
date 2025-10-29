const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testsDir = path.join(__dirname, '..', 'tests');
if (!fs.existsSync(testsDir)) {
  console.error('No tests directory found at', testsDir);
  process.exit(1);
}

const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js')).sort();
if (files.length === 0) {
  console.error('No test files found in', testsDir);
  process.exit(1);
}

for (const file of files) {
  const full = path.join(testsDir, file);
  console.log('\n=== Running', file, '===');
  const res = spawnSync('npx', ['mocha', full, '--exit'], { stdio: 'inherit', shell: true });
  if (res.status !== 0) {
    console.error('\n--- FAIL:', file, ' (exit', res.status, ')');
    process.exit(res.status || 1);
  } else {
    console.log('\n--- PASS:', file);
  }
}

console.log('\nAll test files passed.');
