"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import DataTable from "../components/admin/DataTable";
import StatCard from "../components/admin/StatCard";
import StatusBadge from "../components/admin/StatusBadge";
import SegmentedControl from "../components/ui/SegmentedControl";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import EmptyState from "../components/ui/EmptyState";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminData } from "../context/AdminDataContext";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useToast } from "../context/ToastContext";
import { revenueSeries } from "../lib/adminStore";
import { inScope, useSiteScope } from "../lib/adminScope";

/**
 * The money: what came in, what it can be spent on, and which ads are paying
 * for placement right now.
 *
 * Promotions is a live view rather than a ledger — boosts are a state on the
 * ad, not a row in a table, so this shows the ads and lets you stop one.
 */

const TABS = [
  { value: "history", label: "History" },
  { value: "packs", label: "Credit packs" },
  { value: "promos", label: "Promotions" },
];

const EMPTY_PACK = { credits: 100, price: 9, note: "" };

export default function Billing() {
  const { state, dispatch } = useAdminData();
  const { can } = useAdminAuth();
  const toast = useToast();
  const [site] = useSiteScope();
  const [tab, setTab] = useState("history");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [refunding, setRefunding] = useState(null);

  const revenue = revenueSeries(state);
  const gross = state.billing.reduce((sum, b) => sum + b.amount, 0);
  const boosted = state.listings.filter((l) => l.boosted && inScope(l, site));

  // The number inputs hand back strings, and an empty box is "" — which is not
  // a number and must not reach the store as one.
  const packValid = Number(editing?.credits) > 0 && Number(editing?.price) > 0;

  function savePack() {
    if (!packValid) return;
    dispatch({
      type: "upsertCreditPack",
      pack: {
        ...editing,
        credits: Number(editing.credits),
        price: Number(editing.price),
      },
    });
    toast(editing.id ? "Pack updated" : "Pack added");
    setEditing(null);
  }

  return (
    <>
      <AdminHeader
        title="Billing"
        subtitle="Credits, packs and paid placement"
        actions={
          tab === "packs" &&
          can("billing.manage") && (
            <Button size="sm" onClick={() => setEditing({ ...EMPTY_PACK })}>
              Add pack
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Gross, 8 weeks"
          value={`$${revenue.at(-1)}`}
          series={revenue}
        />
        <StatCard
          label="Recorded charges"
          value={`$${gross}`}
          icon="ReceiptText"
          tone="green"
          deltaLabel={`${state.billing.length} line items`}
        />
        <StatCard
          label="Packs on sale"
          value={state.creditPacks.length}
          icon="CreditCard"
          tone="indigo"
          deltaLabel="credit bundles"
        />
        <StatCard
          label="Boosted ads"
          value={boosted.length}
          icon="Megaphone"
          tone="purple"
          deltaLabel="paying for placement"
        />
      </div>

      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={setTab}
        label="Billing section"
        className="mb-4 lg:max-w-md"
      />

      {tab === "history" && (
        <DataTable
          columns={[
            { key: "label", label: "Item" },
            { key: "date", label: "Date", width: 150 },
            {
              key: "amount",
              label: "Amount",
              width: 120,
              render: (row) => (
                <span
                  className={
                    row.refunded
                      ? "text-muted line-through"
                      : "font-bold text-ink"
                  }
                >
                  ${row.amount}
                </span>
              ),
            },
            {
              key: "refunded",
              label: "State",
              width: 120,
              render: (row) => (
                <StatusBadge
                  status={row.refunded ? "dismissed" : "active"}
                  label={row.refunded ? "Refunded" : "Charged"}
                />
              ),
            },
            {
              key: "actions",
              label: "",
              width: 110,
              sortable: false,
              render: (row) =>
                can("billing.refund") && !row.refunded ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRefunding(row)}
                  >
                    Refund
                  </Button>
                ) : null,
            },
          ]}
          rows={state.billing}
          empty={{ icon: "ReceiptText", title: "No charges recorded" }}
        />
      )}

      {tab === "packs" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.creditPacks.map((pack) => (
            <article key={pack.id} className={CARD}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[24px] font-extrabold leading-none text-ink">
                    {pack.credits}
                  </p>
                  <p className="text-[13px] font-semibold text-muted">
                    credits
                  </p>
                </div>
                {pack.best && <StatusBadge status="boosted" label="Featured" />}
              </div>
              <p className="mt-3 text-[20px] font-extrabold text-ink">
                ${pack.price}
              </p>
              <p className="text-[13px] text-muted">
                {pack.note || "—"} · $
                {(Number(pack.price) / Number(pack.credits)).toFixed(3)} per
                credit
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setEditing({ ...pack })}
                >
                  <Pencil className="size-4" strokeWidth={2.4} />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(pack)}
                  aria-label={`Delete the ${pack.credits} credit pack`}
                >
                  <Trash2 className="size-4 text-danger" strokeWidth={2.4} />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "promos" && (
        <>
          {boosted.length ? (
            <DataTable
              columns={[
                {
                  key: "title",
                  label: "Ad",
                  render: (row) => (
                    <Link
                      href={`/listings/${row.id}`}
                      className="font-bold text-ink hover:text-brand"
                    >
                      {row.title}
                    </Link>
                  ),
                },
                { key: "business", label: "Seller", width: 200 },
                {
                  key: "site",
                  label: "Site",
                  width: 120,
                  render: (row) => <StatusBadge status={row.site} />,
                },
                {
                  key: "views",
                  label: "Views",
                  width: 110,
                  render: (row) => row.views.toLocaleString(),
                },
                {
                  key: "actions",
                  label: "",
                  width: 120,
                  sortable: false,
                  render: (row) => (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        dispatch({ type: "setBoost", id: row.id, on: false });
                        toast("Boost stopped");
                      }}
                    >
                      Stop boost
                    </Button>
                  ),
                },
              ]}
              rows={boosted}
              empty={{ icon: "Megaphone", title: "Nothing boosted" }}
            />
          ) : (
            <EmptyState
              icon="Megaphone"
              title="No ads are boosted"
              body="Start one from any listing's detail screen."
            />
          )}
        </>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? "Edit credit pack" : "Add a credit pack"}
        size="max-w-md"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!packValid}
              onClick={savePack}
            >
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Credits">
                <input
                  type="number"
                  min={1}
                  value={editing.credits}
                  onChange={(e) =>
                    setEditing({ ...editing, credits: e.target.value })
                  }
                  className={`${FIELD} ${border(false)}`}
                />
              </Field>
              <Field label="Price (CAD)">
                <input
                  type="number"
                  min={1}
                  value={editing.price}
                  onChange={(e) =>
                    setEditing({ ...editing, price: e.target.value })
                  }
                  className={`${FIELD} ${border(false)}`}
                />
              </Field>
            </div>
            <Field label="Note" hint="Shown on the pack">
              <input
                value={editing.note}
                onChange={(e) =>
                  setEditing({ ...editing, note: e.target.value })
                }
                placeholder="Most popular"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <label className="flex items-center gap-2.5 text-[14px] font-semibold text-ink">
              <input
                type="checkbox"
                checked={Boolean(editing.best)}
                onChange={(e) =>
                  setEditing({ ...editing, best: e.target.checked })
                }
                className="size-4 accent-[var(--brand)]"
              />
              Feature this pack
            </label>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(refunding)}
        title="Refund this charge?"
        body={`${refunding?.label} · ${refunding?.amount}. The charge stays on the ledger marked refunded — a ledger you can delete rows from is not a ledger.`}
        confirmLabel="Refund"
        onClose={() => setRefunding(null)}
        onConfirm={() => {
          dispatch({ type: "refundCharge", id: refunding.id });
          toast("Charge refunded");
          setRefunding(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete the ${deleting?.credits} credit pack?`}
        body="It stops being offered. Credits already bought are unaffected."
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          dispatch({ type: "deleteCreditPack", id: deleting.id });
          toast("Pack deleted");
          setDeleting(null);
        }}
      />
    </>
  );
}
