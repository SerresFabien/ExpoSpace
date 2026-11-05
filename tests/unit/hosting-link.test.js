import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOSTING_LINK } from '../../packages/shared/src/hosting.js';

const pages = {
  'interface (apps/web/index.html)': new URL('../../apps/web/index.html', import.meta.url),
  'page d’attente (deploy/preparation/index.html)': new URL('../../deploy/preparation/index.html', import.meta.url),
};

describe('lien By-Hoster dans le HTML initial', () => {
  for (const [label, url] of Object.entries(pages)) {
    it(label, () => {
      const html = readFileSync(url, 'utf8');
      expect(html.split(HOSTING_LINK)).toHaveLength(2);
      const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
      expect(withoutComments).toContain(HOSTING_LINK);
      const footer = /<footer[^>]*>([\s\S]*?)<\/footer>/.exec(withoutComments)?.[0] ?? '';
      expect(footer).toContain(HOSTING_LINK);
      expect(footer).not.toMatch(/hidden|display:\s*none|visibility:\s*hidden|aria-hidden/);
      expect(/<div id="root">([\s\S]*?)<\/div>/.exec(withoutComments)?.[1] ?? '').not.toContain('by-hoster');
    });
  }
});
