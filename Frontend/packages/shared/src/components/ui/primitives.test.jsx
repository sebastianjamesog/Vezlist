import { describe, expect, test, vi } from "vitest";
import {
  render,
  screen,
  userEvent,
  within,
} from "../../../../../testing/render.jsx";
import Accordion from "./Accordion";
import BottomSheet from "./BottomSheet";
import Button from "./Button";
import ChoiceRow from "./ChoiceRow";
import EmptyState from "./EmptyState";
import Icon from "./Icon";
import SearchBar from "./SearchBar";
import SegmentedControl from "./SegmentedControl";

/**
 * The small primitives, one file.
 *
 * `Modal`, `ConfirmDialog` and `FilterSheet` earn files of their own because
 * each carries real behaviour. These carry one decision apiece — which element
 * a `Button` becomes, what an unknown icon name falls back to, whether the
 * accordion is single-open — and a file per decision would be seven files of
 * imports around one assertion.
 */

describe("Button", () => {
  test("is a button by default and a link when given a destination", () => {
    const { unmount } = render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    unmount();

    render(<Button to="/profile/wallet">Top up</Button>);
    const link = screen.getByRole("link", { name: "Top up" });
    expect(link.getAttribute("href")).toBe("/profile/wallet");
  });

  test("disabled does not fire", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Spend
      </Button>,
    );
    await user.click(screen.getByRole("button", { name: "Spend" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("an unknown variant would render an undefined class, so every named one is checked", () => {
    for (const variant of ["primary", "soft", "outline", "ghost", "danger"]) {
      const { unmount } = render(<Button variant={variant}>Go</Button>);
      expect(screen.getByRole("button").className).not.toMatch(/undefined/);
      unmount();
    }
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "listings", label: "Listings" },
    { value: "people", label: "People" },
  ];

  test("marks the current option pressed, and reports the other when clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        options={options}
        value="listings"
        onChange={onChange}
        label="Feed"
      />,
    );

    const group = screen.getByRole("group", { name: "Feed" });
    expect(
      within(group)
        .getByRole("button", { name: "Listings" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    await user.click(within(group).getByRole("button", { name: "People" }));
    expect(onChange).toHaveBeenCalledWith("people");
  });

  test("it is a group of toggles, not tabs — there are no panels behind it", () => {
    render(
      <SegmentedControl
        options={options}
        value="people"
        onChange={() => {}}
        label="Feed"
      />,
    );
    expect(screen.queryByRole("tab")).toBe(null);
    expect(screen.queryByRole("tabpanel")).toBe(null);
  });
});

describe("Accordion", () => {
  const items = [
    { q: "How do credits work?", a: "You buy them and spend them on boosts." },
    { q: "Can I edit a live ad?", a: "Yes, it goes back through review." },
  ];

  test("opens one at a time and closes on a second press", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    expect(screen.queryByText(items[0].a)).toBe(null);

    await user.click(screen.getByRole("button", { name: items[0].q }));
    expect(screen.getByText(items[0].a)).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: items[0].q })
        .getAttribute("aria-expanded"),
    ).toBe("true");

    // Opening the second closes the first.
    await user.click(screen.getByRole("button", { name: items[1].q }));
    expect(screen.getByText(items[1].a)).toBeTruthy();
    expect(screen.queryByText(items[0].a)).toBe(null);

    // And pressing an open one closes it rather than doing nothing.
    await user.click(screen.getByRole("button", { name: items[1].q }));
    expect(screen.queryByText(items[1].a)).toBe(null);
  });
});

describe("SearchBar", () => {
  test("has a name that survives having a value typed into it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchBar value="" onChange={onChange} label="Search ads" />);

    const box = screen.getByRole("searchbox", { name: "Search ads" });
    await user.type(box, "oak");
    // Controlled, so each keystroke is reported rather than accumulated here.
    expect(onChange).toHaveBeenCalledWith("o");
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});

describe("ChoiceRow", () => {
  test("carries the role its type implies and its checked state", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <ChoiceRow type="radio" checked onChange={onChange}>
        Newest first
      </ChoiceRow>,
    );
    const radio = screen.getByRole("radio", { name: "Newest first" });
    expect(radio.getAttribute("aria-checked")).toBe("true");
    await user.click(radio);
    expect(onChange).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <ChoiceRow type="checkbox" checked={false} onChange={() => {}} hint="12">
        Verified only
      </ChoiceRow>,
    );
    const box = screen.getByRole("checkbox", { name: /Verified only/ });
    expect(box.getAttribute("aria-checked")).toBe("false");
    expect(box.textContent).toMatch(/12/);
  });
});

describe("EmptyState", () => {
  test("renders its title, optional body and optional action", () => {
    const { unmount } = render(<EmptyState title="No saved ads" />);
    expect(screen.getByText("No saved ads")).toBeTruthy();
    unmount();

    render(
      <EmptyState
        icon="Megaphone"
        title="No active ads"
        body="Ads you post show up here."
        action={<Button>Post an ad</Button>}
      />,
    );
    expect(screen.getByText("Ads you post show up here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post an ad" })).toBeTruthy();
  });
});

describe("Icon", () => {
  test("an unregistered name renders the fallback rather than crashing", () => {
    // Mock data names icons as strings, so a typo in a seed file must degrade
    // to a circle and not take a whole screen down.
    const { container } = render(<Icon name="NotARealIcon" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  test("a registered name renders that icon", () => {
    const { container } = render(<Icon name="Megaphone" />);
    expect(container.querySelector("svg").getAttribute("class")).toMatch(
      /megaphone/,
    );
  });
});

describe("BottomSheet", () => {
  const sheet = (props = {}) => (
    <BottomSheet header={<h2>Listings near you</h2>} {...props}>
      <p>A row</p>
    </BottomSheet>
  );

  test("without onToggle the handle is decoration, not a control", () => {
    render(sheet());
    expect(screen.queryByRole("button")).toBe(null);
    expect(screen.getByText("A row")).toBeTruthy();
  });

  test("collapsed folds the rows away and keeps the header", () => {
    render(sheet({ onToggle: () => {}, collapsed: true }));
    // The heading and the count are the whole point of collapsing rather than
    // closing: the reader can still see what the map is plotting.
    expect(screen.getByText("Listings near you")).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe(
      "false",
    );
    // `hidden lg:block` — jsdom has no viewport, so the class is the assertion.
    expect(document.getElementById("sheet-body").className).toMatch(/hidden/);
  });

  test("the handle toggles and names what it will do", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(sheet({ onToggle }));

    const handle = screen.getByRole("button", { name: "Hide the list" });
    expect(handle.getAttribute("aria-expanded")).toBe("true");
    await user.click(handle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(sheet({ onToggle, collapsed: true }));
    expect(screen.getByRole("button", { name: "Show the list" })).toBeTruthy();
  });
});
