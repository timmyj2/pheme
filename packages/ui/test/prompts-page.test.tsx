import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { folderLabel, matchPrompt, PromptsPage } from "../src/Prompts.tsx";
import { api, type Prompt } from "../src/api.ts";
import { ToastProvider } from "../src/toast.tsx";
import { hasUnsaved, clearUnsaved } from "../src/unsaved.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, prompts: vi.fn(), createPrompt: vi.fn(), updatePrompt: vi.fn(), deletePrompt: vi.fn() } };
});
const m = (k: keyof typeof api) => api[k] as unknown as ReturnType<typeof vi.fn>;
const P = (name: string, text: string, projectDir?: string): Prompt => ({ id: `id-${name}`, name, text, ...(projectDir ? { projectDir } : {}), createdAt: 1, updatedAt: 1 });
const ui = () => <ToastProvider><PromptsPage /></ToastProvider>;
beforeEach(() => { vi.clearAllMocks(); clearUnsaved(); m("prompts").mockResolvedValue([P("Explain", "Explain {{this}}"), P("Notes", "Write notes", "/p/app")]); });

describe("matching", () => {
  it("every word must appear in the name, text or folder, any case", () => {
    expect(matchPrompt(P("Explain", "Explain {{this}}"), "EXPLAIN this")).toBe(true);
    expect(matchPrompt(P("Explain", "x"), "explain zzz")).toBe(false);
    expect(matchPrompt(P("n", "t", "/Work/App"), "work")).toBe(true);
    expect(matchPrompt(P("n", "t"), "")).toBe(true);
    expect(folderLabel("C:\\Users\\me\\proj\\")).toBe("proj");
    expect(folderLabel("/a/b/")).toBe("b");
  });
});

describe("PromptsPage", () => {
  it("lists prompts with a project badge, filters by search, and says when nothing matches", async () => {
    const user = userEvent.setup();
    render(ui());
    expect(await screen.findByText("Explain")).toBeInTheDocument();
    expect(screen.getByText("Project: app")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search prompts"), "notes");
    expect(screen.queryByText("Explain")).toBeNull();
    await user.clear(screen.getByLabelText("Search prompts")); await user.type(screen.getByLabelText("Search prompts"), "zzz");
    expect(screen.getByText(/No prompt matches/)).toBeInTheDocument();
  });
  it("creates a prompt, and shows the server's reason when it is refused (keeping the form)", async () => {
    const user = userEvent.setup();
    m("createPrompt").mockRejectedValueOnce(new Error('You already have a prompt called "Explain" for all chats.')).mockResolvedValue(P("New", "t"));
    render(ui());
    await screen.findByText("Explain");
    await user.click(screen.getByRole("button", { name: "New prompt" }));
    const form = screen.getByRole("group", { name: "New prompt" });
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(within(form).getByLabelText("Name"), "Explain");
    await user.type(within(form).getByLabelText("Text"), "again");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("already have a prompt");
    await user.clear(within(form).getByLabelText("Name")); await user.type(within(form).getByLabelText("Name"), "New");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m("createPrompt")).toHaveBeenLastCalledWith({ name: "New", text: "again", projectDir: "" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "New prompt" })).toBeNull());
  });
  it("edits an existing prompt in place", async () => {
    const user = userEvent.setup();
    m("updatePrompt").mockResolvedValue(P("Explain", "changed"));
    render(ui());
    await user.click(await screen.findByRole("button", { name: "Edit Explain" }));
    const form = screen.getByRole("group", { name: "Edit prompt" });
    expect(within(form).getByLabelText("Name")).toHaveValue("Explain");
    await user.clear(within(form).getByLabelText("Text")); await user.type(within(form).getByLabelText("Text"), "changed");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(m("updatePrompt")).toHaveBeenCalledWith("id-Explain", { name: "Explain", text: "changed", projectDir: "" }));
  });
  it("asks before deleting, and cancelling deletes nothing", async () => {
    const user = userEvent.setup();
    m("deletePrompt").mockResolvedValue({ ok: true });
    render(ui());
    await user.click(await screen.findByRole("button", { name: "Delete Explain" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(m("deletePrompt")).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete Explain" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(m("deletePrompt")).toHaveBeenCalledWith("id-Explain"));
  });
  it("counts an edited form as unsaved changes so leaving the page asks first; cancelling clears it", async () => {
    const user = userEvent.setup();
    render(ui());
    await user.click(await screen.findByRole("button", { name: "Edit Explain" }));
    expect(hasUnsaved()).toBe(false);
    await user.type(screen.getByLabelText("Text"), " more");
    expect(hasUnsaved()).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(hasUnsaved()).toBe(false);
  });
  it("shows a clear message and a retry when the list cannot load; and an empty-state hint with no prompts", async () => {
    m("prompts").mockRejectedValueOnce(new Error("Can't reach Pheme")).mockResolvedValueOnce([]);
    const user = userEvent.setup();
    render(ui());
    expect(await screen.findByText(/Can't reach Pheme/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText(/No saved prompts yet/)).toBeInTheDocument();
  });
});
