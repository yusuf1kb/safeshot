'use strict';

const { execFile } = require('child_process');
const path = require('path');

const KEY = 'HKCU\\Software\\Classes\\SystemFileAssociations\\image\\shell\\SafeshotGizle';
const EXTS = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'bmp', 'gif', 'heic', 'heif', 'avif', 'jfif'];
const LABEL = 'Bilgileri Gizle';

function run(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code || 1 : 0, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function commandLine(appPath, dev) {
  const exe = process.execPath;
  if (dev) {
    return `"${exe}" "${appPath}" --open "%1"`;
  }
  return `"${exe}" --open "%1"`;
}

function iconPath(appPath, dev) {
  if (dev) return path.join(appPath, 'build', 'icon.png');
  return process.execPath;
}

async function register({ appPath, dev }) {
  const cmd = commandLine(appPath, dev);
  const icon = iconPath(appPath, dev);

  const sets = [
    [KEY, '/ve', '/d', LABEL],
    [KEY, '/v', 'MUIVerb', '/d', LABEL],
    [KEY, '/v', 'Icon', '/d', icon],
    [KEY, '/v', 'MultiSelectModel', '/d', 'Player'],
    [`${KEY}\\command`, '/ve', '/d', cmd],
  ];

  for (const s of sets) {
    const res = await run(['add', ...s, '/f']);
    if (res.code !== 0) return { ok: false, error: res.stderr || 'Kayıt defteri yazılamadı' };
  }

  // Bazi uzantilar SystemFileAssociations\image kapsamina girmeyebilir
  for (const ext of EXTS) {
    await run(['add', `HKCU\\Software\\Classes\\.${ext}\\shell\\SafeshotGizle`, '/ve', '/d', LABEL, '/f']);
    await run(['add', `HKCU\\Software\\Classes\\.${ext}\\shell\\SafeshotGizle`, '/v', 'MUIVerb', '/d', LABEL, '/f']);
    await run(['add', `HKCU\\Software\\Classes\\.${ext}\\shell\\SafeshotGizle`, '/v', 'Icon', '/d', icon, '/f']);
    await run(['add', `HKCU\\Software\\Classes\\.${ext}\\shell\\SafeshotGizle`, '/v', 'MultiSelectModel', '/d', 'Player', '/f']);
    await run(['add', `HKCU\\Software\\Classes\\.${ext}\\shell\\SafeshotGizle\\command`, '/ve', '/d', cmd, '/f']);
  }

  return { ok: true };
}

async function unregister() {
  await run(['delete', KEY, '/f']);
  for (const ext of EXTS) {
    await run(['delete', `HKCU\\Software\\Classes\\.${ext}\\shell\\SafeshotGizle`, '/f']);
  }
  return { ok: true };
}

async function status() {
  const res = await run(['query', KEY, '/ve']);
  return { registered: res.code === 0 };
}

/**
 * Kayıt defterindeki komut bu çalıştırılabilir dosyayı göstermiyorsa (ilk kurulum,
 * taşınmış klasör, sürüm değişikliği) yeniden yazar. Böylece menü her zaman hazırdır.
 */
async function ensure({ appPath, dev }) {
  const want = commandLine(appPath, dev);
  const res = await run(['query', `${KEY}\\command`, '/ve']);
  if (res.code === 0 && res.stdout.includes(want)) return { ok: true, changed: false };
  const r = await register({ appPath, dev });
  return { ...r, changed: true };
}

module.exports = { register, unregister, status, ensure, KEY, LABEL, EXTS };
