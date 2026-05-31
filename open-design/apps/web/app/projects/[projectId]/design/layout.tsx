// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from 'react';

import '../../../../src/design/design.css';

/**
 * Layout wrapper for the design route group.
 *
 * The actual project provider lives inside the page (it depends on a
 * dynamic fetch of `GameProject` data), so this layout is intentionally
 * thin — it only owns the design-surface CSS class scope and any
 * future cross-cutting concerns (toast container, devtools, etc.).
 */
export default function DesignLayout({ children }: { children: ReactNode }) {
  return <div className='design-route'>{children}</div>;
}
