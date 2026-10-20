import { api } from "./client.js";

export const FEATURED_FEEDS = {
  available: "AVAILABLE_NOW",
  new: "NEW_TODAY",
  trending: "TRENDING",
};

export function featuredListings(feed, { all = false, signal } = {}) {
  return api.get("/api/v1/personals/featured", { feed, ...(all ? { all: true } : {}) }, { signal });
}
