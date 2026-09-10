"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import CreateAdSheet from "../create/CreateAdSheet";
import { ToastProvider, useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { SITE } from "../../lib/sites";
import { useNavigate } from "../../lib/nav";
import { listingPayload } from "../../lib/listings";
import { syncListingMedia } from "../../lib/media";

/** The one thing screens need from the shell: a way to open the create sheet. */
const ShellContext = createContext({ openPost: () => {}, editPost: () => {} });
export const useShell = () => useContext(ShellContext);

/**
 * Below lg: a phone shell (status bar, screen, bottom nav).
 * At lg and up: a sidebar app with the same screens laid out wide.
 */
function Shell({ children }) {
  const toast = useToast();
  const { ready, signedIn } = useAuth();
  const navigate = useNavigate();
  const [postOpen, setPostOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const main = useRef(null);
  const pathname = usePathname();

  // Each screen scrolls its own container, so a route change must reset it.
  useEffect(() => {
    main.current?.querySelector("[data-scroll]")?.scrollTo({ top: 0 });
  }, [pathname]);
  const openPost = () => {
    if (!ready) return toast("Checking your session…");
    if (!signedIn) return navigate("/login");
    setEditing(null);
    setPostOpen(true);
  };
  const editPost = (listing) => {
    setEditing(listing);
    setPostOpen(true);
  };
  const togglePost = () => (postOpen ? setPostOpen(false) : openPost());

  async function handlePublish(values, requestKey, onProgress) {
    onProgress("Saving listing...");
    const payload = listingPayload(values, SITE);
    const listing = values.listingId
      ? await api(`/listings/${values.listingId}`, {
          method: "PATCH",
          body: payload,
        })
      : await api("/listings", {
          method: "POST",
          headers: { "Idempotency-Key": `${requestKey}:create` },
          body: payload,
        });
    await syncListingMedia(
      listing.id,
      values.images,
      values.removedMediaIds,
      onProgress,
    );
    onProgress("Submitting for review...");
    await api(`/listings/${listing.id}/submit`, {
      method: "POST",
      headers: { "Idempotency-Key": `${requestKey}:submit` },
    });
    setPostOpen(false);
    setEditing(null);
    window.dispatchEvent(new Event("vezlist:listings-changed"));
    toast("Ad submitted — we'll review it shortly");
  }

  return (
    <ShellContext.Provider value={{ openPost, editPost }}>
      <div className="relative flex h-dvh w-full justify-center lg:justify-start">
        <Sidebar onPostAd={openPost} />

        <div className="relative flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-canvas shadow-xl lg:max-w-none lg:shadow-none">
          <main ref={main} className="relative flex min-h-0 flex-1 flex-col">
            {children}

            <CreateAdSheet
              key={editing?.id ?? "new-listing"}
              open={postOpen}
              onClose={() => setPostOpen(false)}
              onPublish={handlePublish}
              initialListing={editing}
            />
          </main>

          <BottomNav onPostAd={togglePost} createOpen={postOpen} />
        </div>
      </div>
    </ShellContext.Provider>
  );
}

export default function AppLayout({ children }) {
  return (
    <ToastProvider>
      <Shell>{children}</Shell>
    </ToastProvider>
  );
}
