import { expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE = "personals";
});
const { api, SITE_SCOPE } = await import("./client.js");
const { publishDraft } = await import("./listings.js");
const { EMPTY_DRAFT } = await import("../adDraft.js");

test.each([false, true])(
  "Personals submits requestVerification=%s with exact category/location IDs and personal attributes",
  async (requestVerification) => {
    const post = vi
      .spyOn(api, "post")
      .mockImplementation(async (path, body) =>
        path.endsWith("/submit")
          ? {
              id: "personal-ad",
              status: body.requestVerification ? "PENDING_REVIEW" : "ACTIVE",
              verificationRequested: body.requestVerification,
            }
          : { id: "personal-ad", status: "DRAFT" },
      );
    const result = await publishDraft(
      {
        ...EMPTY_DRAFT,
        title: "A personal introduction",
        business: "A local poster",
        description: "A new introduction with clear information.",
        category: "New connections",
        categoryId: "personals-new",
        location: "Richmond",
        locationId: "on-richmond",
        provinceId: "on",
        age: "28",
        height: "165 cm",
      },
      { requestVerification },
    );
    expect(SITE_SCOPE).toBe("PERSONALS");
    expect(post).toHaveBeenCalledWith(
      "/api/v1/listings",
      expect.objectContaining({
        site: "PERSONALS",
        categoryId: "personals-new",
        locationId: "on-richmond",
        provinceId: "on",
        attributes: { age: "28", height: "165 cm" },
      }),
      expect.any(Object),
    );
    expect(post).toHaveBeenLastCalledWith(
      "/api/v1/listings/personal-ad/submit",
      { requestVerification },
      expect.any(Object),
    );
    expect(result.status).toBe(
      requestVerification ? "PENDING_REVIEW" : "ACTIVE",
    );
  },
);
