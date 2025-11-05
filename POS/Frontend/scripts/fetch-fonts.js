/* eslint-env node */
import fs from 'fs';
import https from 'https';
import path from 'path';
import process from 'node:process';

const outDir = path.join(process.cwd(), 'public', 'fonts');
const targets = [
  {
    url: 'https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans.ttf',
    file: 'DejaVuSans.ttf'
  }
];

targets.push({
  url: 'https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoEmoji-Regular.ttf',
  file: 'NotoEmoji-Regular.ttf'
});

async function ensureDir(dir) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (err) {
    if (err && err.code !== 'EEXIST') {
      throw err;
    }
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      try {
        fs.unlinkSync(dest);
      } catch (unlinkErr) {
        if (unlinkErr && unlinkErr.code !== 'ENOENT') {
          console.warn(`Failed to clean up ${dest}:`, unlinkErr.message);
        }
      }
      reject(err);
    });
  });
}

(async () => {
  try {
    await ensureDir(outDir);
    for (const t of targets) {
      const dest = path.join(outDir, t.file);
      if (fs.existsSync(dest)) {
        console.log(`${t.file} already exists, skipping download.`);
        continue;
      }
      console.log(`Downloading ${t.url} -> ${dest}`);
      try {
        await download(t.url, dest);
        console.log(`Saved ${t.file}`);
      } catch (err) {
        console.error(`Failed to download ${t.url}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('fetch-fonts failed', err);
    process.exitCode = 1;
  }
})();
