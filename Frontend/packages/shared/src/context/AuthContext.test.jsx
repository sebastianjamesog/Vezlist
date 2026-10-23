import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";
import * as api from "../lib/api/auth";
vi.mock("../lib/api/auth", () => ({
  me: vi.fn(),
  changeAccountType: vi.fn(),
  logout: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
}));
const creator = { id: "account", name: "Creator", accountType: "CREATOR" };
beforeEach(() => {
  vi.clearAllMocks();
  api.me.mockResolvedValue(creator);
});

test("backend account type overrides a stale browsing cookie", async () => {
  document.cookie = "vezlist_role=%22user%22; path=/";
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.role).toBe("creator");
});

test("role changes only after backend confirmation; errors preserve the current role", async () => {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.ready).toBe(true));
  api.changeAccountType.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => {
    await expect(result.current.setRole("user")).rejects.toThrow("Offline");
  });
  expect(result.current.role).toBe("creator");
  api.changeAccountType.mockResolvedValueOnce({
    ...creator,
    accountType: "BROWSING",
  });
  await act(async () => {
    await result.current.setRole("user");
  });
  expect(api.changeAccountType).toHaveBeenLastCalledWith("BROWSING");
  expect(result.current.role).toBe("user");
});


test("a late session lookup cannot replace a newly signed-in account", async () => {
  let resolve;
  api.me.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  api.login.mockResolvedValue(creator);
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await act(async () => result.current.signIn({ email: "creator@test.invalid", password: "password" }));
  await act(async () => resolve(null));
  expect(result.current.user.id).toBe(creator.id);
});

test("failed logout preserves the session so it can be retried", async () => {
  const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(result.current.ready).toBe(true));
  api.logout.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => { await expect(result.current.signOut()).rejects.toThrow("Offline"); });
  expect(result.current.signedIn).toBe(true);
  api.logout.mockResolvedValueOnce();
  await act(async () => result.current.signOut());
  expect(result.current.signedIn).toBe(false);
});
