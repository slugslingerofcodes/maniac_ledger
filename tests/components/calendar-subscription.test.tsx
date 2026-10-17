// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

/**
 * The subscription-link control beside "Add to calendar".
 *
 * Only a hash of the token is stored, so the link exists in exactly one place
 * after it's minted: this component's state. The behaviours worth pinning are
 * the ones that would strand a user — rotating or turning off a link that live
 * calendars depend on without a second click, or "copying" a link that was
 * never shown.
 */

vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: vi.fn(() => true) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/actions/calendar-feed", () => ({
  rotateCalendarFeed: vi.fn(),
  revokeCalendarFeed: vi.fn(),
}));

const { useOnlineStatus } = await import("@/hooks/use-online-status");
const { toast } = await import("sonner");
const { rotateCalendarFeed, revokeCalendarFeed } = await import("@/app/actions/calendar-feed");
const { CalendarSubscription } = await import("@/components/schedule/CalendarSubscription");

const rotateMock = vi.mocked(rotateCalendarFeed);
const revokeMock = vi.mocked(revokeCalendarFeed);

const TOKEN_1 = "a".repeat(43);
const TOKEN_2 = "b".repeat(43);
const PATH_1 = `/api/calendar/feed/${TOKEN_1}.ics`;
const PATH_2 = `/api/calendar/feed/${TOKEN_2}.ics`;

const writeText = vi.fn<(text: string) => Promise<void>>();

function urlFor(path: string) {
  return `${window.location.origin}${path}`;
}

function linkInput() {
  return screen.queryByRole("textbox", { name: "Calendar subscription link" }) as HTMLInputElement | null;
}

function buttonNamed(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useOnlineStatus).mockReturnValue(true);
  rotateMock.mockResolvedValue({ ok: true, path: PATH_1 });
  revokeMock.mockResolvedValue({ ok: true });
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("no link yet", () => {
  it("offers to create one and shows no link", () => {
    render(<CalendarSubscription active={false} />);

    expect(buttonNamed("Get subscription link").disabled).toBe(false);
    expect(linkInput()).toBeNull();
  });

  it("mints a link and shows the full URL, plus a webcal:// one-tap subscribe", async () => {
    render(<CalendarSubscription active={false} />);

    fireEvent.click(buttonNamed("Get subscription link"));

    await waitFor(() => expect(linkInput()?.value).toBe(urlFor(PATH_1)));
    expect(rotateMock).toHaveBeenCalledTimes(1);
    const subscribe = screen.getByRole("link", { name: /open in calendar app/i });
    expect(subscribe.getAttribute("href")).toBe(urlFor(PATH_1).replace(/^https?:/, "webcal:"));
    expect(toast.success).toHaveBeenCalled();
  });

  it("sends one request for a fast double click", async () => {
    let resolve!: (v: { ok: true; path: string }) => void;
    rotateMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<CalendarSubscription active={false} />);

    fireEvent.click(buttonNamed("Get subscription link"));
    fireEvent.click(buttonNamed("Get subscription link"));
    resolve({ ok: true, path: PATH_1 });

    await waitFor(() => expect(linkInput()).not.toBeNull());
    expect(rotateMock).toHaveBeenCalledTimes(1);
  });

  it("toasts the action's error and shows no link when minting fails", async () => {
    rotateMock.mockResolvedValue({ ok: false, error: "Couldn't create a calendar link. Try again later." });
    render(<CalendarSubscription active={false} />);

    fireEvent.click(buttonNamed("Get subscription link"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't create a calendar link. Try again later."),
    );
    expect(linkInput()).toBeNull();
    expect(buttonNamed("Get subscription link")).toBeDefined();
  });

  it("toasts a generic error when the action can't be reached", async () => {
    rotateMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<CalendarSubscription active={false} />);

    fireEvent.click(buttonNamed("Get subscription link"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Couldn't reach the server. Try again."));
    expect(linkInput()).toBeNull();
  });

  it("is disabled offline", () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<CalendarSubscription active={false} />);

    expect(buttonNamed("Get subscription link").disabled).toBe(true);
  });
});

describe("copying", () => {
  it("copies the full URL", async () => {
    render(<CalendarSubscription active={false} />);
    fireEvent.click(buttonNamed("Get subscription link"));
    await waitFor(() => expect(linkInput()).not.toBeNull());

    fireEvent.click(buttonNamed("Copy link"));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(urlFor(PATH_1)));
    expect(toast.success).toHaveBeenLastCalledWith("Link copied.");
  });

  it("says so when the clipboard is refused", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    render(<CalendarSubscription active={false} />);
    fireEvent.click(buttonNamed("Get subscription link"));
    await waitFor(() => expect(linkInput()).not.toBeNull());

    fireEvent.click(buttonNamed("Copy link"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't copy — select the link and copy it manually."),
    );
  });
});

describe("a link is already on", () => {
  it("says so without showing a link it no longer has", () => {
    render(<CalendarSubscription active />);

    expect(screen.getByText("Live calendar link is on.")).toBeDefined();
    expect(linkInput()).toBeNull();
    expect(screen.queryByRole("button", { name: "Get subscription link" })).toBeNull();
  });

  it("asks before replacing the link, and Cancel does nothing", () => {
    render(<CalendarSubscription active />);

    fireEvent.click(buttonNamed("New link"));
    expect(rotateMock).not.toHaveBeenCalled();
    expect(screen.getByText(/current link will stop working/i)).toBeDefined();

    fireEvent.click(buttonNamed("Cancel"));
    expect(rotateMock).not.toHaveBeenCalled();
    expect(buttonNamed("New link")).toBeDefined();
  });

  it("replaces the link once confirmed and shows the new one", async () => {
    rotateMock.mockResolvedValue({ ok: true, path: PATH_2 });
    render(<CalendarSubscription active />);

    fireEvent.click(buttonNamed("New link"));
    fireEvent.click(buttonNamed("Replace link"));

    await waitFor(() => expect(linkInput()?.value).toBe(urlFor(PATH_2)));
    expect(rotateMock).toHaveBeenCalledTimes(1);
  });

  it("asks before turning the link off, and Cancel does nothing", () => {
    render(<CalendarSubscription active />);

    fireEvent.click(buttonNamed("Turn off"));
    expect(revokeMock).not.toHaveBeenCalled();

    fireEvent.click(buttonNamed("Cancel"));
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it("turns the link off once confirmed and forgets the URL", async () => {
    render(<CalendarSubscription active={false} />);
    fireEvent.click(buttonNamed("Get subscription link"));
    await waitFor(() => expect(linkInput()).not.toBeNull());

    fireEvent.click(buttonNamed("Turn off"));
    fireEvent.click(buttonNamed("Turn off link"));

    await waitFor(() => expect(buttonNamed("Get subscription link")).toBeDefined());
    expect(revokeMock).toHaveBeenCalledTimes(1);
    expect(linkInput()).toBeNull();
    expect(toast.success).toHaveBeenLastCalledWith("Calendar link turned off.");
  });

  it("stays on when turning off fails", async () => {
    revokeMock.mockResolvedValue({ ok: false, error: "Couldn't turn off the calendar link. Try again later." });
    render(<CalendarSubscription active />);

    fireEvent.click(buttonNamed("Turn off"));
    fireEvent.click(buttonNamed("Turn off link"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't turn off the calendar link. Try again later."),
    );
    expect(screen.getByText("Live calendar link is on.")).toBeDefined();
  });

  it("disables New link and Turn off while offline", () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<CalendarSubscription active />);

    expect(buttonNamed("New link").disabled).toBe(true);
    expect(buttonNamed("Turn off").disabled).toBe(true);
  });
});
