'use client';

export function BillingCancelPage() {
  return (
    <main className='billing-page billing-page--centered'>
      <div className='billing-card'>
        <span className='billing-card__icon billing-card__icon--soft' aria-hidden='true'>
          ↩
        </span>
        <h1 className='billing-card__title'>No charge — your card was not billed.</h1>
        <p className='billing-card__body'>
          Checkout was canceled before payment completed. You can pick a different plan, or head
          back to the studio and keep working on the free tier.
        </p>
        <div className='billing-card__actions'>
          <a className='billing-plan-action billing-plan-action--primary' href='/billing'>
            See plans again
          </a>
          <a className='billing-plan-action billing-plan-action--ghost' href='/'>
            Back to studio
          </a>
        </div>
      </div>
    </main>
  );
}
