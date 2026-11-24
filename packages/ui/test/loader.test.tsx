import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Loader, loaderKind, setLoaderKind } from "../src/Loader.tsx";

describe("loader", () => {
  it("falls back to the marching grid for a bad or missing save", () => {
    localStorage.removeItem("pheme-loader");
    expect(loaderKind()).toBe("grid");
    localStorage.setItem("pheme-loader", "nope\u0000");
    expect(loaderKind()).toBe("grid");
  });

  it("saves the chosen mark and the chat can read it", async () => {
    const user = userEvent.setup();
    function Pick() {
      return (
        <button type="button" onClick={() => setLoaderKind("mist")}>Sphere of mist</button>
      );
    }
    render(<><Pick /><Loader kind={loaderKind()} /></>);
    expect(screen.getByRole("status", { name: "Pheme is working" })).toHaveAttribute("data-loader", "grid");
    await user.click(screen.getByRole("button", { name: "Sphere of mist" }));
    expect(loaderKind()).toBe("mist");
    render(<Loader kind={loaderKind()} />);
    expect(screen.getAllByRole("status", { name: "Pheme is working" }).some((el) => el.getAttribute("data-loader") === "mist")).toBe(true);
  });
});
