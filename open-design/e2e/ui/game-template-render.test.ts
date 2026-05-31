import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const templatesRoot = resolve(repoRoot, 'templates');

const FORBIDDEN_VISIBLE_COPY = [
  /website generator/i,
  /website designer/i,
  /app designer/i,
  /SaaS dashboard/i,
  /SaaS landing page/i,
  /\bmobile app\b/i,
  /\bDesign Systems\b/i,
  /\bOpen Design\b/i,
  /\bpricing card\b/i,
  /\badmin panel\b/i,
  /\bCRM\b/i,
  /\be-commerce\b/i,
  /\bbusiness report\b/i,
  /\buser flow\b/i,
  /\bcustomer journey\b/i,
];

const VIEWPORTS = [
  { height: 950, name: 'desktop', width: 1440 },
  { height: 844, name: 'mobile', width: 390 },
] as const;

const GAME_TEMPLATE_EXPECTATIONS: Record<string, RegExp> = {
  'arena-shooter-hud.html': /Shield|Ammo|Combo|Dash/i,
  'city-builder-overview.html': /Harbor City|District Grid|Approval/i,
  'combat-spec.html': /Combat Loop|enemy roles|hitstop|accessibility/i,
  'cozy-farming-sim.html': /Cozy farming game loop|Player Objectives|Farm Plots/i,
  'economy-balance-sheet.html': /Economy Balance Sheet|loot odds|game economy/i,
  'extraction-shooter-ui.html': /Extraction opens|Storm wall|Squad|Loadout/i,
  'game-design-document.html': /player fantasy|Design Pillars|Vertical Slice/i,
  'horror-survival-hud.html': /Noise detected|barricade|Ammo|Inventory/i,
  'level-flowchart.html': /Level Flowchart|encounter pressure|narrative triggers/i,
  'live-ops-calendar.html': /Live Ops Calendar|retention goals|Season/i,
  'mobile-idle-rpg.html': /Offline rewards|Auto Battle|Daily Quests/i,
  'narrative-tree.html': /Narrative Branching Tree|faction variables|Quest Arc/i,
  'racing-simulator-ui.html': /Lap|Brake temp|Next corner/i,
  'roguelike-dungeon-crawler.html': /Dungeon Room|Run State|Next Reward/i,
  'tactical-rpg-battle.html': /Tactical Turn|Player phase|Objectives/i,
  'visual-novel-dialogue.html': /Trust|Clue|Mira|Security/i,
};

const htmlTemplates = readdirSync(templatesRoot)
  .filter((file) => file.endsWith('.html') && file !== 'deck-framework.html')
  .sort();

async function collectTemplateLayoutIssues(page: Page) {
  return await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    const clippedControls = Array.from(document.querySelectorAll('button, [role="button"], .ability, .slot'))
      .filter(visible)
      .filter((el) => el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)
      .slice(0, 10)
      .map((el) => ({
        clientHeight: el.clientHeight,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        scrollWidth: el.scrollWidth,
        tag: el.tagName,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 80),
      }));

    const offscreenRight = Array.from(document.body.querySelectorAll('*'))
      .filter(visible)
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2)
      .slice(0, 10)
      .map((el) => ({
        right: Math.round(el.getBoundingClientRect().right),
        tag: el.tagName,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      }));

    return {
      horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      clippedControls,
      offscreenRight,
      visibleNodeCount: Array.from(document.body.querySelectorAll('*')).filter(visible).length,
    };
  });
}

test('public HTML game templates have explicit visual smoke expectations', () => {
  expect(htmlTemplates.filter((file) => !GAME_TEMPLATE_EXPECTATIONS[file])).toEqual([]);
});

for (const templateFile of htmlTemplates) {
  test(`${templateFile} renders as a responsive game artifact`, async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const html = readFileSync(resolve(templatesRoot, templateFile), 'utf8');
    const expectedGameCopy = GAME_TEMPLATE_EXPECTATIONS[templateFile];
    expect(expectedGameCopy, `${templateFile} expectation`).toBeDefined();

    for (const viewport of VIEWPORTS) {
      const consoleStart = consoleErrors.length;
      const pageStart = pageErrors.length;
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(html, { waitUntil: 'load' });

      const bodyText = await page.locator('body').innerText();
      const screenshot = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${templateFile.replace(/\.html$/, '')}-${viewport.name}.png`, {
        body: screenshot,
        contentType: 'image/png',
      });
      const layout = await collectTemplateLayoutIssues(page);

      expect(bodyText.trim().length, `${templateFile} ${viewport.name} visible text`).toBeGreaterThan(40);
      expect(bodyText, `${templateFile} ${viewport.name} game vocabulary`).toMatch(expectedGameCopy as RegExp);
      for (const forbidden of FORBIDDEN_VISIBLE_COPY) {
        expect(bodyText, `${templateFile} ${viewport.name} forbidden copy ${forbidden}`).not.toMatch(forbidden);
      }
      expect(consoleErrors.slice(consoleStart), `${templateFile} ${viewport.name} console errors`).toEqual([]);
      expect(pageErrors.slice(pageStart), `${templateFile} ${viewport.name} page errors`).toEqual([]);
      expect(layout.visibleNodeCount, `${templateFile} ${viewport.name} visible nodes`).toBeGreaterThan(5);
      expect(layout.horizontalOverflow, `${templateFile} ${viewport.name} horizontal overflow`).toBeLessThanOrEqual(2);
      expect(layout.offscreenRight, `${templateFile} ${viewport.name} offscreen elements`).toEqual([]);
      expect(layout.clippedControls, `${templateFile} ${viewport.name} clipped controls`).toEqual([]);
    }
  });
}
