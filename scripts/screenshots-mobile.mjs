#!/usr/bin/env node
/**
 * Capturas do layout de celular (390×844, toque, Android).
 *
 * Serve para revisar o alvo Android sem emulador: a mesma folha de estilo entra
 * no APK. Uso:
 *   npm run build:renderer
 *   node scripts/screenshots-mobile.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const outDir = path.join(root, 'docs', 'screenshots');
const PORT = Number(process.env.PRISMA_PORT ?? 5298);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const viteBin = require.resolve('vite/package.json').replace(/package\.json$/, 'bin/vite.js');
const server = spawn(
  process.execPath,
  [viteBin, 'preview', '--port', String(PORT), '--strictPort'],
  {
    cwd: root,
    stdio: 'ignore',
  },
);

for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
  } catch {
    await wait(200);
  }
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
});
await context.addInitScript(() => {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForSelector('.nav-item');

const shots = [
  { index: 0, file: 'mobile-01-inicio.png' },
  { index: 2, file: 'mobile-02-analisar.png' },
  { index: 4, file: 'mobile-03-progresso.png' },
  { index: 7, file: 'mobile-04-configuracoes.png' },
];

/**
 * Diálogo de calibração: abre pelo cartão de Configurações → Áudio (o passo
 * inicial não depende de microfone, então a captura é determinística).
 */

for (const shot of shots) {
  await page.locator('.nav-item').nth(shot.index).click();
  await wait(700);
  await page.screenshot({ path: path.join(outDir, shot.file) });
  console.log('[mobile]', shot.file);
}

await page.locator('.nav-item').nth(7).click();
await wait(400);
await page.getByRole('button', { name: /Calibrar microfone|Refazer calibração/ }).click();
await page.getByRole('dialog').waitFor();
await wait(300);
await page.screenshot({ path: path.join(outDir, 'mobile-05-calibracao.png') });
console.log('[mobile] mobile-05-calibracao.png');
await page.keyboard.press('Escape');

await browser.close();
server.kill();
if (errors.length > 0) {
  console.error('[mobile] erros de console:', errors.slice(0, 5).join(' | '));
  process.exit(1);
}
console.log('[mobile] ok: nenhum erro de console.');
