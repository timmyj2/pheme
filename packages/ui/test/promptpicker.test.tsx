import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Composer, type ComposerHandle } from "../src/Composer.tsx";
import { firstPlaceholder, promptsFor } from "../src/PromptPicker.tsx";
import { api, type Prompt } from "../src/api.ts";
import { ToastProvider } from "../src/toast.tsx";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, prompts: vi.fn(), createPrompt: vi.fn() } };
});
const m = (k: keyof typeof api) => api[k] as unknown as ReturnType<typeof vi.fn>;
const P = (name: string, text: string, projectDir?: string): Prompt => ({ id: `id-${name}`, name, text, ...(projectDir ? { projectDir } : {}), createdAt: 1, updatedAt: 1 });
const ALL = [P("Explain", "Explain {{this}} to me simply"), P("Review", "Review the diff"), P("Release notes", "Write release notes", "/p/app"), P("Other project", "Only elsewhere", "/p/other")];
const base = { chatId: "c1", busy: false, offline: false, queue: [] as string[], hasMessages: false, onSend: vi.fn(), onStop: vi.fn(), onRemoveQueued: vi.fn() };
const box = () => screen.getByLabelText("Message") as HTMLTextAreaElement;
const ui = (o: Partial<typeof base> & { projectDir?: string } = {}, ref?: React.Ref<ComposerHandle>) => <ToastProvider><Composer {...base} {...o} ref={ref} /></ToastProvider>;
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); m("prompts").mockResolvedValue(ALL); });

/** The saved-prompt list opens from the "+" menu, like any other item in it. */
async function togglePrompts(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add files or saved prompts" }));
  await user.click(await screen.findByRole("menuitem", { name: "Insert a saved prompt" }));
}

describe("promptsFor", () => {
  it("offers global prompts plus this project's, hides other projects', and ranks project and prefix matches first", () => {
    expect(promptsFor(ALL, "/p/app", "").map((p) => p.name)).toEqual(["Release notes", "Explain", "Review"]);
    expect(promptsFor(ALL, "/p/app/", "").map((p) => p.name)).toContain("Release notes"); // trailing slash does not matter
    expect(promptsFor(ALL, undefined, "").map((p) => p.name)).toEqual(["Explain", "Review"]);
    expect(promptsFor(ALL, "/p/app", "rev").map((p) => p.name)).toEqual(["Review"]);
    expect(promptsFor([P("A thing", "mentions review"), P("Review it", "x")], undefined, "rev").map((p) => p.name)).toEqual(["Review it", "A thing"]);
    expect(promptsFor(ALL, "/p/app", "zzz")).toEqual([]);
  });
  it("finds the first {{blank}} to select", () => {
    expect(firstPlaceholder("Explain {{this}} and {{that}}")).toEqual([8, 16]);
    expect(firstPlaceholder("no blanks, {not one} or {{ }")).toBeNull();
    expect(firstPlaceholder("{{" + "x".repeat(100) + "}}")).toBeNull();
  });
});

describe("Composer prompt picker", () => {
  it("the button opens a searchable list that loads on open; choosing inserts the text with the first blank selected", async () => {
    const user = userEvent.setup();
    render(ui());
    expect(m("prompts")).not.toHaveBeenCalled();
    await togglePrompts(user);
    expect(await screen.findByRole("option", { name: /Explain/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Release notes/ })).toBeNull(); // another project's, or none given
    await user.type(screen.getByLabelText("Search prompts"), "expl");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.click(screen.getByRole("option", { name: /Explain/ }));
    await waitFor(() => expect(box().value).toBe("Explain {{this}} to me simply"));
    await waitFor(() => expect([box().selectionStart, box().selectionEnd]).toEqual([8, 16]));
    expect(screen.queryByRole("group", { name: "Insert a saved prompt" })).toBeNull();
    expect(base.onSend).not.toHaveBeenCalled(); // inserting never sends
  });
  it("appends below what is already typed, instead of replacing it", async () => {
    const user = userEvent.setup();
    render(ui());
    await user.type(box(), "My notes");
    await togglePrompts(user);
    await user.click(await screen.findByRole("option", { name: /Review/ }));
    await waitFor(() => expect(box().value).toBe("My notes\nReview the diff"));
  });
  it("typing / opens the list inline; arrows move, Enter inserts (and does not send), the text replaces the slash", async () => {
    const user = userEvent.setup();
    render(ui());
    await user.type(box(), "/");
    expect(await screen.findByRole("listbox", { name: "Saved prompts" })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
    expect(box()).toHaveAttribute("aria-activedescendant", "prompt-opt-id-Review");
    await user.keyboard("{Enter}");
    expect(base.onSend).not.toHaveBeenCalled();
    await waitFor(() => expect(box().value).toBe("Review the diff"));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("typing after the slash filters; with no match Enter sends the text as typed (so '/help' is still a message)", async () => {
    const user = userEvent.setup();
    render(ui());
    await user.type(box(), "/rev");
    expect(await screen.findAllByRole("option")).toHaveLength(1);
    await user.clear(box());
    await user.type(box(), "/nomatch{Enter}");
    expect(base.onSend).toHaveBeenCalledWith("/nomatch", []);
  });
  it("Escape dismisses the inline list so a literal /message can be sent, and reopens on further typing", async () => {
    const user = userEvent.setup();
    render(ui());
    await user.type(box(), "/");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{Enter}");
    expect(base.onSend).toHaveBeenCalledWith("/", []);
    await user.type(box(), "/r");
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });
  it("Escape while a reply runs closes the list instead of stopping the reply", async () => {
    const user = userEvent.setup();
    render(ui({ busy: true }));
    await user.type(box(), "/");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");
    expect(base.onStop).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("offers this chat's project prompts too, project ones first", async () => {
    const user = userEvent.setup();
    render(ui({ projectDir: "/p/app" }));
    await togglePrompts(user);
    const names = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(names[0]).toMatch(/Release notes/);
    expect(names.join()).not.toMatch(/Other project/);
  });
  it("says so when there are none, or when loading fails (with a retry)", async () => {
    const user = userEvent.setup();
    m("prompts").mockResolvedValueOnce([]);
    render(ui());
    await togglePrompts(user);
    expect(await screen.findByText("No saved prompts yet.")).toBeInTheDocument();
    await togglePrompts(user); // close
    m("prompts").mockRejectedValueOnce(new Error("Can't reach Pheme")).mockResolvedValue(ALL);
    await togglePrompts(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Pheme");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("option", { name: /Explain/ })).toBeInTheDocument();
  });
  it("saves the message being written as a prompt (optionally for this project) and closes", async () => {
    const user = userEvent.setup();
    m("createPrompt").mockResolvedValue(P("Mine", "draft"));
    render(ui({ projectDir: "/p/app" }));
    await user.type(box(), "draft");
    await togglePrompts(user);
    await user.click(await screen.findByRole("button", { name: /Save this message as a prompt/ }));
    await user.type(screen.getByLabelText("Prompt name"), "Mine");
    await user.click(screen.getByLabelText(/Only in this project/));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m("createPrompt")).toHaveBeenCalledWith({ name: "Mine", text: "draft", projectDir: "/p/app" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Insert a saved prompt" })).toBeNull());
    expect(box().value).toBe("draft"); // the draft stays where it was
  });
  it("shows the server's reason when saving fails and keeps the form open", async () => {
    const user = userEvent.setup();
    m("createPrompt").mockRejectedValue(new Error('You already have a prompt called "Mine" for all chats.'));
    render(ui());
    await user.type(box(), "draft");
    await togglePrompts(user);
    await user.click(await screen.findByRole("button", { name: /Save this message as a prompt/ }));
    await user.type(screen.getByLabelText("Prompt name"), "Mine{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("already have a prompt");
    expect(screen.getByLabelText("Prompt name")).toBeInTheDocument();
  });
  it("is closed by the handle-free case too: switching the text away from a slash closes the list", async () => {
    const ref = createRef<ComposerHandle>();
    const user = userEvent.setup();
    render(ui({}, ref));
    await user.type(box(), "/");
    await screen.findByRole("listbox");
    act(() => ref.current!.set("hello"));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(base.onSend).toHaveBeenCalledWith("hello", []);
  });
});
