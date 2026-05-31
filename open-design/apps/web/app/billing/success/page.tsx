import dynamic from 'next/dynamic';

const BillingSuccessPage = dynamic(
  () =>
    import('../../../src/billing/BillingSuccessPage').then((m) => m.BillingSuccessPage),
  {
    ssr: false,
    loading: () => <div className='agds-loading-shell'>Welcome aboard…</div>,
  },
);

export default function Page() {
  return <BillingSuccessPage />;
}
