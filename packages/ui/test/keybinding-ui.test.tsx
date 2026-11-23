import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { KeybindingSettings } from "../src/KeybindingSettings.tsx";
import { loadBindings } from "../src/keybindings.ts";

const press = (code: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => fireEvent.keyDown(window, { code, key: code, ...o });
beforeEach(() => localStorage.clear());

describe("KeybindingSettings", () => {
  it("lists every shortcut with its current keys", () => {
    render(<KeybindingSettings />);
    expect(screen.getByRole("button", { name: /Command palette: .*K\. Change/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New chat: .*N\. Change/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Reset / }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("captures a new shortcut, saves it, and lets you reset it", async () => {
    const user = userEvent.setup();
    render(<KeybindingSettings />);
    await user.click(screen.getByRole("button", { name: /New chat: .* Change/ }));
    expect(screen.getByText("Press keys…")).toBeInTheDocument();
    press("AltLeft", { altKey: true }); // a lone modifier is not a choice yet
    expect(screen.getByText("Press keys…")).toBeInTheDocument();
    press("KeyJ", { altKey: true });
    expect(loadBindings().new).toBe("Alt+KeyJ");
    expect(await screen.findByRole("button", { name: /New chat: .*J\. Change/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset New chat" }));
    expect(loadBindings().new).toBe("Alt+KeyN");
    expect(localStorage.getItem("pheme-keys")).toBeNull();
  });

  it("explains a refusal (clash, reserved key, no modifier) and keeps waiting; Esc cancels", async () => {
    const user = userEvent.setup();
    render(<KeybindingSettings />);
    await user.click(screen.getByRole("button", { name: /New chat: .* Change/ }));
    press("KeyK", { ctrlKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(/already used for “Command palette”/);
    press("KeyW", { ctrlKey: true });
    expect(screen.getByRole("alert")).toHaveTextContent(/browser or system/);
    press("KeyN");
    expect(screen.getByRole("alert")).toHaveTextContent(/Ctrl\/Cmd or Alt/);
    expect(screen.getByText("Press keys…")).toBeInTheDocument();
    press("Escape");
    expect(screen.queryByText("Press keys…")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(loadBindings().new).toBe("Alt+KeyN"); // nothing was saved
  });

  it("swaps two shortcuts through a free key, and 'Reset all' restores the defaults", async () => {
    const user = userEvent.setup();
    render(<KeybindingSettings />);
    await user.click(screen.getByRole("button", { name: /New chat: .* Change/ })); press("KeyJ", { altKey: true });
    await user.click(screen.getByRole("button", { name: /Command palette: .* Change/ })); press("KeyN", { altKey: true });
    await user.click(screen.getByRole("button", { name: /New chat: .* Change/ })); press("KeyK", { ctrlKey: true });
    const b = loadBindings();
    expect(b).toMatchObject({ palette: "Alt+KeyN", new: "Mod+KeyK" });
    await user.click(screen.getByRole("button", { name: "Reset all to defaults" }));
    expect(loadBindings()).toMatchObject({ palette: "Mod+KeyK", new: "Alt+KeyN" });
  });

  it("while choosing, the pressed keys do not reach other shortcut handlers", async () => {
    const user = userEvent.setup();
    let reached = false;
    window.addEventListener("keydown", () => { reached = true; });
    render(<KeybindingSettings />);
    await user.click(screen.getByRole("button", { name: /Search chats: .* Change/ }));
    reached = false;
    press("KeyJ", { altKey: true });
    expect(reached).toBe(false);
  });
});
