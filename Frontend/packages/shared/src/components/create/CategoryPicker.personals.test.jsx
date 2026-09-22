import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE = "personals";
});
vi.mock("../../lib/api/catalog.js", () => ({ getCategories: vi.fn() }));

const { getCategories } = await import("../../lib/api/catalog.js");
const { EMPTY_DRAFT, validateStep, toListingWriteRequest } =
  await import("../../lib/adDraft.js");
const { default: StepDetails } = await import("./StepDetails.jsx");

function Harness() {
  const [draft, setDraft] = useState({
    ...EMPTY_DRAFT,
    category: "",
    categoryId: "",
    title: "A personal introduction",
    business: "Test poster",
    description: "A longer introduction describing the person posting this ad.",
  });
  return (
    <>
      <StepDetails
        draft={draft}
        errors={{}}
        onPatch={(patch) => setDraft((previous) => ({ ...previous, ...patch }))}
      />
      <span data-testid="draft">{JSON.stringify(draft)}</span>
    </>
  );
}

beforeEach(() => {
  getCategories.mockReset().mockResolvedValue([
    {
      id: "personal-new",
      label: "New personal connections",
      icon: "heart",
      primary: true,
    },
  ]);
});

test.each([
  "Personals",
  "New personal connections",
  "Renamed local companions",
])(
  "Personals fetches its own backend category %s and preserves About you fields",
  async (label) => {
    getCategories.mockResolvedValue([
      { id: "personal-new", label, icon: "heart", primary: true },
    ]);
    render(<Harness />);
    const button = await screen.findByRole("button", {
      name: label,
    });
    expect(getCategories).toHaveBeenCalledWith("PERSONALS");
    fireEvent.click(button);
    expect(JSON.parse(screen.getByTestId("draft").textContent)).toMatchObject({
      categoryId: "personal-new",
      category: label,
    });
    expect(screen.getByText("About you")).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Age" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dating" })).toBe(null);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Age" }), {
      target: { value: "17" },
    });
    expect(
      validateStep(
        "details",
        JSON.parse(screen.getByTestId("draft").textContent),
      ).age,
    ).toBeTruthy();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Age" }), {
      target: { value: "28" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Height" }), {
      target: { value: "165 cm" },
    });
    const selected = JSON.parse(screen.getByTestId("draft").textContent);
    expect(validateStep("details", selected)).toEqual({});
    expect(
      toListingWriteRequest(selected, { site: "PERSONALS" }),
    ).toMatchObject({
      site: "PERSONALS",
      categoryId: "personal-new",
      attributes: { age: "28", height: "165 cm" },
    });
  },
);

test("Personals retains About you while its category catalog is empty", async () => {
  getCategories.mockResolvedValue([]);
  render(<Harness />);
  await screen.findByText("No categories are available for this board yet.");
  expect(screen.getByText("About you")).toBeTruthy();
});
