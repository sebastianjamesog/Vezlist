"use client";

import { useCallback } from "react";
import { useNavigate } from "./nav";
import { useAccount } from "../context/AccountContext";
import { useToast } from "../context/ToastContext";

/**
 * What the "Boost Now" tile on either feed actually does.
 *
 * Both boards carry the same promo card and both used to answer it with
 * `toast("Boosting an ad is not wired up yet")`. Promoting is now a real
 * transaction, but it is not one you can start from a feed: it needs an ad to
 * spend the credits on, and the ad is the thing the feed does not know. So the
 * tile's job is to get you to the screen that does know, by the shortest route
 * that makes sense for who you are.
 *
 * It lives here rather than in `FeedRails` because the rails are a shape and
 * the items are a prop — the whole reason two feeds can share them. A hook is
 * the seam: both screens call it, neither one learns the routing.
 */
export function usePromote() {
  const navigate = useNavigate();
  const { signedIn, can } = useAccount();
  const toast = useToast();

  return useCallback(() => {
    // A guest has no ads to promote and no session to hang them on. Send them
    // to the form with the destination attached, the way RequireAuth does.
    if (!signedIn) {
      navigate(`/login?next=${encodeURIComponent("/profile/ads")}`);
      return;
    }
    if (!can("ad.promote")) {
      toast("Switch to an ads creator account to promote an ad");
      navigate("/profile/settings");
      return;
    }
    // My Ads is where the boost tiers and the balance live; picking which ad
    // is the first question, and this is the screen that asks it.
    navigate("/profile/ads");
  }, [signedIn, can, navigate, toast]);
}
