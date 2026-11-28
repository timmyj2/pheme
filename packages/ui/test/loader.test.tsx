import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Loader, loaderKind, setLoaderKind } from "../src/Loader.tsx";
import { WorkingRow } from "../src/components/thread/WorkingRow.tsx";

describe("loader", () => {
  it("falls back to the default for a bad or missing save", () => {
    localStorage.removeItem("pheme-loader");
    expect(loaderKind()).toBe("grid");
    localStorage.setItem("pheme-loader", "nope\u0000");
    expect(loaderKind()).toBe("grid");
  });

  it("the saved key still round-trips for the Settings page, but changes no chat visual", async () => {
    const user = userEvent.setup();
    function Pick() {
      return <button type="button" onClick={() => setLoaderKind("mist")}>Sphere of mist</button>;
    }
    render(<><Pick /><WorkingRow /></>);
    await user.click(screen.getByRole("button", { name: "Sphere of mist" }));
    expect(loaderKind()).toBe("mist");
    localStorage.removeItem("pheme-loader");
  });

  it("the legacy preview is a decorative square, not a status", () => {
    const { container } = render(<Loader kind="light" quiet />);
    expect(container.querySelector("[data-loader='light']")).toHaveAttribute("aria-hidden", "true");
  });
});
