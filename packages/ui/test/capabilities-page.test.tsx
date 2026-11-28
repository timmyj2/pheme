import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsPage } from "../src/Pages.tsx";
import { filterSkills, groupSkills, skillCategories } from "../src/components/page/skill-filter.ts";
import { api, type SkillSummary } from "../src/api.ts";
import { ToastProvider } from "../src/toast.tsx";
import { clearUnsaved } from "../src/unsaved.ts";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, skills: vi.fn(), curator: vi.fn(), archiveSkill: vi.fn(), skill: vi.fn(), runCurator: vi.fn() } };
});
const m = (k: keyof typeof api) => api[k] as unknown as ReturnType<typeof vi.fn>;

const SKILLS: SkillSummary[] = [
  { name: "apple-notes", description: "Manage Apple Notes via memo CLI." },
  { name: "apple-reminders", description: "Apple Reminders via remindctl." },
  { name: "write-tests", description: "Add a regression test before fixing a bug." },
];
const ui = () => <ToastProvider><SkillsPage name={null} onOpen={() => {}} /></ToastProvider>;
beforeEach(() => {
  vi.clearAllMocks(); clearUnsaved();
  m("skills").mockResolvedValue(SKILLS);
  m("curator").mockResolvedValue({ running: false, lastRunAt: null, report: [] });
});

describe("skill filters", () => {
  it("derives categories only from names that share a first word", () => {
    expect(skillCategories(SKILLS)).toEqual(["apple"]);
    expect(skillCategories([{ name: "write-tests", description: "" }])).toEqual([]);
  });
  it("filters by every search word and by category", () => {
    expect(filterSkills(SKILLS, "reminders", "All").map((s) => s.name)).toEqual(["apple-reminders"]);
    expect(filterSkills(SKILLS, "bug", "All").map((s) => s.name)).toEqual(["write-tests"]);
    expect(filterSkills(SKILLS, "", "apple")).toHaveLength(2);
    expect(filterSkills(SKILLS, "regression", "apple")).toEqual([]);
  });
  it("groups under categories with the All chip, otherwise in one group", () => {
    expect(groupSkills(SKILLS, ["apple"], "All").map((g) => g.title)).toEqual(["Apple", "Other"]);
    expect(groupSkills(SKILLS, ["apple"], "apple").map((g) => g.title)).toEqual(["Apple"]);
    expect(groupSkills(SKILLS, [], "All").map((g) => g.title)).toEqual(["Your skills"]);
  });
});

describe("Capabilities page", () => {
  it("shows the section tabs with the skill count and a card per skill, with no fake toggle", async () => {
    render(ui());
    expect(await screen.findByRole("link", { name: /Skills/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Memory" })).toHaveAttribute("href", "#/memory");
    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute("href", "#/agents");
    expect(screen.getByRole("link", { name: /Skills/ })).toHaveTextContent("3");
    expect(screen.getAllByText("Yours")).toHaveLength(3);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Archive apple-notes" })).toBeInTheDocument();
  });
  it("filters the cards with search and the category chips", async () => {
    const user = userEvent.setup();
    render(ui());
    await screen.findByText("write-tests");
    await user.type(screen.getByLabelText("Search skills"), "apple");
    expect(screen.queryByText("write-tests")).toBeNull();
    await user.clear(screen.getByLabelText("Search skills"));
    await user.click(screen.getByRole("button", { name: "Apple" }));
    expect(screen.getByRole("button", { name: "Apple" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("write-tests")).toBeNull();
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("write-tests")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Apple" })).toBeInTheDocument();
  });
  it("archives a skill from its card after confirming, and keeps the curator button", async () => {
    const user = userEvent.setup();
    m("archiveSkill").mockResolvedValue({ ok: true });
    render(ui());
    await user.click(await screen.findByRole("button", { name: "Archive write-tests" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Archive "write-tests"?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Archive" }));
    expect(m("archiveSkill")).toHaveBeenCalledWith("write-tests");
    expect(screen.getByRole("button", { name: "Run curator now" })).toBeInTheDocument();
  });
});
