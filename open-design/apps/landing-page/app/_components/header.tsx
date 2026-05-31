/*
 * Sticky Header — static markup rendered at build time. Headroom-style
 * hide/show and the live GitHub star count are attached by the tiny inline
 * script in `app/pages/index.astro`, so this public studio surface ships no React
 * runtime to the browser.
 */

const REPO = 'https://github.com/ai-game-design-studio/ai-game-design-studio';
const REPO_RELEASES = `${REPO}/releases`;
const REPO_SKILLS = `${REPO}/tree/main/skills`;
const REPO_GAME_ART_BIBLES = `${REPO}/tree/main/game-art-bibles`;

const ext = {
  target: '_blank',
  rel: 'noreferrer noopener',
} as const;

export function Header() {
  return (
    <header className='nav' data-agds-id='nav' data-nav-headroom>
      <div className='container nav-inner'>
        <a href='#top' className='studio-identity'>
          <span className='studio-mark'>Ø</span>
          <span>AI Game Design Studio</span>
          <span className='studio-meta'>
            <b>Studio Nº 01</b>Berlin / Open / Earth
          </span>
        </a>
        <nav>
          <ul className='nav-links'>
            <li>
              <a href={REPO_SKILLS} {...ext}>
                Skills<span className='num'>31</span>
              </a>
            </li>
            <li>
              <a href={REPO_GAME_ART_BIBLES} {...ext}>
                Systems<span className='num'>72</span>
              </a>
            </li>
            <li>
              <a href='#agents'>
                Agents<span className='num'>12</span>
              </a>
            </li>
            <li>
              <a href='#labs'>
                Labs<span className='num'>05</span>
              </a>
            </li>
            <li>
              <a href='#contact'>Contact</a>
            </li>
          </ul>
        </nav>
        <div className='nav-side'>
          <a
            className='nav-action ghost'
            href={REPO_RELEASES}
            aria-label='Download AI Game Design Studio desktop'
            title='Download the desktop studio'
            {...ext}
          >
            Download
          </a>
          <a
            className='nav-action'
            href={REPO}
            aria-label='Star AI Game Design Studio on GitHub'
            title='Click to star us on GitHub'
            {...ext}
          >
            Star · <span data-github-stars>0</span>
          </a>
          <span className='status-dot' aria-hidden='true' />
        </div>
      </div>
    </header>
  );
}
