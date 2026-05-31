import dynamic from 'next/dynamic';

// The billing UI reads localStorage and window.location and talks to the
// daemon /api/billing/* proxy, so it is fully client-side. We mirror the
// pattern in `app/[[...slug]]/client-app.tsx` (dynamic with ssr: false) so
// `next build --output export` doesn't try to evaluate the browser-only
// code at static-render time.
const BillingPage = dynamic(
  () => import('../../src/billing/BillingPage').then((m) => m.BillingPage),
  {
    ssr: false,
    loading: () => <div className='agds-loading-shell'>Loading plans…</div>,
  },
);

export default function Page() {
  return <BillingPage />;
}
