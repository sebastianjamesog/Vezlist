"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useNavigate } from "../../lib/nav";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import CreateAdSheet from "../create/CreateAdSheet";
import StoryComposer from "../create/StoryComposer";
import CreateMenu, { HAS_CREATE_MENU } from "../create/CreateMenu";
import { ToastProvider, useToast } from "../../context/ToastContext";
import { useAccount } from "../../context/AccountContext";
import { useListings } from "../../context/ListingsContext";

/**
 * What screens need from the shell: a way to open the create sheet, and a way
 * to open the story composer. Both are hosted here rather than by the screens
 * that offer them, because each has two entrances — the plus in the tab bar
 * and a row on another screen — and a sheet mounted twice is a sheet that can
 * be open twice.
 */
const ShellContext = createContext({ openPost: () => {}, openStory: () => {} });
export const useShell = () => useContext(ShellContext);

/**
 * Below lg: a phone shell (status bar, screen, bottom nav).
 * At lg and up: a sidebar app with the same screens laid out wide.
 *
 * Every route carries the tab bar, launcher included — it is how you get back,
 * and a screen without it reads as a dead end.
 */
function Shell({ children, navPreset }) {
  const toast = useToast();
  const { can, signedIn } = useAccount();
  const { publish } = useListings();
  const [menuOpen, setMenuOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const main = useRef(null);
  const pathname = usePathname();
  const navigate = useNavigate();

  // Each screen scrolls its own container, so a route change must reset it.
  useEffect(() => {
    main.current?.querySelector("[data-scroll]")?.scrollTo({ top: 0 });
  }, [pathname]);

  /**
   * Is there an account behind this tap, and if not, where does it go?
   *
   * Both create entrances need the same first question, and neither of them
   * may answer it by doing nothing: the plus is now drawn for everybody,
   * signed-out visitors included, and a button that is offered and then
   * silently ignored is worse than the button that used to be missing. So a
   * guest is sent to the form with the page they were on attached as `next=`,
   * exactly the way `RequireAuth` and the promote hook send one, and lands back
   * here rather than on whatever the form's own default happens to be. The
   * toast goes with the navigation because the screen is about to change under
   * them and the change on its own does not say why.
   */
  function requireSession() {
    if (signedIn) return true;
    toast("Sign in to post — we'll bring you back here");
    navigate(`/login?next=${encodeURIComponent(pathname)}`);
    return false;
  }

  /**
   * The one door into the create sheet, and therefore the one place the refusal
   * belongs.
   *
   * The bars offer Create to everyone now, so this gate carries the whole
   * conversation rather than half of it. There are two ways to be turned away
   * and they are not the same problem: a guest has no account yet and is sent
   * to make or use one, while somebody signed in on a browsing account has an
   * account that simply is not the kind that posts, and is pointed at the
   * Profile row that changes that. Both get a sentence naming the way in,
   * because whoever arrives here wanted to post and "no" on its own leaves them
   * nowhere to go.
   *
   * It stays the single entrance for a second reason: the ad page's Post
   * button, the empty state on the creator dashboard and the marketplace feed's
   * post action all hand `openPost` out through `useShell`, and teaching each
   * of those call sites the capability would be three copies of this to keep in
   * step. They ask for the wizard directly and get the wizard — the chooser is
   * what the plus opens, not what "post an ad" means.
   */
  function openPost() {
    if (!requireSession()) return;
    if (!can("ad.create")) {
      toast("Switch to an ads creator account in Profile to post an ad");
      return;
    }
    setPostOpen(true);
  }

  /**
   * The story composer, gated the same way `openPost` is and for the same
   * reason: the Profile row and the create chooser both call it, so the
   * capability check belongs here rather than duplicated at each entrance.
   */
  function openStory() {
    if (!requireSession()) return;
    if (!can("status.post")) {
      toast("Switch to an ads creator account to post a story");
      return;
    }
    setStoryOpen(true);
  }

  /**
   * What the plus itself opens.
   *
   * On personals that is the chooser, because the plus means three things
   * there; on the marketplace `HAS_CREATE_MENU` is false and it means one, so
   * it goes straight through to the wizard and nobody pays a tap to be shown a
   * menu with a single row. The session check happens before either branch: a
   * guest should not be handed a list of things they cannot start.
   */
  function openCreate() {
    if (!requireSession()) return;
    if (!HAS_CREATE_MENU) return openPost();
    setMenuOpen(true);
  }

  // Closing is not a capability, so it never goes through the gate — a sheet
  // left open by a role change must still be dismissable by the same button.
  // The plus wears an X while either layer is up, and dismisses whichever it
  // is; the chooser closes itself on the way into the wizard, so only ever one
  // of the two is actually open.
  const createOpen = menuOpen || postOpen || storyOpen;
  const toggleCreate = () => {
    if (!createOpen) return openCreate();
    setMenuOpen(false);
    setPostOpen(false);
    setStoryOpen(false);
  };

  /**
   * Where the four steps actually go.
   *
   * This used to be a `console.log` and a toast that claimed the ad had been
   * submitted — the one flow in the app that wrote nothing at all. It writes to
   * the listings store now, so the ad is in My Ads under "In review" before the
   * toast says so, and it is still there after a reload.
   *
   * `publish` is started before the sheet is closed and awaited after, and that
   * order is load-bearing rather than stylistic: the sheet revokes its photo
   * object URLs the instant this function returns to it, so the reads have to
   * be under way by then. See `inlinePhotos` in ListingsContext.
   */
  async function handlePublish(values) {
    const written = publish(values);
    setPostOpen(false);
    await written;
    toast("Ad submitted — it's in My Ads under In review");
  }

  return (
    <ShellContext.Provider value={{ openPost, openStory }}>
      <div className="relative flex h-dvh w-full justify-center lg:justify-start">
        {/* First focusable thing on every route. Off-screen until focused, so a
            mouse or touch user never sees it — but a keyboard user tabbing in
            from the address bar gets to skip the full Sidebar (desktop) or tab
            bar rather than tabbing through it on every single navigation. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2.5 focus:text-[14px] focus:font-bold focus:text-ink focus:shadow-lift"
        >
          Skip to content
        </a>

        <Sidebar
          onCreate={openCreate}
          onPostAd={openPost}
          navPreset={navPreset}
        />

        <div className="relative flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-canvas shadow-xl lg:max-w-none lg:shadow-none">
          <main
            id="main-content"
            ref={main}
            tabIndex={-1}
            className="relative flex min-h-0 flex-1 flex-col focus:outline-none"
          >
            {children}

            <Footer />

            <CreateMenu
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              onPostAd={openPost}
              onAddStory={openStory}
            />

            {/* Mounted only while open, unlike the two sheets above it: the
                composer holds a draft, and a draft that survives being
                closed is a draft that reopens holding somebody's last
                story. Unmounting is the reset. */}
            {storyOpen && <StoryComposer onClose={() => setStoryOpen(false)} />}

            <CreateAdSheet
              open={postOpen}
              onClose={() => setPostOpen(false)}
              onPublish={handlePublish}
            />
          </main>

          {/* The story composer is a full-screen takeover — the picture runs
              edge to edge and its own controls float on top — so the tab bar
              comes off the screen entirely while it is open, the way it does
              in every story editor. The two sheets above it stay put: they
              stop short of the bar with `pb-nav` instead, because they are
              sheets over a screen rather than a screen of their own. Closing
              is the composer's own X, so nothing is stranded. */}
          {!storyOpen && (
            <BottomNav
              onCreate={toggleCreate}
              createOpen={createOpen}
              navPreset={navPreset}
            />
          )}
        </div>
      </div>
    </ShellContext.Provider>
  );
}

export default function AppLayout({ children, navPreset }) {
  return (
    <ToastProvider>
      <Shell navPreset={navPreset}>{children}</Shell>
    </ToastProvider>
  );
}
