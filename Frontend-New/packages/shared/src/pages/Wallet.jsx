"use client";

import { useCallback, useState } from "react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import Icon from "../components/ui/Icon";
import PaybisCheckout from "../components/wallet/PaybisCheckout";
import { useAccount } from "../context/AccountContext";
import { useToast } from "../context/ToastContext";
import { ACCOUNT_ROLES } from "../lib/accountRoles";
import { statementDate } from "../lib/format";
import { ledgerLabel } from "../lib/paybis";
import { boostOptions, creditPacks } from "../data/mock";

/** The cheapest thing credits buy, read from the tiers rather than retyped from them. */
const cheapestBoost = boostOptions.reduce((a, b) =>
  b.credits < a.credits ? b : a,
);

/**
 * Credits: the balance, where it came from, and where it went.
 *
 * The number in the app bar was decoration until this screen existed — you
 * could see it and never move it. Buying here calls the real `addCredits`, so
 * the bar, this hero and the ledger below are three views of one value and
 * cannot disagree.
 *
 * Not behind `RequireCapability`: everyone holds `wallet.view`, and a balance
 * you cannot read is worse than one you cannot spend. What a browsing account
 * gets instead is the truth — there is nothing here to spend it on — and the
 * one control that changes that.
 *
 * The money half is Paybis (`components/wallet/PaybisCheckout`). Picking a
 * pack no longer opens a "are you sure, we'll bill your card" dialog, because
 * that question belongs to whoever is actually taking the payment and they ask
 * it better: this screen opens their checkout on the amount and gets out of
 * the way until it comes back with an answer.
 *
 * That is also why there is no longer a saved-cards row under the ledger. A
 * card list only earns its place if something bills it, and once Paybis
 * collects the card itself nothing here does — a screen that stores card
 * details for no reader is a liability with a settings row.
 */
export default function Wallet() {
  const toast = useToast();
  const { credits, ledger, isCreator, setRole, addCredits } = useAccount();
  // The pack being paid for — and, while it is set, the checkout in the modal.
  const [pending, setPending] = useState(null);

  // `wallet.js` prepends, so the ledger arrives newest-first — but it also
  // arrives from a cookie anyone can edit, and this screen promises an order.
  const rows = [...ledger].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

  const grant = useCallback(
    (pack, label) => {
      const balance = addCredits({
        credits: pack.credits,
        label,
        price: pack.price,
      });
      // `addCredits` returns null when the pack is nonsense (a zero-credit row
      // in the data). Saying nothing happened beats toasting a purchase that
      // didn't — and if a payment did land behind it, a support ticket with a
      // Paybis reference on it beats a balance that silently disagrees.
      toast(
        balance === null
          ? "That pack could not be added — contact support with your receipt"
          : `${pack.credits} credits added — you now have ${balance}`,
      );
    },
    [addCredits, toast],
  );

  /**
   * How the checkout ended.
   *
   * Crediting from a browser message is the compromise this build makes and
   * not the shape it keeps: on a backend the webhook is what settles a
   * purchase and this screen just refetches its balance, because the browser
   * saying "it worked" is the browser saying it, and the browser is the one
   * party in a payment flow with a motive. `readReturnMessage` narrows who is
   * allowed to say it; `server/paybisRequest.js` has the rest of the note.
   */
  const settle = useCallback(
    ({ status, transactionId }) => {
      const pack = pending;
      setPending(null);
      if (!pack) return;

      if (status === "completed") {
        grant(pack, ledgerLabel(pack, transactionId));
        return;
      }
      toast(
        status === "cancelled"
          ? "Checkout closed — nothing was charged"
          : "That payment did not go through. Nothing was charged.",
      );
    },
    [pending, grant, toast],
  );

  /** The no-merchant-account path: move the balance, and label it honestly. */
  const grantUnpaid = useCallback(() => {
    const pack = pending;
    setPending(null);
    if (pack) grant(pack, `${pack.credits} credits (demo)`);
  }, [pending, grant]);

  function becomeCreator() {
    setRole("creator");
    toast("You're an ads creator now");
  }

  return (
    <>
      <SubPageBar
        title="Credits"
        subtitle={`${credits} in your balance`}
        fallback="/profile"
      />

      <PageBody className="px-4 pb-8 pt-3 lg:px-8 lg:py-6">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <div>
            {/* The balance, on the same gradient the profile hero wears, so the
                two screens read as one account rather than two products. */}
            <section className="brand-gradient relative overflow-hidden rounded-card p-5 shadow-lift lg:p-6">
              <span
                aria-hidden="true"
                className="absolute -right-10 -top-10 size-40 rounded-full bg-on-brand/15 blur-2xl"
              />
              <p className="relative text-[11px] font-bold uppercase tracking-[0.12em] text-on-brand/75">
                Your balance
              </p>
              <p className="relative mt-1 flex items-baseline gap-2">
                <span className="text-[44px] font-extrabold leading-none tabular-nums text-on-brand">
                  {credits}
                </span>
                <span className="text-[15px] font-bold text-on-brand/80">
                  credits
                </span>
              </p>
              <p className="relative mt-3 max-w-[24rem] text-[13px] leading-relaxed text-on-brand/85">
                Credits promote ads: {cheapestBoost.credits} puts one at the top
                of its category for {cheapestBoost.days} days.
              </p>
            </section>

            <section className="mt-6">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Buy credits
              </h2>
              <div className="grid grid-cols-3 gap-2.5">
                {creditPacks.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => setPending(pack)}
                    aria-label={`Buy ${pack.credits} credits for $${pack.price}, ${pack.note}`}
                    className={`rounded-card p-3 text-center shadow-card transition-transform hover:-translate-y-0.5 ${
                      pack.best
                        ? "brand-gradient text-on-brand"
                        : "bg-surface text-ink"
                    }`}
                  >
                    <p className="text-[18px] font-extrabold tabular-nums">
                      {pack.credits}
                    </p>
                    <p
                      className={`text-[11px] font-semibold ${pack.best ? "text-on-brand/80" : "text-muted"}`}
                    >
                      credits
                    </p>
                    <p className="mt-2 text-[14px] font-bold tabular-nums">
                      ${pack.price}
                    </p>
                    <p
                      className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        pack.best ? "text-on-brand/80" : "text-muted"
                      }`}
                    >
                      {pack.note}
                    </p>
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[12px] leading-relaxed text-muted">
                Checkout is handled by Paybis — card or bank transfer, in your
                own currency. Card details never reach us.
              </p>
            </section>

            {/* A browsing account can hold a balance — it just cannot spend one.
                Saying so is kinder than a hero that implies otherwise. */}
            {!isCreator && (
              <section className="mt-4 rounded-card bg-surface p-5 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                    <Icon
                      name={ACCOUNT_ROLES.creator.icon}
                      className="size-5"
                      strokeWidth={2.2}
                    />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-bold text-ink">
                      Nothing to spend these on yet
                    </h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">
                      Credits pay to promote ads, and a browsing account does
                      not post any. {ACCOUNT_ROLES.creator.blurb} Your balance
                      comes with you.
                    </p>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="mt-4 w-full"
                  onClick={becomeCreator}
                >
                  Become an ads creator
                </Button>
              </section>
            )}
          </div>

          <div className="mt-6 lg:mt-0">
            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Transaction history
              </h2>

              {rows.length === 0 ? (
                <EmptyState
                  icon="ReceiptText"
                  title="No transactions yet"
                  body="Top-ups and promotions both land here, newest first."
                />
              ) : (
                <div className="overflow-hidden rounded-card bg-surface shadow-card">
                  {rows.map((row, i) => {
                    const up = row.delta > 0;
                    // A hand-edited cookie can carry a row with no usable timestamp;
                    // statementDate drops the date and the row still renders.
                    const date = statementDate(row.at);
                    return (
                      <div
                        key={row.id}
                        className={`flex items-center gap-3 p-4 ${i ? "border-t border-line" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-ink">
                            {row.label}
                          </p>
                          <p className="mt-0.5 text-[12px] text-muted">
                            {date}
                            {/* Credits and dollars are different units, so the
                                one that is money keeps its sign. */}
                            {row.price != null &&
                              `${date ? " · " : ""}$${row.price}`}
                          </p>
                        </div>
                        <p
                          className={`shrink-0 text-[14px] font-bold tabular-nums ${
                            up ? "text-emerald-600" : "text-danger"
                          }`}
                        >
                          {/* The glyph, not the colour, is what says which way
                              this went — colour is never the only signal. */}
                          {up ? "+" : "−"}
                          {Math.abs(row.delta)}
                          <span className="sr-only">
                            {up ? " credits added" : " credits spent"}
                          </span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </PageBody>

      {/* No footer, and no "Pay" button of our own: the widget below carries
          its own, on the amount it is actually about to take. Two pay buttons
          in one dialog is how a double charge starts. */}
      <Modal
        open={Boolean(pending)}
        title={pending ? `Buy ${pending.credits} credits` : ""}
        subtitle="Paid through Paybis. Close this any time — nothing is charged until you finish."
        onClose={() => setPending(null)}
        size="max-w-lg"
      >
        {pending && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-card bg-canvas p-4">
              <span className="text-[15px] font-semibold text-ink">
                {pending.credits} credits
              </span>
              <span className="text-[18px] font-extrabold tabular-nums text-ink">
                ${pending.price}
              </span>
            </div>

            {/* Keyed on the pack so switching packs starts a new transaction
                request rather than reusing one priced at the old amount. */}
            <PaybisCheckout
              key={pending.id}
              pack={pending}
              onSettled={settle}
              onSimulate={grantUnpaid}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
