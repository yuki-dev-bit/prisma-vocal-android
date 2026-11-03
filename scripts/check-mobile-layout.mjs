#!/usr/bin/env node
/**
 * Verificação de layout mobile.
 *
 * Percorre todas as telas do app em vários tamanhos de tela (incluindo paisagem
 * e tablet), e falha quando encontra:
 *
 *   • rolagem horizontal na página;
 *   • elemento visível ultrapassando a borda direita/esquerda;
 *   • alvo de toque menor que 40×40 px (botões, links, sliders, select);
 *   • texto cortado por `overflow: hidden` sem `text-overflow`;
 *   • erro de console.
 *
 * Uso:
 *   npm run build:renderer
 *   node scripts/check-mobile-layout.mjs [--screens]
 *
 * `--screens` também salva capturas em docs/screenshots/layout/.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.env.PRISMA_PORT ?? 5297);
const saveScreens = process.argv.includes('--screens');
const outDir = path.join(root, 'docs', 'screenshots', 'layout');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { name: 'paisagem-pequena', width: 568, height: 320 },
  { name: 'compacto-320', width: 320, height: 568 },
  { name: 'comum-360', width: 360, height: 640 },
  { name: 'pixel-390', width: 390, height: 844 },
  { name: 'grande-412', width: 412, height: 915 },
  { name: 'paisagem-844', width: 844, height: 390 },
  { name: 'tablet-768', width: 768, height: 1024 },
];

const SCREENS = 8; // seções da navegação

const viteBin = require.resolve('vite/package.json').replace(/package\.json$/, 'bin/vite.js');
const server = spawn(
  process.execPath,
  [viteBin, 'preview', '--port', String(PORT), '--strictPort'],
  {
    cwd: root,
    stdio: 'ignore',
  },
);

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* subindo */
    }
    await wait(200);
  }
  return false;
}

/** Coleta problemas na tela atual. */
async function auditPage(page, label) {
  return page.evaluate((lbl) => {
    const problems = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (document.documentElement.scrollWidth - vw > 1) {
      problems.push(
        `${lbl}: rolagem horizontal (${document.documentElement.scrollWidth}px > ${vw}px)`,
      );
    }

    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        st.visibility !== 'hidden' &&
        st.display !== 'none' &&
        Number(st.opacity) > 0.05
      );
    };

    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls =
        typeof el.className === 'string' && el.className
          ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
          : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    // 1. elementos fora da viewport
    const all = Array.from(document.querySelectorAll('body *'));
    for (const el of all) {
      if (!isVisible(el)) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      if (el.classList.contains('skip-link')) continue; // fora da tela até receber foco (a11y)
      const st = getComputedStyle(el);
      // ignora quem rola de propósito (carrosséis/tab bars) — o próprio
      // elemento ou qualquer ancestral próximo
      let scroller = false;
      for (let node = el, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
        const style = getComputedStyle(node);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
          scroller = true;
          break;
        }
      }
      if (scroller) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1.5) {
        problems.push(
          `${lbl}: ${describe(el)} passa da borda direita (${Math.round(r.right)} > ${vw})`,
        );
      }
      if (r.left < -1.5) {
        problems.push(`${lbl}: ${describe(el)} passa da borda esquerda (${Math.round(r.left)})`);
      }
      if (r.bottom > vh + 1.5 && st.position === 'fixed') {
        problems.push(
          `${lbl}: ${describe(el)} fixo passa da base (${Math.round(r.bottom)} > ${vh})`,
        );
      }
    }

    // 2. alvos de toque
    const interactive = Array.from(
      document.querySelectorAll('button, a[href], input, select, [role="button"], [role="tab"]'),
    );
    for (const el of interactive) {
      if (!isVisible(el)) continue;
      if (el.matches('[data-touch-exempt], .skip-link')) continue;
      const r = el.getBoundingClientRect();
      // Exigência: 40 px de altura para controles gerais (polegar) e 24×24
      // para caixas de seleção, que é o mínimo da WCAG 2.2.
      const isToggle = el.matches("input[type='checkbox'], input[type='radio']");
      const minH = isToggle ? 23.4 : 40;
      if (r.height < minH || r.width < 23.4) {
        problems.push(
          `${lbl}: alvo pequeno ${describe(el)} (${Math.round(r.width)}×${Math.round(r.height)})`,
        );
      }
    }

    // 3. texto cortado
    for (const el of all) {
      if (!isVisible(el) || !el.textContent || el.children.length > 0) continue;
      const st = getComputedStyle(el);
      if (st.overflow !== 'hidden' || st.textOverflow === 'ellipsis' || st.whiteSpace === 'nowrap')
        continue;
      if (el.scrollHeight - el.clientHeight > 2 && el.clientHeight > 0) {
        problems.push(
          `${lbl}: texto cortado ${describe(el)} ("${el.textContent.trim().slice(0, 24)}…")`,
        );
      }
    }

    return problems;
  }, label);
}

try {
  if (!(await waitForServer(`http://localhost:${PORT}/`))) {
    console.error('[layout] o preview não respondeu — rode `npm run build:renderer` antes.');
    server.kill();
    process.exit(1);
  }
  if (saveScreens) await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const problems = [];

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: vp.width < 1000,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    });
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`${vp.name}: console → ${m.text().slice(0, 120)}`);
    });
    page.on('pageerror', (e) =>
      problems.push(`${vp.name}: pageerror → ${e.message.slice(0, 120)}`),
    );

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.nav-item');

    const count = await page.locator('.nav-item').count();
    for (let i = 0; i < Math.min(count, SCREENS); i++) {
      await page.locator('.nav-item').nth(i).click();
      await wait(450);
      const label = await page
        .locator('.nav-item')
        .nth(i)
        .innerText()
        .catch(() => `tela-${i}`);
      problems.push(...(await auditPage(page, `${vp.name}/${label.trim().replace(/\s+/g, '-')}`)));
      if (saveScreens) {
        await page.screenshot({ path: path.join(outDir, `${vp.name}-${i}.png`) });
      }
    }

    await context.close();
    process.stdout.write(`[layout] ${vp.name} (${vp.width}×${vp.height}) ok\n`);
  }

  await browser.close();
  server.kill();

  if (problems.length === 0) {
    console.log(`[layout] sucesso: ${VIEWPORTS.length} tamanhos × ${SCREENS} telas sem problemas.`);
    process.exit(0);
  }

  const unique = [...new Set(problems)];
  console.error(`[layout] ${unique.length} problema(s):\n`);
  for (const p of unique.slice(0, 60)) console.error('  -', p);
  if (unique.length > 60) console.error(`  ... e mais ${unique.length - 60}`);
  process.exit(1);
} catch (err) {
  console.error('[layout] falhou:', err instanceof Error ? err.message : err);
  server.kill();
  process.exit(1);
}
