import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout from '../../app/layout';

describe('RootLayout theme bootstrap', () => {
  it('reads only the canonical AGDS browser config key', () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <main>Studio</main>
      </RootLayout>,
    );

    expect(markup).toContain("localStorage.getItem('ai-game-design-studio:config')");
    expect(markup).not.toContain('open-design:config');
  });
});
