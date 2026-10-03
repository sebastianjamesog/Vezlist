"use client";

import { useCallback, useEffect, useState } from "react";
import AdminHeader, { CARD } from "../components/admin/AdminHeader";
import Button from "../components/ui/Button";
import { createArticle, deleteArticle, listAdminArticles, updateArticle } from "../lib/api/articles.js";

const EMPTY = { category: "", q: "", a: "", published: false };

export default function Content() {
  const [articles, setArticles] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listAdminArticles();
      setArticles(page.items);
      setNextOffset(page.nextOffset);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function loadMore() {
    if (nextOffset == null) return;
    try {
      const page = await listAdminArticles({ offset: nextOffset });
      setArticles((current) => [...current, ...page.items]);
      setNextOffset(page.nextOffset);
    } catch (caught) {
      setError(caught);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { category: editing.category.trim(), q: editing.q.trim(), a: editing.a.trim(), published: editing.published };
      if (editing.id) await updateArticle(editing.id, payload);
      else await createArticle(payload);
      setEditing(null);
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function remove(article) {
    if (!window.confirm(`Delete “${article.q}”? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteArticle(article.id);
      await refresh();
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <>
      <AdminHeader title="Help articles" subtitle="Published answers appear on both public sites" actions={<Button size="sm" onClick={() => setEditing({ ...EMPTY })}>Add article</Button>} />
      {error && <div role="alert" className={`${CARD} mb-4 text-danger`}>{error.message || "Could not save changes."}</div>}
      {editing && (
        <form onSubmit={save} className={`${CARD} mb-4 space-y-3`}>
          <h2 className="font-bold text-ink">{editing.id ? "Edit article" : "New article"}</h2>
          <label className="block text-sm font-semibold text-ink">Category
            <input required maxLength={80} value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold text-ink">Question
            <input required maxLength={240} value={editing.q} onChange={(event) => setEditing({ ...editing, q: event.target.value })} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold text-ink">Answer
            <textarea required maxLength={10000} rows={6} value={editing.a} onChange={(event) => setEditing({ ...editing, a: event.target.value })} className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2" />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-ink"><input type="checkbox" checked={editing.published} onChange={(event) => setEditing({ ...editing, published: event.target.checked })} />Publish</label>
          <div className="flex gap-2"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
        </form>
      )}
      {loading ? <p role="status" className="text-muted">Loading articles…</p> : articles.length ? (
        <div className="space-y-3">
          {articles.map((article) => (
            <article key={article.id} className={CARD}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-semibold text-muted">{article.category} · {article.published ? "Published" : "Draft"}</p><h2 className="mt-1 font-bold text-ink">{article.q}</h2><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{article.a}</p></div>
                <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(article)}>Edit</Button><Button size="sm" variant="outline" onClick={() => remove(article)}>Delete</Button></div>
              </div>
            </article>
          ))}
          {nextOffset != null && <Button variant="soft" onClick={loadMore}>Load more</Button>}
        </div>
      ) : <p className={`${CARD} text-muted`}>No help articles yet. Add one as a draft, then publish it when ready.</p>}
    </>
  );
}
