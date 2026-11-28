import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROW_LIMIT, Sidebar, groupChats } from "../src/Sidebar.tsx";
import { api } from "../src/api.ts";
import type { ChatRow } from "../src/api.ts";
import { TID } from "../src/testids.ts";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 22, 15, 0, 0).getTime();
const chat = (id: string, title: string, ago: number, extra: Partial<ChatRow> = {}): ChatRow => ({ id, title, pinned: false, archived: false, createdAt: 0, updatedAt: NOW - ago, userMessages: 1, lastMemoryReviewAt: 0, ...extra });

describe("groupChats", () => {
  it("buckets by recency with pinned first and drops empty groups", () => {
    const g = groupChats([chat("a", "a", 60_000), chat("b", "b", DAY), chat("c", "c", 3 * DAY), chat("d", "d", 30 * DAY), chat("e", "e", 5 * DAY, { pinned: true })], NOW);
    expect(g.map((x) => [x.label, x.chats.map((c) => c.id)])).toEqual([["Pinned", ["e"]], ["Today", ["a"]], ["Yesterday", ["b"]], ["Previous 7 days", ["c"]], ["Older", ["d"]]]);
    expect(groupChats([], NOW)).toEqual([]);
    expect(groupChats([chat("a", "a", 1)], NOW).map((x) => x.label)).toEqual(["Today"]);
  });
});

function setup(chats: ChatRow[], over: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const props = {
    chats, activeId: null, view: "chat" as const, unread: new Set<string>(), searchRef: createRef<HTMLInputElement>(),
    onNew: vi.fn(), onOpen: vi.fn(), onView: vi.fn(), onRename: vi.fn(), onPin: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn(), onExport: vi.fn(), ...over,
  };
  render(<Sidebar {...props} />);
  return props;
}

describe("Sidebar", () => {
  it("opens a chat, starts a new one and navigates pages", async () => {
    const user = userEvent.setup();
    const p = setup([chat("a", "Alpha", 1000)]);
    await user.click(screen.getByText("Alpha"));
    expect(p.onOpen).toHaveBeenCalledWith("a");
    await user.click(screen.getByText("New chat"));
    expect(p.onNew).toHaveBeenCalled();
    await user.click(screen.getByText("Settings"));
    expect(p.onView).toHaveBeenCalledWith("settings");
  });
  it("searches case-insensitively and says when nothing matches", async () => {
    const user = userEvent.setup();
    setup([chat("a", "Quarterly REPORT", 1), chat("b", "Other", 2)]);
    await user.type(screen.getByLabelText("Search chats"), "report");
    expect(screen.getByText("Quarterly REPORT")).toBeInTheDocument();
    expect(screen.queryByText("Other")).toBeNull();
    await user.clear(screen.getByLabelText("Search chats"));
    await user.type(screen.getByLabelText("Search chats"), "zzz");
    expect(screen.getByText("No chats match.")).toBeInTheDocument();
  });
  it("renames inline: double-click, Enter saves, Escape cancels, blank is ignored", async () => {
    const user = userEvent.setup();
    const p = setup([chat("a", "Alpha", 1)]);
    await user.dblClick(screen.getByText("Alpha"));
    const input = screen.getByLabelText("Chat title");
    await user.clear(input);
    await user.type(input, "Beta{Enter}");
    expect(p.onRename).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "Beta");
    await user.dblClick(screen.getByText("Alpha"));
    await user.type(screen.getByLabelText("Chat title"), "zzz{Escape}");
    expect(p.onRename).toHaveBeenCalledTimes(1);
    await user.dblClick(screen.getByText("Alpha"));
    await user.clear(screen.getByLabelText("Chat title"));
    await user.keyboard("{Enter}");
    expect(p.onRename).toHaveBeenCalledTimes(1);
  });
  it("the ⋯ menu and right-click offer rename, pin, archive and delete", async () => {
    const user = userEvent.setup();
    const p = setup([chat("a", "Alpha", 1)]);
    await user.click(screen.getByLabelText("Actions for Alpha"));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((x) => x.textContent)).toEqual(["Rename", "Pin", "Archive", "Export as Markdown", "Delete…"]);
    await user.click(within(menu).getByText("Pin"));
    expect(p.onPin).toHaveBeenCalled();
    await user.pointer({ keys: "[MouseRight]", target: screen.getByText("Alpha") });
    await user.click(within(screen.getByRole("menu")).getByText("Delete…"));
    expect(p.onDelete).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("keyboard: arrows move between chats, F2 renames, Delete asks to delete, Escape closes a menu", async () => {
    const user = userEvent.setup();
    const p = setup([chat("a", "Alpha", 1), chat("b", "Beta", 2)]);
    screen.getByText("Alpha").closest("button")!.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByText("Beta").closest("button")).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByText("Alpha").closest("button")).toHaveFocus();
    await user.keyboard("{Delete}");
    expect(p.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    await user.keyboard("{F2}");
    expect(screen.getByLabelText("Chat title")).toHaveFocus();
    await user.keyboard("{Escape}");
    await user.click(screen.getByLabelText("Actions for Alpha"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("shows busy and unread markers and marks the open chat", () => {
    setup([chat("a", "Alpha", 1, { busy: true } as never), chat("b", "Beta", 2), chat("c", "Gamma", 3)], { unread: new Set(["b"]), activeId: "c" });
    expect(screen.getByLabelText("working")).toBeInTheDocument();
    expect(screen.getByLabelText("new activity")).toBeInTheDocument();
    expect(screen.getByText("Gamma").closest("button")).toHaveAttribute("aria-current", "page");
  });
  it("renders only the first page of a huge list, with a way to see more", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: ROW_LIMIT * 2 + 10 }, (_, i) => chat(`c${i}`, `Chat ${i}`, i));
    setup(many);
    expect(screen.getAllByTestId(TID.sessionRow)).toHaveLength(ROW_LIMIT);
    await user.click(screen.getByText(/Show \d+ more/));
    expect(screen.getAllByTestId(TID.sessionRow)).toHaveLength(ROW_LIMIT * 2);
  });
  it("archived chats live behind a toggle", async () => {
    const user = userEvent.setup();
    setup([chat("a", "Alpha", 1), chat("z", "Zeta", 2, { archived: true })]);
    expect(screen.queryByText("Zeta")).toBeNull();
    await user.click(screen.getByText("Show archived"));
    expect(screen.getByText("Zeta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("is a single Tab stop (the open chat, else the first), with arrows/Home/End moving across groups", async () => {
    const user = userEvent.setup();
    setup([chat("a", "Alpha", 1000), chat("b", "Beta", DAY), chat("c", "Gamma", 30 * DAY)], { activeId: "b" });
    const rows = screen.getAllByTestId(TID.sessionButton);
    expect(rows.map((r) => r.tabIndex)).toEqual([-1, 0, -1]); // open chat "Beta" is the tab stop
    screen.getAllByLabelText(/^Actions for/).forEach((b) => expect(b.tabIndex).toBe(-1));
    rows[1].focus();
    await user.keyboard("{ArrowDown}");
    expect(rows[2]).toHaveFocus(); // crossed into the "Older" group
    await user.keyboard("{Home}");
    expect(rows[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(rows[2]).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(screen.getByRole("searchbox", { name: /search/i })).toHaveFocus();
  });

  it("falls back to the first row as the Tab stop when no chat is open", () => {
    setup([chat("a", "Alpha", 1000), chat("b", "Beta", 2000)]);
    const rows = screen.getAllByTestId(TID.sessionButton);
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1]);
  });

  it("returns focus to the row after a rename is committed or cancelled with the keyboard", async () => {
    const user = userEvent.setup();
    const p = setup([chat("a", "Alpha", 1000)]);
    const row = () => screen.getAllByTestId(TID.sessionButton)[0];
    row().focus();
    await user.keyboard("{F2}");
    expect(screen.getByLabelText("Chat title")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(row()).toHaveFocus();
    await user.keyboard("{F2}Renamed{Enter}");
    expect(p.onRename).toHaveBeenCalled();
    expect(row()).toHaveFocus();
  });
});

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, search: vi.fn() } };
});
const search = api.search as unknown as ReturnType<typeof vi.fn>;

describe("Sidebar: export and message search", () => {
  beforeEach(() => search.mockReset());

  it("offers Export as Markdown in the row menu", async () => {
    const user = userEvent.setup();
    const p = setup([chat("a", "Alpha", 1000)]);
    await user.click(screen.getByLabelText("Actions for Alpha"));
    await user.click(screen.getByRole("menuitem", { name: "Export as Markdown" }));
    expect(p.onExport).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("searches message text after typing stops, lists hits not already matched by title, and opens one", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue({ partial: false, hits: [
      { id: "a", title: "Alpha zebra", updatedAt: 1, snippet: "title match already listed", role: "you" },
      { id: "b", title: "Beta", updatedAt: 1, snippet: "…the zebra crossing…", role: "pheme" },
      { id: "c", title: "Gamma", updatedAt: 1, snippet: "a zebra here", role: "you" },
    ] });
    const p = setup([chat("a", "Alpha zebra", 1000), chat("b", "Beta", 2000), chat("c", "Gamma", 3000)]);
    await user.type(screen.getByLabelText("Search chats"), "zebra");
    expect(await screen.findByText("In messages")).toBeInTheDocument();
    expect(search).toHaveBeenCalledTimes(1); // debounced: one request for the whole word, not one per key
    expect(search).toHaveBeenCalledWith("zebra");
    expect(screen.getByText(/the zebra crossing/)).toBeInTheDocument();
    expect(screen.getByText(/You: a zebra here/)).toBeInTheDocument();
    expect(screen.queryByText("title match already listed")).toBeNull();
    await user.click(screen.getByText(/the zebra crossing/));
    expect(p.onOpen).toHaveBeenCalledWith("b");
  });

  it("does not search for a single character", async () => {
    const user = userEvent.setup();
    search.mockResolvedValue({ hits: [], partial: false });
    setup([chat("a", "Alpha", 1000)]);
    await user.type(screen.getByLabelText("Search chats"), "a");
    await new Promise((r) => setTimeout(r, 400));
    expect(search).not.toHaveBeenCalled();
    expect(screen.queryByText("Searching messages…")).toBeNull();
    await user.type(screen.getByLabelText("Search chats"), "x");
    await waitFor(() => expect(search).toHaveBeenCalledWith("ax"));
    expect(screen.getByText("No chats match.")).toBeInTheDocument();
  });
});
