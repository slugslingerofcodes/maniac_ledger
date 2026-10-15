// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// globals:false means testing-library cannot auto-register its cleanup.
afterEach(cleanup);

/**
 * The "Add to calendar" button: fetch /api/calendar, hand the .ics to the
 * browser as a download, and say what happened.
 *
 * The failure worth pinning is the quiet one. When the session has expired the
 * proxy redirects the fetch to /login, which `fetch` follows to a 200 HTML
 * page — `res.ok` is true. A button that only checks `ok` "downloads" the login
 * page as anime-maniacs-airing.ics and toasts success. So every non-calendar
 * response must end in an error toast and no download.
 */

vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: vi.fn(() => true) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { useOnlineStatus } = await import("@/hooks/use-online-status");
const { toast } = await import("sonner");
const { AddToCalendarButton } = await import("@/components/schedule/AddToCalendarButton");

const ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
const OBJECT_URL = "blob:https://app.test/calendar";

const fetchMock = vi.fn();
const createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => OBJECT_URL);
const revokeObjectURL = vi.fn<(url: string) => void>();

// jsdom implements neither; keep whatever the environment had to restore after.
const originalObjectUrlFns = {
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
};

/** A `fetch` Response stand-in; `redirected` can't be set on a real one. */
function response({
  status = 200,
  contentType = "text/calendar; charset=utf-8",
  redirected = false,
  body = ICS,
}: { status?: number; contentType?: string; redirected?: boolean; body?: string } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected,
    url: redirected ? "https://app.test/login" : "https://app.test/api/calendar",
    headers: new Headers({ "Content-Type": contentType }),
    blob: () => Promise.resolve(new Blob([body], { type: contentType })),
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new SyntaxError("not JSON")),
  };
}

function button() {
  return screen.getByRole("button", { name: "Add to calendar" }) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useOnlineStatus).mockReturnValue(true);
  fetchMock.mockResolvedValue(response());
  vi.stubGlobal("fetch", fetchMock);
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  // jsdom logs "not implemented: navigation" when a download link is clicked.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  Object.assign(URL, originalObjectUrlFns);
});

describe("AddToCalendarButton — rendering", () => {
  it("renders the button and its helper text", () => {
    render(<AddToCalendarButton />);

    expect(button()).toBeDefined();
    expect(screen.getByText("Your Watching shows as weekly events (JST).")).toBeDefined();
  });

  it("is enabled when online", () => {
    render(<AddToCalendarButton />);

    expect(button().disabled).toBe(false);
    expect(screen.queryByText("You're offline — connect to export your calendar.")).toBeNull();
  });

  it("accepts a className", () => {
    const { container } = render(<AddToCalendarButton className="mt-6 test-marker" />);

    expect(container.querySelector(".test-marker")).not.toBeNull();
  });
});

describe("AddToCalendarButton — offline", () => {
  beforeEach(() => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
  });

  it("disables the button and explains why", () => {
    render(<AddToCalendarButton />);

    expect(button().disabled).toBe(true);
    expect(screen.getByText("You're offline — connect to export your calendar.")).toBeDefined();
  });

  it("does not fetch when clicked", () => {
    render(<AddToCalendarButton />);

    fireEvent.click(button());

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AddToCalendarButton — in flight", () => {
  it("disables and marks itself busy until the request settles, then re-enables", async () => {
    let settle!: (value: unknown) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    render(<AddToCalendarButton />);

    fireEvent.click(button());

    await waitFor(() => expect(button().disabled).toBe(true));
    expect(button().getAttribute("aria-busy")).toBe("true");

    // A second click while in flight must not start a second export.
    fireEvent.click(button());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    settle(response());

    await waitFor(() => expect(button().disabled).toBe(false));
    expect(button().getAttribute("aria-busy")).not.toBe("true");
  });

  it("re-enables after a failed export too", async () => {
    fetchMock.mockResolvedValue(response({ status: 500, contentType: "application/json" }));
    render(<AddToCalendarButton />);

    fireEvent.click(button());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(button().getAttribute("aria-busy")).not.toBe("true");
  });
});

describe("AddToCalendarButton — success", () => {
  it("requests /api/calendar", async () => {
    render(<AddToCalendarButton />);

    fireEvent.click(button());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/calendar$/);
  });

  it("downloads the calendar via an object URL, frees it, and confirms", async () => {
    render(<AddToCalendarButton />);

    fireEvent.click(button());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Calendar file downloaded."));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith(OBJECT_URL), {
      timeout: 3_000,
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("hands the browser the calendar bytes it received", async () => {
    render(<AddToCalendarButton />);

    fireEvent.click(button());

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe(ICS);
  });
});

describe("AddToCalendarButton — failures", () => {
  const SIGN_IN = "Sign in again to export your calendar.";
  const GENERIC = "Couldn't create the calendar file.";

  it.each([
    ["a 401", response({ status: 401, contentType: "application/json" }), SIGN_IN],
    [
      "a redirect to the login page",
      response({ status: 200, contentType: "text/html; charset=utf-8", redirected: true }),
      SIGN_IN,
    ],
    [
      // The redirect alone is the signal — not just the HTML it usually lands on.
      "any redirect, even one ending in a calendar",
      response({ status: 200, redirected: true }),
      SIGN_IN,
    ],
    [
      "a 200 that isn't a calendar",
      response({ status: 200, contentType: "text/html; charset=utf-8" }),
      SIGN_IN,
    ],
    [
      "a 429",
      response({ status: 429, contentType: "application/json" }),
      "You just exported — try again in a minute.",
    ],
    [
      "a 503",
      response({ status: 503, contentType: "application/json" }),
      "The airing schedule is unavailable right now. Try again later.",
    ],
    ["a 500", response({ status: 500, contentType: "application/json" }), GENERIC],
    ["a 404", response({ status: 404, contentType: "text/html" }), GENERIC],
  ])("shows the right error for %s and downloads nothing", async (_name, res, message) => {
    fetchMock.mockResolvedValue(res);
    render(<AddToCalendarButton />);

    fireEvent.click(button());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("shows the generic error when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<AddToCalendarButton />);

    fireEvent.click(button());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(GENERIC));
    expect(toast.success).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
