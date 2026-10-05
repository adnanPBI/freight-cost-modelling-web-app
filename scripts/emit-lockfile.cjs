const fs = require('node:fs');
const data = fs.readFileSync('package-lock.json');
const size = 1200;
const total = Math.ceil(data.length / size);
console.log(`LOCKFILE_BEGIN ${data.length} ${total}`);
for (let i = 0; i < total; i++) {
  const chunk = data.subarray(i * size, Math.min(data.length, (i + 1) * size));
  console.log(`LOCKFILE_CHUNK ${i + 1}/${total} ${chunk.toString('base64')}`);
}
console.log('LOCKFILE_END');
