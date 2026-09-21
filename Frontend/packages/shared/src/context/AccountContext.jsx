"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { usePersistedObject } from "../lib/persisted";
import { cookieStore } from "../lib/cookieStore";
import { useAuth } from "./AuthContext";
import { ACCOUNT_ROLES, can as roleCan } from "../lib/accountRoles";
import {
  affords,
  normaliseWallet,
  seedWallet,
  spend,
  topUp,
} from "../lib/wallet";

/**
 * One hook for "what may this account do, and what can it afford".
 *
 * Role lives on the session (AuthContext owns identity); the wallet lives here.
 * Screens import this one and not both, because every question they actually
 * ask — should this button exist, and will this spend go through — needs both
 * halves of the answer.
 *
 * The wallet rides in a cookie on the parent domain for the same reason the
 * session does: a balance that only exists on one of the two origins is a
 * balance you spend twice. That is why the ledger is capped (see wallet.js) —
 * cookies are small, and a transaction log is not what a cookie is for. On a
 * real backend the balance is a column and this context is a query cache.
 */
const AccountContext = createContext(null);

const KEY = "vezlist_wallet";

export function AccountProvider({ children }) {
  const { role, setRole, signedIn } = useAuth();
  const [stored, setStored, ready, clearWallet] = usePersistedObject(
    KEY,
    cookieStore,
  );

  /*
   * There is no card list here any more, and that is the point.
   *
   * It used to hold one so the wallet and the Payment methods screen could not
   * disagree about which card a pack was billed to. Paybis settled that
   * argument by taking the payment itself: it collects the card, holds the
   * token and does the KYC, and nothing on this side bills anything. A list of
   * card numbers with no reader is not a feature, it is card data waiting to
   * leak — so the screen went, and the state behind it with it.
   */

  // Nothing stored yet is the seeded wallet, not an empty one: the screens are
  // built against an account that has been around, and a demo that opens on
  // zero credits cannot show what spending them looks like.
  const wallet = useMemo(
    () => (stored ? normaliseWallet(stored) : seedWallet()),
    [stored],
  );

  const can = useCallback((capability) => roleCan(role, capability), [role]);

  /**
   * Buy a pack. Always allowed — a browsing account can hold a balance, it just
   * has nothing to spend it on until it switches — and always logged.
   */
  const addCredits = useCallback(
    ({ credits, label, price }) => {
      const next = topUp(wallet, { credits, label, price });
      if (next === wallet) return null;
      setStored(next);
      return next.balance;
    },
    [wallet, setStored],
  );

  /**
   * Spend on a promotion. Returns `{ ok, balance, reason }` rather than
   * throwing, because every call site has a toast to write either way.
   */
  const spendCredits = useCallback(
    ({ credits, label }) => {
      if (!roleCan(role, "wallet.spend")) {
        return { ok: false, balance: wallet.balance, reason: "role" };
      }
      if (!affords(wallet, credits)) {
        return { ok: false, balance: wallet.balance, reason: "funds" };
      }
      const next = spend(wallet, { credits, label });
      if (next === wallet) {
        return { ok: false, balance: wallet.balance, reason: "funds" };
      }
      setStored(next);
      return { ok: true, balance: next.balance };
    },
    [role, wallet, setStored],
  );

  const value = useMemo(
    () => ({
      role,
      roleMeta: ACCOUNT_ROLES[role],
      setRole,
      isCreator: role === "creator",
      signedIn,
      can,
      ready,
      credits: wallet.balance,
      ledger: wallet.ledger,
      affords: (credits) => affords(wallet, credits),
      addCredits,
      spendCredits,
      // Deleting the account wipes the balance and ledger along with it —
      // `clearWallet` drops the stored cookie, so the next read reseeds from
      // scratch the way a wallet nobody has ever spent from does.
      resetWallet: clearWallet,
    }),
    [
      role,
      setRole,
      signedIn,
      can,
      ready,
      wallet,
      addCredits,
      spendCredits,
      clearWallet,
    ],
  );

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>");
  return ctx;
}
