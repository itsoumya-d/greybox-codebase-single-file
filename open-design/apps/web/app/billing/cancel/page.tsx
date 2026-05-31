import dynamic from 'next/dynamic';

const BillingCancelPage = dynamic(
  () =>
    import('../../../src/billing/BillingCancelPage').then((m) => m.BillingCancelPage),
  {
    ssr: false,
    loading: () => <div className='agds-loading-shell'>Loading…</div>,
  },
);

export default function Page() {
  return <BillingCancelPage />;
}
