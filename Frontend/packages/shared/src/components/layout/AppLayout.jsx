"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import CreateAdSheet from "../create/CreateAdSheet";
import { ToastProvider, useToast } from "../../context/ToastContext";

/** The one thing screens need from the shell: a way to open the create sheet. */
const ShellContext = createContext({ openPost: () => {} });
export const useShell = () => useContext(ShellContext);

/**
 * Below lg: a phone shell (status bar, screen, bottom nav).
 * At lg and up: a sidebar app with the same screens laid out wide.
 */
function Shell({ children }) {
  const toast = useToast();
  const [postOpen, setPostOpen] = useState(false);
  const main = useRef(null);
  const pathname = usePathname();

  // Each screen scrolls its own container, so a route change must reset it.
  useEffect(() => {
    main.current?.querySelector("[data-scroll]")?.scrollTo({ top: 0 });
  }, [pathname]);
  const openPost = () => setPostOpen(true);
  const togglePost = () => setPostOpen((v) => !v);

  function handlePublish(values) {
    console.log("Publish ad", values);
    setPostOpen(false);
    toast("Ad submitted — we'll review it shortly");
  }

  return (
    <ShellContext.Provider value={{ openPost }}>
      <div className="relative flex h-dvh w-full justify-center lg:justify-start">
        <Sidebar onPostAd={openPost} />

        <div className="relative flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-canvas shadow-xl lg:max-w-none lg:shadow-none">
          <main ref={main} className="relative flex min-h-0 flex-1 flex-col">
            {children}

            <CreateAdSheet
              open={postOpen}
              onClose={() => setPostOpen(false)}
              onPublish={handlePublish}
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
