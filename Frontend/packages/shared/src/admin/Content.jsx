"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import SegmentedControl from "../components/ui/SegmentedControl";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Icon from "../components/ui/Icon";
import Field, { FIELD, border } from "../components/create/Field";
import { useAdminData } from "../context/AdminDataContext";
import { useToast } from "../context/ToastContext";
import { tones } from "../lib/tones";

/**
 * The help centre, editable: FAQs, the four support topics, and the contact
 * channels. All three feed the same public `/support` screens, so they are one
 * screen here rather than three sections nobody would find separately.
 *
 * Contact channels are read-only on purpose — a support address is an
 * operational fact, not content, and getting one wrong routes real people
 * nowhere. Changing those is a deploy.
 *
 * There are two of them: live chat, which is the ticket queue this console
 * already works, and email. The phone line and the WhatsApp number are gone —
 * a channel nobody is staffing is worse than one fewer channel, because the
 * person who used it believes they have been in touch.
 */

const TABS = [
  { value: "faqs", label: "FAQs" },
  { value: "topics", label: "Topics" },
  { value: "channels", label: "Contact" },
];

const EMPTY_FAQ = { q: "", a: "", category: "Posting" };
const EMPTY_TOPIC = { label: "", sub: "", icon: "LifeBuoy", to: "/support" };

export default function Content() {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const [tab, setTab] = useState("faqs");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopic, setNewTopic] = useState(EMPTY_TOPIC);
  const [deletingTopic, setDeletingTopic] = useState(null);

  /** One field of one topic, written back only when it actually changed. */
  function commitTopic(topic, field, value) {
    const next = value.trim();
    if (!next || next === topic[field]) return;
    dispatch({ type: "upsertTopic", topic: { ...topic, [field]: next } });
    toast("Topic updated");
  }

  function saveFaq() {
    if (!editing.q.trim() || !editing.a.trim()) return;
    dispatch({ type: "upsertFaq", faq: editing });
    toast(editing.id ? "Answer updated" : "Answer added");
    setEditing(null);
  }

  return (
    <>
      <AdminHeader
        title="Content"
        subtitle="What the help centre says, on both sites"
        actions={
          <>
            {tab === "faqs" && (
              <Button size="sm" onClick={() => setEditing({ ...EMPTY_FAQ })}>
                Add answer
              </Button>
            )}
            {tab === "topics" && (
              <Button size="sm" onClick={() => setAddingTopic(true)}>
                Add topic
              </Button>
            )}
          </>
        }
      />

      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={setTab}
        label="Content section"
        className="mb-4 lg:max-w-md"
      />

      {tab === "faqs" && (
        <div className="flex flex-col gap-4">
          {state.faqCategories.map((category) => {
            const rows = state.faqs.filter((f) => f.category === category);
            return (
              <section key={category} className={CARD}>
                <h2 className="mb-2 text-[17px] font-extrabold text-ink">
                  {category}
                  <span className="ml-2 text-[13px] font-semibold text-muted">
                    {rows.length}
                  </span>
                </h2>
                {rows.length ? (
                  <ul className="divide-y divide-line">
                    {rows.map((faq) => (
                      <li key={faq.id} className="flex gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14.5px] font-bold text-ink">
                            {faq.q}
                          </p>
                          <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                            {faq.a}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <IconButton
                            label={`Edit "${faq.q}"`}
                            onClick={() => setEditing({ ...faq })}
                          >
                            <Pencil className="size-4" strokeWidth={2.4} />
                          </IconButton>
                          <IconButton
                            label={`Delete "${faq.q}"`}
                            danger
                            onClick={() => setDeleting(faq)}
                          >
                            <Trash2 className="size-4" strokeWidth={2.4} />
                          </IconButton>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-muted">
                    Nothing filed under {category} yet.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {tab === "topics" && (
        <section className={CARD}>
          <h2 className="mb-1 text-[17px] font-extrabold text-ink">
            Support topics
          </h2>
          <p className="mb-3 text-[13px] text-muted">
            The four tiles on the public help screen. Each one deep-links into
            an FAQ category, so the label and the category have to agree.
          </p>
          <ul className="divide-y divide-line">
            {state.topics.map((topic) => (
              <li key={topic.id} className="flex items-center gap-3 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                  <Icon
                    name={topic.icon}
                    className="size-5"
                    strokeWidth={2.4}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  {/* Committed on blur, not per keystroke. Every write is an
                      audit entry and the audit caps at 200 — typing a label
                      through onChange would erase the day's history. */}
                  {/* Keyed on the stored value: the row's own key is the
                      topic id and never changes, so without this React would
                      keep showing an edit that **Reset to seed** has already
                      thrown away — and write it back on the next blur. */}
                  <input
                    key={topic.label}
                    defaultValue={topic.label}
                    onBlur={(e) => commitTopic(topic, "label", e.target.value)}
                    aria-label={`Label for ${topic.id}`}
                    className="w-full bg-transparent text-[14.5px] font-bold text-ink outline-none"
                  />
                  <input
                    key={topic.sub}
                    defaultValue={topic.sub}
                    onBlur={(e) => commitTopic(topic, "sub", e.target.value)}
                    aria-label={`Subtitle for ${topic.id}`}
                    className="w-full bg-transparent text-[13px] text-muted outline-none"
                  />
                </div>
                <code className="shrink-0 rounded-lg bg-canvas px-2 py-1 text-[12px] text-muted">
                  {topic.to}
                </code>
                <IconButton
                  label={`Delete ${topic.label}`}
                  danger
                  onClick={() => setDeletingTopic(topic)}
                >
                  <Trash2 className="size-4" strokeWidth={2.4} />
                </IconButton>
              </li>
            ))}
          </ul>
          {state.topics.length === 0 && (
            <p className="text-[14px] text-muted">
              No topics — the public help screen shows its FAQ list alone.
            </p>
          )}
        </section>
      )}

      {tab === "channels" && (
        <section className={CARD}>
          <h2 className="mb-1 text-[17px] font-extrabold text-ink">
            Contact channels
          </h2>
          <p className="mb-3 text-[13px] text-muted">
            Read-only. A support address that is wrong routes a real person
            nowhere, so these change in a deploy and not in a textbox.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {state.channels.map((channel) => (
              <li
                key={channel.id}
                className="flex items-center gap-3 rounded-xl bg-canvas px-3.5 py-3"
              >
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-xl ${tones[channel.tone] ?? tones.slate}`}
                >
                  <Icon
                    name={channel.icon}
                    className="size-5"
                    strokeWidth={2.4}
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-bold text-ink">
                    {channel.label}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    {channel.meta}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={Boolean(editing)}
        title={editing?.id ? "Edit answer" : "Add an answer"}
        subtitle="This is what members read before they open a ticket, so answer the question they actually ask."
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
              disabled={!editing?.q.trim() || !editing?.a.trim()}
              onClick={saveFaq}
            >
              Save
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Question">
              <input
                value={editing.q}
                onChange={(e) => setEditing({ ...editing, q: e.target.value })}
                autoFocus
                placeholder="Can I pause an ad?"
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field label="Answer">
              <textarea
                value={editing.a}
                onChange={(e) => setEditing({ ...editing, a: e.target.value })}
                rows={5}
                placeholder="Open My Ads, choose the listing and tap Pause."
                className={`${FIELD} ${border(false)} resize-none`}
              />
            </Field>
            <Field label="Category">
              <select
                value={editing.category}
                onChange={(e) =>
                  setEditing({ ...editing, category: e.target.value })
                }
                className={`${FIELD} ${border(false)}`}
              >
                {state.faqCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={addingTopic}
        title="Add a support topic"
        subtitle="One of the tiles on the public help screen. It deep-links into an FAQ category, so the label and the category should agree."
        size="max-w-md"
        onClose={() => setAddingTopic(false)}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setAddingTopic(false)}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!newTopic.label.trim()}
              onClick={() => {
                dispatch({ type: "upsertTopic", topic: newTopic });
                toast("Topic added");
                setNewTopic(EMPTY_TOPIC);
                setAddingTopic(false);
              }}
            >
              Add
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Label">
            <input
              value={newTopic.label}
              onChange={(e) =>
                setNewTopic({ ...newTopic, label: e.target.value })
              }
              autoFocus
              placeholder="Refunds"
              className={`${FIELD} ${border(false)}`}
            />
          </Field>
          <Field label="Subtitle">
            <input
              value={newTopic.sub}
              onChange={(e) =>
                setNewTopic({ ...newTopic, sub: e.target.value })
              }
              placeholder="Credits, chargebacks, disputes"
              className={`${FIELD} ${border(false)}`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Icon" hint="From the registry">
              <input
                value={newTopic.icon}
                onChange={(e) =>
                  setNewTopic({ ...newTopic, icon: e.target.value })
                }
                className={`${FIELD} ${border(false)}`}
              />
            </Field>
            <Field label="Links to">
              <select
                value={newTopic.to}
                onChange={(e) =>
                  setNewTopic({ ...newTopic, to: e.target.value })
                }
                className={`${FIELD} ${border(false)}`}
              >
                <option value="/support">Help home</option>
                {state.faqCategories.map((c) => (
                  <option key={c} value={`/support/faqs?cat=${c}`}>
                    FAQs · {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingTopic)}
        title={`Delete ${deletingTopic?.label}?`}
        body="The tile comes off the public help screen. The FAQs it pointed at stay where they are."
        confirmLabel="Delete"
        destructive
        onClose={() => setDeletingTopic(null)}
        onConfirm={() => {
          dispatch({ type: "deleteTopic", id: deletingTopic.id });
          toast("Topic deleted");
          setDeletingTopic(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this answer?"
        body={deleting?.q}
        confirmLabel="Delete"
        destructive
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          dispatch({ type: "deleteFaq", id: deleting.id });
          toast("Answer deleted");
          setDeleting(null);
        }}
      />
    </>
  );
}

function IconButton({ label, danger = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-xl border border-line transition-colors ${
        danger
          ? "text-danger hover:bg-danger-soft"
          : "text-muted hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
