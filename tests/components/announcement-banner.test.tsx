// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AnnouncementBannerView,
  dismissedKey,
} from "@/components/AnnouncementBannerView";

/**
 * The announcement is now read on the server; what's left in the browser is
 * dismissal, remembered per announcement in localStorage. The failure worth
 * guarding is the banner coming back for someone who already closed it —
 * which is easy to cause by moving where the data comes from.
 */

const announcement = { id: "a1", title: "Maintenance", body: "Back soon." };

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("AnnouncementBannerView", () => {
  it("shows an announcement that hasn't been dismissed", () => {
    const { getByText } = render(<AnnouncementBannerView announcement={announcement} />);
    expect(getByText("Maintenance")).toBeDefined();
  });

  it("stays hidden for an announcement dismissed earlier", () => {
    localStorage.setItem(dismissedKey("a1"), "1");
    const { queryByText } = render(<AnnouncementBannerView announcement={announcement} />);
    expect(queryByText("Maintenance")).toBeNull();
  });

  it("hides on dismiss and remembers it for this announcement only", () => {
    const { getByLabelText, queryByText } = render(
      <AnnouncementBannerView announcement={announcement} />,
    );
    fireEvent.click(getByLabelText("Dismiss announcement"));

    expect(queryByText("Maintenance")).toBeNull();
    expect(localStorage.getItem(dismissedKey("a1"))).toBe("1");
    expect(localStorage.getItem(dismissedKey("a2"))).toBeNull();
  });
});
