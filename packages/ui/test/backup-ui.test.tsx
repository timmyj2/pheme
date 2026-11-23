import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackupSetting } from "../src/BackupSetting.tsx";
import { api } from "../src/api.ts";
import { ToastProvider } from "../src/toast.tsx";

vi.mock("../src/api.ts", async (orig) => {
  const actual = await orig<typeof import("../src/api.ts")>();
  return { ...actual, api: { ...actual.api, downloadBackup: vi.fn(), previewRestore: vi.fn(), restore: vi.fn() } };
});
const downloadBackup = api.downloadBackup as unknown as ReturnType<typeof vi.fn>;
const previewRestore = api.previewRestore as unknown as ReturnType<typeof vi.fn>;
const restore = api.restore as unknown as ReturnType<typeof vi.fn>;
const preview = { createdAt: 1_700_000_000_000, appVersion: "0.3.0", files: 10, chats: 3, skills: 2, agents: 1, hasMemory: true, hasSettings: true, newFiles: 8, existingFiles: 2, existingChats: 1 };
const ui = () => <ToastProvider><BackupSetting /></ToastProvider>;
const file = (name = "b.pheme-backup", size = 10) => new File([new Uint8Array(size)], name);
beforeEach(() => { downloadBackup.mockReset(); previewRestore.mockReset(); restore.mockReset(); vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() })); });

describe("BackupSetting", () => {
  it("downloads a backup and reports it", async () => {
    const user = userEvent.setup();
    downloadBackup.mockResolvedValue({ blob: new Blob(["abc"]), name: "pheme-backup-1.pheme-backup" });
    render(ui());
    await user.click(screen.getByRole("button", { name: "Download backup" }));
    expect(await screen.findByText(/Backup saved as “pheme-backup-1.pheme-backup”/)).toBeInTheDocument();
  });

  it("shows the server's reason when the backup fails", async () => {
    const user = userEvent.setup();
    downloadBackup.mockRejectedValue(new Error("Your data is too large to back up in one file (over 300 MB)."));
    render(ui());
    await user.click(screen.getByRole("button", { name: "Download backup" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too large/);
  });

  it("previews a chosen file, defaults to the safe mode, and restores without a scary prompt", async () => {
    const user = userEvent.setup();
    previewRestore.mockResolvedValue(preview);
    restore.mockResolvedValue({ written: 8, skipped: 2 });
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(ui());
    await user.upload(document.querySelector("input[type=file]") as HTMLInputElement, file());
    const box = await screen.findByRole("group", { name: "Restore preview" });
    expect(box).toHaveTextContent("3 chats, 2 skills, 1 agent, memory, settings");
    expect(box).toHaveTextContent("8 new files · 2 already here (1 of the chats)");
    expect(screen.getByRole("radio", { name: /keep everything already here/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(restore).toHaveBeenCalledWith(expect.any(File), false);
    expect(await screen.findByText(/Restored 8 files, kept 2 that already existed/)).toBeInTheDocument();
  });

  it("asks for confirmation before replacing existing data", async () => {
    const user = userEvent.setup();
    previewRestore.mockResolvedValue(preview);
    restore.mockResolvedValue({ written: 10, skipped: 0 });
    vi.stubGlobal("location", { ...window.location, reload: vi.fn() });
    render(ui());
    await user.upload(document.querySelector("input[type=file]") as HTMLInputElement, file());
    await screen.findByRole("group", { name: "Restore preview" });
    await user.click(screen.getByRole("radio", { name: /Replace what is already here/ }));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(restore).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/2 file\(s\) here will be replaced/);
    await user.click(screen.getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(expect.any(File), true));
  });

  it("rejects a bad file with the server's explanation, and an oversized one without uploading", async () => {
    const user = userEvent.setup({ applyAccept: false }); // a real file picker only suggests the type
    previewRestore.mockRejectedValue(new Error("That is not a Pheme backup file."));
    render(ui());
    const input = document.querySelector("input[type=file]") as HTMLInputElement;
    await user.upload(input, file("notes.txt"));
    expect(await screen.findByRole("alert")).toHaveTextContent("not a Pheme backup file");
    expect(screen.queryByRole("group", { name: "Restore preview" })).toBeNull();
    previewRestore.mockReset();
    const huge = file("huge.pheme-backup");
    Object.defineProperty(huge, "size", { value: 251_000_000 });
    await user.upload(input, huge);
    expect(await screen.findByText(/over 250 MB/)).toBeInTheDocument();
    expect(previewRestore).not.toHaveBeenCalled();
  });
  it("Cancel drops the preview, and a failed restore keeps the preview so it can be retried", async () => {
    const user = userEvent.setup();
    previewRestore.mockResolvedValue(preview);
    restore.mockRejectedValue(new Error("A reply is running. Wait for it to finish."));
    render(ui());
    await user.upload(document.querySelector("input[type=file]") as HTMLInputElement, file());
    await screen.findByRole("group", { name: "Restore preview" });
    await user.click(screen.getByRole("button", { name: "Restore" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/reply is running/);
    expect(screen.getByRole("group", { name: "Restore preview" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Restore preview" })).toBeNull();
  });
});
