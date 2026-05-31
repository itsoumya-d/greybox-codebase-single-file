// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Greybox Marketplace',
  description: 'Buy and sell game design templates, art bibles, skills, and pro modules.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="gb-nav" aria-label="Primary">
          <Link href="/" className="gb-nav-brand">
            Greybox Marketplace
          </Link>
          <div className="gb-nav-links">
            <Link href="/" className="gb-nav-link">
              Catalog
            </Link>
            <Link href="/creator/dashboard" className="gb-nav-link">
              Creator
            </Link>
            <Link href="/admin/review" className="gb-nav-link">
              Admin
            </Link>
          </div>
          <Link href="/creator/onboard" className="gb-button-secondary gb-button" style={{ padding: '6px 14px', fontSize: 13 }}>
            Become a creator
          </Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
