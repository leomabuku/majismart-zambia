import fs from 'node:fs';
import crypto from 'node:crypto';
const manifest = fs.readdirSync('dist/assets').filter(x => /\.(js|css)$/.test(x)).sort().map(name => ({
  file: `assets/${name}`, sha256: crypto.createHash('sha256').update(fs.readFileSync(`dist/assets/${name}`)).digest('hex')
}));
fs.writeFileSync('dist/build-info.json', JSON.stringify({
  commit: process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || null,
  branch: process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || null,
  source_base_commit: 'ae3a9f5d9fe10ac32bee6976b90c0fc290f5daa7',
  api_base_url: 'https://majismart-api.onrender.com/api',
  assets: manifest
}, null, 2) + '\n');
