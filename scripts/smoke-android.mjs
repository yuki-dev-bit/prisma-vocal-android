#!/usr/bin/env node
/**
 * Smoke do alvo Android sem aparelho.
 *
 * O bridge Android é o mesmo código que roda no WebView do app: IndexedDB +
 * AES-GCM. Aqui ele é exercitado em Chromium, forçando `Capacitor.isNativePlatform()`
 * antes do app carregar. Assim dá para verificar, em segundos:
 *
 *   1. o app sobe com o bridge Android (sem cair no modo navegador);
 *   2. ao salvar, o IndexedDB guarda `{ iv, data }` cifrado — nenhum JSON legível;
 *   3. ao recarregar, os dados voltam (a chave não-extraível funciona).
 *
 * O que NÃO é coberto aqui (precisa de aparelho/emulador): captura de microfone,
 * plugins nativos (compartilhar, notificações) e o APK em si.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PRISMA_PORT ?? 5299);

const viteBin = require.resolve('vite/package.json').replace(/package\.json$/, 'bin/vite.js');
const server = spawn(
  process.execPath,
  [viteBin, 'preview', '--port', String(PORT), '--strictPort'],
  {
    cwd: root,
    stdio: 'ignore',
  },
);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* subindo */
    }
    await wait(200);
  }
  return false;
}

const fail = (msg) => {
  console.error(`[smoke-android] FALHOU: ${msg}`);
  server.kill();
  process.exit(1);
};

try {
  if (!(await waitForServer(`http://localhost:${PORT}/`))) {
    fail('o servidor de preview não respondeu (rode `npm run build:renderer` antes).');
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  });
  // Força o bridge Android antes de qualquer módulo do app rodar.
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
  await page.waitForSelector('.nav-item', { timeout: 10000 });

  // A barra inferior (layout de celular) precisa estar visível.
  const navVisible = await page.locator('.nav-item').first().isVisible();
  if (!navVisible) fail('navegação não apareceu no layout de celular');

  // Muda o modo (persiste via bridge) para gerar um estado salvo.
  const modeButtons = page.locator('.segmented button');
  if ((await modeButtons.count()) < 2) fail('controle de modo não encontrado');
  await modeButtons.nth(1).click();
  await wait(1200);

  const stored = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('prisma-vocal');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const read = (store, key) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const enc = await read('kv', 'app-data:enc');
    const plain = await read('kv', 'app-data');
    const key = await read('kv', '__crypto_key__');
    return {
      hasEncrypted: Boolean(enc),
      encryptedKeys: enc ? Object.keys(enc) : [],
      looksEncrypted: enc ? !JSON.stringify(enc).includes('"settings"') : false,
      hasPlaintext: Boolean(plain),
      keyIsCryptoKey: key instanceof CryptoKey,
      keyExtractable: key instanceof CryptoKey ? key.extractable : null,
    };
  });

  if (!stored.hasEncrypted) fail('nada foi salvo em `app-data:enc` pelo bridge Android');
  if (!stored.encryptedKeys.includes('iv') || !stored.encryptedKeys.includes('data')) {
    fail(`registro salvo não parece cifrado: chaves ${stored.encryptedKeys.join(', ')}`);
  }
  if (!stored.looksEncrypted) fail('o registro salvo contém JSON legível (deveria estar cifrado)');
  if (stored.hasPlaintext) fail('sobrou um registro em texto claro em `app-data`');
  if (!stored.keyIsCryptoKey) fail('a chave de criptografia não está no IndexedDB como CryptoKey');
  if (stored.keyExtractable !== false)
    fail('a chave foi criada como extraível (deveria ser não-extraível)');

  // Recarregar precisa decifrar o mesmo estado (mesma chave, sem pedir nada).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.nav-item', { timeout: 10000 });
  const persisted = await page.evaluate(() => {
    const pressed = Array.from(document.querySelectorAll('.segmented button')).findIndex(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    return pressed;
  });
  if (persisted !== 1)
    fail(`o modo salvo não sobreviveu ao reload (índice ${persisted}, esperado 1)`);

  if (errors.length > 0) fail(`erros de console: ${errors.slice(0, 3).join(' | ')}`);

  await browser.close();
  console.log(
    '[smoke-android] ok: bridge Android cifra (AES-GCM, chave não-extraível) e persiste.',
  );
  server.kill();
  process.exit(0);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
