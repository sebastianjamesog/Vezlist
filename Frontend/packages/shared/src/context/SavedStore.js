"use client";

import { createContext, useContext } from "react";

export const SavedContext = createContext(null);

export function useSaved() {
  const context = useContext(SavedContext);
  if (!context) {
    throw new Error("useSaved must be used inside <SavedProvider>");
  }
  return context;
}
