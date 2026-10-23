import { beforeEach, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext.jsx";
import * as api from "../lib/api/auth.js";
vi.mock("../lib/api/auth.js", () => ({
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));
const admin = {
  id: "admin",
  name: "Admin",
  email: "admin@example.test",
  roles: ["ADMIN"],
};
beforeEach(() => vi.resetAllMocks());
test("a stale initial session request cannot overwrite successful login", async () => {
  let finishMe;
  api.me.mockReturnValue(
    new Promise((resolve) => {
      finishMe = resolve;
    }),
  );
  api.login.mockResolvedValue(admin);
  const { result } = renderHook(() => useAdminAuth(), {
    wrapper: AdminAuthProvider,
  });
  await act(async () => {
    await result.current.signIn({ email: admin.email, password: "test" });
  });
  expect(result.current.signedIn).toBe(true);
  await act(async () => {
    finishMe(null);
  });
  expect(result.current.signedIn).toBe(true);
});
test("logout failure keeps the account visible and successful logout clears it", async () => {
  api.me.mockResolvedValue(admin);
  api.logout
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValueOnce();
  const { result } = renderHook(() => useAdminAuth(), {
    wrapper: AdminAuthProvider,
  });
  await waitFor(() => expect(result.current.signedIn).toBe(true));
  await act(async () => {
    await expect(result.current.signOut()).rejects.toThrow("Offline");
  });
  expect(result.current.signedIn).toBe(true);
  await act(async () => {
    await result.current.signOut();
  });
  expect(result.current.signedIn).toBe(false);
});

test("server console denial explains the missing role without logging out another session", async () => {
  api.me.mockResolvedValue(null);
  api.login.mockRejectedValue({ status: 403, code: "CONSOLE_ACCESS_DENIED" });
  const { result } = renderHook(() => useAdminAuth(), {
    wrapper: AdminAuthProvider,
  });
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(async () => {
    await expect(
      result.current.signIn({ email: "user@example.test", password: "test" }),
    ).rejects.toThrow("doesn't have console access");
  });
  expect(api.logout).not.toHaveBeenCalled();
  expect(result.current.signedIn).toBe(false);
});
