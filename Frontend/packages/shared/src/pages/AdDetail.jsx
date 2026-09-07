"use client";

import { useState } from "react";
import Link from "next/link";
import { useNavigate } from "../lib/nav";
import { useParams } from "next/navigation";
import {
  Heart,
  Images,
  Mail,
  MapPin,
  Phone,
  Share2,
  ShieldCheck,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { useShell } from "../components/layout/AppLayout";
import PageBody from "../components/layout/PageBody";
import Icon from "../components/ui/Icon";
import Button from "../components/ui/Button";
import { useSaved } from "../context/SavedContext";
import { useToast } from "../context/ToastContext";
import { ads } from "../data/mock";
import { maskContact } from "../lib/format";
import { tones } from "../lib/tones";
import { FEED_PATH } from "../lib/sites";

const CARD = "rounded-card bg-surface p-4 shadow-card lg:p-6";

function ContactRow({ icon: RowIcon, value, kind }) {
  const [shown, setShown] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-card bg-surface p-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <RowIcon className="size-[18px]" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
        {shown ? value : maskContact(value, kind)}
      </span>
      {!shown && (
        <button
          onClick={() => setShown(true)}
          className="shrink-0 rounded-full bg-canvas px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide text-ink transition-colors hover:bg-line"
        >
          Show
        </button>
      )}
    </div>
  );
}

export default function AdDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { openPost } = useShell();
  const { isSaved, toggle } = useSaved();
  const toast = useToast();
  const ad = ads[id];
  const [active, setActive] = useState(0);
  const saved = isSaved(id);

  function toggleSaved() {
    toggle(id);
    toast(saved ? "Removed from saved" : "Saved — find it in your profile");
  }

  if (!ad) {
    return (
      <>
        <TopBar
          variant="detail"
          onBack={() => navigate(-1)}
          onPostAd={openPost}
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[18px] font-bold text-ink">
            This ad is no longer available.
          </p>
          <Button to={FEED_PATH} variant="soft">
            Back to listings
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        variant="detail"
        title={ad.title}
        onBack={() => navigate(-1)}
        onPostAd={openPost}
      />

      <PageBody className="px-4 pb-6 lg:px-8 lg:py-8">
        {/*
          Mobile stacks in the order the mockup shows: gallery, summary,
          description, contact. Desktop keeps gallery + description in the left
          column and summary + contact in the right, via explicit grid placement
          so neither layout has to compromise the other's order.
        */}
        <div className="lg:grid lg:grid-cols-[1.35fr_1fr] lg:items-start lg:gap-x-8 lg:gap-y-6">
          {/* 1 — gallery */}
          <section className="lg:col-start-1 lg:row-start-1">
            <div className="relative overflow-hidden rounded-card shadow-card">
              <img
                data-media
                src={ad.photos[active]}
                alt={ad.title}
                className="h-64 w-full object-cover lg:h-[440px]"
              />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/60 to-transparent" />

              <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-bold text-white backdrop-blur-sm">
                <Images className="size-3.5" />
                {ad.photoCount} photos
              </span>

              <div className="absolute right-3 top-3 flex gap-2">
                <button
                  onClick={() => toast("Link copied")}
                  aria-label="Share ad"
                  className="glass grid size-10 place-items-center rounded-full text-ink transition-transform hover:scale-105 active:scale-95"
                >
                  <Share2 className="size-[18px]" strokeWidth={2.2} />
                </button>
                <button
                  onClick={toggleSaved}
                  aria-label={saved ? "Remove from saved" : "Save ad"}
                  aria-pressed={saved}
                  className="glass grid size-10 place-items-center rounded-full transition-transform hover:scale-105 active:scale-95"
                >
                  <Heart
                    className={`size-[18px] ${saved ? "fill-red-500 text-red-500" : "text-ink"}`}
                    strokeWidth={2.2}
                  />
                </button>
              </div>
            </div>

            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
              {ad.photos.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setActive(i)}
                  aria-label={`Photo ${i + 1}`}
                  aria-current={i === active}
                  className={`size-16 shrink-0 overflow-hidden rounded-2xl transition-all lg:size-20 ${
                    i === active
                      ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <img
                    data-media
                    src={src}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              ))}
            </div>
          </section>

          {/* 2 — title, price, overview */}
          <section
            className={`mt-4 lg:col-start-2 lg:row-start-1 lg:mt-0 ${CARD}`}
          >
            <h1 className="text-[24px] font-extrabold leading-tight text-ink lg:text-[26px]">
              {ad.title}
            </h1>

            <p className="mt-2 text-[30px] font-extrabold tabular-nums text-brand">
              ${ad.price.toLocaleString()}
            </p>

            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              <span className="flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 font-semibold">
                <MapPin className="size-3.5" />
                {ad.location}
              </span>
              <span>{ad.postedLabel}</span>
            </p>

            <h2 className="mb-3 mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              {ad.overviewTitle}
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {ad.specs.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-3 rounded-2xl bg-canvas p-3"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-xl ${tones[s.tone]}`}
                  >
                    <Icon
                      name={s.icon}
                      className="size-[18px]"
                      strokeWidth={2.5}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-muted">
                      {s.label}
                    </span>
                    <span className="block truncate text-[14px] font-bold text-ink">
                      {s.value}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 3 — description */}
          <section
            className={`mt-4 lg:col-start-1 lg:row-start-2 lg:mt-0 ${CARD}`}
          >
            <h2 className="text-[18px] font-extrabold text-ink">Description</h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink/75">
              {ad.description.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </section>

          {/* 4 — contact + seller */}
          <div className="lg:col-start-2 lg:row-start-2 lg:space-y-6">
            <section className="brand-gradient mt-4 space-y-2.5 rounded-card p-4 lg:mt-0 lg:p-6">
              <p className="text-center text-[12px] font-medium text-white/80">
                Say you saw my ad on
              </p>
              <p className="text-center text-[20px] font-extrabold text-white">
                Vezlist.cc
              </p>
              <ContactRow icon={Phone} value={ad.phone} kind="phone" />
              <ContactRow icon={Mail} value={ad.email} kind="email" />
            </section>

            <section className={`mt-4 lg:mt-0 ${CARD}`}>
              <h2 className="text-[18px] font-extrabold text-ink">Seller</h2>

              <Link
                href={`/seller/${ad.sellerId}`}
                className="group mt-3 flex items-center gap-3 rounded-2xl bg-canvas p-3 transition-colors hover:bg-brand-soft"
              >
                <span className="relative shrink-0">
                  <img
                    src={ad.seller.avatar}
                    alt={ad.seller.name}
                    className="size-12 rounded-2xl object-cover"
                  />
                  {ad.seller.online && (
                    <span className="absolute -bottom-1 -right-1 size-3.5 rounded-full border-2 border-canvas bg-emerald-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold text-ink group-hover:text-brand">
                    {ad.seller.name}
                  </span>
                  <span className="block text-[12px] text-muted">
                    Member since {ad.seller.since} · View profile
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                  <ShieldCheck className="size-3.5" />
                  {ad.seller.badge}
                </span>
              </Link>
            </section>
          </div>
        </div>
      </PageBody>

      {/* Mobile keeps the two things you actually came to do pinned to the bottom. */}
      <div className="glass shrink-0 border-t border-line px-4 pb-nav pt-3 lg:hidden">
        <div className="flex gap-2.5">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={toggleSaved}
            aria-pressed={saved}
          >
            <Heart
              className={`size-5 ${saved ? "fill-red-500 text-red-500" : ""}`}
            />
            {saved ? "Saved" : "Save"}
          </Button>
          <a
            href={`mailto:${ad.email}?subject=${encodeURIComponent(ad.title)}`}
            className="brand-gradient flex h-[52px] flex-[1.6] items-center justify-center gap-2 rounded-2xl text-[16px] font-bold text-on-brand shadow-pop transition-transform active:scale-[0.98]"
          >
            <Mail className="size-5" />
            Contact seller
          </a>
        </div>
      </div>
    </>
  );
}
