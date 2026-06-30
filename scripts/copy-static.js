const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

const staticEntries = [
  ['data', 'data'],
  ['assets', 'assets'],
  ['insights.json', 'insights.json'],
  ['manage-insights.html', 'manage-insights.html'],
  ['deleteadmin.html', 'deleteadmin.html']
];

for (const [sourceName, destinationName] of staticEntries) {
  const source = path.join(root, sourceName);
  const destination = path.join(dist, destinationName);

  if (!fs.existsSync(source)) {
    throw new Error(`Required static content is missing: ${source}`);
  }

  fs.cpSync(source, destination, { recursive: true, force: true });
}

console.log('Copied resource data, assets, insights fallback, and admin pages into dist.');
