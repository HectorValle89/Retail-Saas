const { readFileSync } = require('fs');
const path = require('path');

const lines = readFileSync(path.join(__dirname, '.kiro/specs/field-force-platform/tasks.md'), 'utf8').split(/\r?\n/);
for (let i = 0; i < lines.length; i += 1) {
  if (lines[i].startsWith('- [ ] 7.')) {
    console.log(`line ${i + 1}:`);
    const chunk = (text) => {
      for (let start = 0; start < text.length; start += 200) {
        console.log(`  ${text.slice(start, start + 200)}`);
      }
    };
    chunk(lines[i]);
    for (let j = 1; j <= 4 && i + j < lines.length; j += 1) {
      console.log(`  ${lines[i + j]}`);
    }
    console.log('----');
  }
}
