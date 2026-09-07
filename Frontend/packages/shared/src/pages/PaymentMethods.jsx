"use client";

import { useState } from "react";
import { CreditCard, Plus, Star, Trash2 } from "lucide-react";
import SubPageBar from "../components/layout/SubPageBar";
import PageBody from "../components/layout/PageBody";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Field, { FIELD, border } from "../components/create/Field";
import { useToast } from "../context/ToastContext";
import { billingHistory, creditPacks, paymentMethods } from "../data/mock";

export function validateCard({ number, expiry, cvc, name }) {
  const errors = {};
  const digits = number.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19)
    errors.number = "Enter a 13-19 digit card number.";
  if (!/^(0[1-9]|1[0-2])\s?\/\s?\d{2}$/.test(expiry.trim()))
    errors.expiry = "Use MM / YY.";
  if (!/^\d{3,4}$/.test(cvc.trim())) errors.cvc = "3 or 4 digits.";
  if (!name.trim()) errors.name = "Name on the card is required.";
  return errors;
}

const EMPTY_CARD = { number: "", expiry: "", cvc: "", name: "" };

export default function PaymentMethods() {
  const toast = useToast();
  const [cards, setCards] = useState(paymentMethods);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_CARD);
  const [errors, setErrors] = useState({});
  const [pendingDelete, setPendingDelete] = useState(null);

  const patch = (next) => {
    setForm((f) => ({ ...f, ...next }));
    setErrors((e) => {
      const cleared = { ...e };
      Object.keys(next).forEach((k) => delete cleared[k]);
      return cleared;
    });
  };

  function addCard(e) {
    e.preventDefault();
    const found = validateCard(form);
    setErrors(found);
    if (Object.keys(found).length) return;

    const digits = form.number.replace(/\D/g, "");
    setCards((c) => [
      ...c,
      {
        id: `pm${Date.now()}`,
        brand: digits.startsWith("4") ? "Visa" : "Mastercard",
        last4: digits.slice(-4),
        expiry: form.expiry,
        primary: false,
      },
    ]);
    setForm(EMPTY_CARD);
    setAdding(false);
    toast("Card added");
  }

  function makePrimary(id) {
    setCards((c) => c.map((card) => ({ ...card, primary: card.id === id })));
    toast("Default card updated");
  }

  function remove() {
    setCards((c) => c.filter((card) => card.id !== pendingDelete.id));
    setPendingDelete(null);
    toast("Card removed");
  }

  return (
    <>
      <SubPageBar
        title="Payment methods"
        subtitle={`${cards.length} saved`}
        fallback="/profile/settings"
      />

      <PageBody className="px-4 pb-8 pt-3 lg:px-8 lg:py-6">
        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
          <section>
            <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Your cards
            </h2>

            <div className="space-y-3">
              {cards.map((card) => (
                <article
                  key={card.id}
                  className="flex items-center gap-3 rounded-card bg-surface p-3.5 shadow-card"
                >
                  <span className="brand-gradient grid size-11 shrink-0 place-items-center rounded-2xl text-on-brand">
                    <CreditCard className="size-5" strokeWidth={2.2} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[15px] font-bold text-ink">
                      {card.brand} •••• {card.last4}
                      {card.primary && (
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      Expires {card.expiry}
                    </p>
                  </div>

                  {!card.primary && (
                    <button
                      onClick={() => makePrimary(card.id)}
                      aria-label={`Make ${card.brand} ending ${card.last4} the default`}
                      className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-canvas hover:text-brand"
                    >
                      <Star className="size-[18px]" />
                    </button>
                  )}
                  <button
                    onClick={() => setPendingDelete(card)}
                    aria-label={`Remove ${card.brand} ending ${card.last4}`}
                    className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="size-[18px]" />
                  </button>
                </article>
              ))}

              <button
                onClick={() => setAdding(true)}
                className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line py-4 text-[15px] font-bold text-muted transition-colors hover:border-brand hover:text-brand"
              >
                <Plus className="size-5" strokeWidth={2.6} />
                Add a card
              </button>
            </div>
          </section>

          <div className="mt-6 lg:mt-0">
            <section>
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Buy credits
              </h2>
              <div className="grid grid-cols-3 gap-2.5">
                {creditPacks.map((pack) => (
                  <button
                    key={pack.id}
                    onClick={() => toast(`${pack.credits} credits added`)}
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
                      className={`text-[11px] font-semibold ${pack.best ? "text-white/80" : "text-muted"}`}
                    >
                      credits
                    </p>
                    <p className="mt-2 text-[14px] font-bold tabular-nums">
                      ${pack.price}
                    </p>
                    <p
                      className={`mt-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        pack.best ? "text-white/80" : "text-muted"
                      }`}
                    >
                      {pack.note}
                    </p>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                Billing history
              </h2>
              <div className="overflow-hidden rounded-card bg-surface shadow-card">
                {billingHistory.map((row, i) => (
                  <div
                    key={row.id}
                    className={`flex items-center gap-3 p-4 ${i ? "border-t border-line" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-ink">
                        {row.label}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {row.date}
                      </p>
                    </div>
                    <p className="shrink-0 text-[14px] font-bold tabular-nums text-ink">
                      ${row.amount}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </PageBody>

      <Modal
        open={adding}
        title="Add a card"
        subtitle="Cards are only stored in this demo's memory."
        onClose={() => setAdding(false)}
        size="max-w-md"
        footer={
          <Button type="submit" form="add-card" size="lg" className="w-full">
            Add card
          </Button>
        }
      >
        <form id="add-card" onSubmit={addCard} noValidate className="space-y-4">
          <Field label="Card number" error={errors.number}>
            <input
              inputMode="numeric"
              placeholder="4242 4242 4242 4242"
              value={form.number}
              onChange={(e) => patch({ number: e.target.value })}
              className={`${FIELD} ${border(errors.number)}`}
            />
          </Field>

          <div className="flex gap-3">
            <Field label="Expiry" error={errors.expiry}>
              <input
                placeholder="08 / 27"
                value={form.expiry}
                onChange={(e) => patch({ expiry: e.target.value })}
                className={`${FIELD} ${border(errors.expiry)}`}
              />
            </Field>
            <Field label="CVC" error={errors.cvc}>
              <input
                inputMode="numeric"
                placeholder="123"
                value={form.cvc}
                onChange={(e) => patch({ cvc: e.target.value })}
                className={`${FIELD} ${border(errors.cvc)}`}
              />
            </Field>
          </div>

          <Field label="Name on card" error={errors.name}>
            <input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              className={`${FIELD} ${border(errors.name)}`}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove this card?"
        body={
          pendingDelete
            ? `${pendingDelete.brand} ending ${pendingDelete.last4} will be removed.`
            : ""
        }
        confirmLabel="Remove"
        destructive
        onConfirm={remove}
        onClose={() => setPendingDelete(null)}
      />
    </>
  );
}
