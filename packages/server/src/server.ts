import fs from "node:fs";
import { applyBackup, backupFileName, createBackup, previewBackup } from "./backup.ts";
import { chatToMarkdown, exportFileName, searchLimited } from "./export.ts";
import { MAX_IMAGE_BYTES, MAX_PER_MESSAGE } from "./attachments.ts";
import { listDir } from "./files.ts";
import { gitBranches, gitStashApply, gitStashDrop, gitStashList, gitStashPush, gitSwitch } from "./gitbranch.ts";
import { gitCommit, gitCreatePr, gitDiff, gitPrDetail, gitPush, gitRemoteInfo, gitStatus, gitUndo } from "./git.ts";
import { HttpError } from "./http-error.ts";
import http from "node:http";
import os from "node:os";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { App } from "./app.ts";
import type { ApprovalDecision, BootstrapState, Settings } from "./protocol.ts";
import type { MemoryStoreName } from "./memory.ts";

export interface Asset {
  type: string;
  /** base64 */
  data: string;
}
export type Assets = Record<string, Asset>;

export interface ServerOptions {
  app: App;
  fake: boolean;
  version: string;
  assets?: Assets;
  port?: number;
  token?: string;
}

export interface RunningServer {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

const MAX_BODY = 1_000_000;
/** Largest backup file accepted for restore (compressed bytes). */
const MAX_RESTORE = 250_000_000;

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const { app } = opts;
  const token = opts.token ?? randomBytes(24).toString("base64url");
  const tokenBuf = Buffer.from(token);

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (!res.headersSent) json(res, e instanceof HttpError ? e.status : 500, { error: (e as Error).message });
      else res.end();
    });
  });

  const hostOk = (req: http.IncomingMessage) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.host ?? "");

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // Guard against DNS rebinding: only accept loopback Host headers.
    if (!hostOk(req)) return json(res, 403, { error: "bad host" });
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const p = url.pathname;
    if (!p.startsWith("/api/")) return serveStatic(res, p);

    const given = String(req.headers["x-pheme-token"] ?? url.searchParams.get("token") ?? "");
    const g = Buffer.from(given);
    if (g.length !== tokenBuf.length || !timingSafeEqual(g, tokenBuf)) return json(res, 401, { error: "bad token" });
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return json(res, 403, { error: "bad origin" });

    const m = req.method ?? "GET";
    const seg = p.slice(5).split("/").filter(Boolean).map(decodeURIComponent);

    // --- backup and restore (raw file body, so these run before the JSON body parser)
    if (seg[0] === "backup" && m === "GET") {
      const now = Date.now();
      const file = createBackup(app.dataDir, opts.version, now);
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": file.length, "content-disposition": `attachment; filename="${backupFileName(now)}"`, "cache-control": "no-store", "x-content-type-options": "nosniff" });
      return res.end(file);
    }
    if (seg[0] === "restore" && m === "POST" && (seg[1] === "preview" || seg.length === 1)) {
      const data = await readRaw(req, MAX_RESTORE);
      if (seg[1] === "preview") return json(res, 200, previewBackup(data, app.dataDir));
      if (app.busyCount() > 0) throw new HttpError(409, "A reply is running. Wait for it to finish (or stop it), then restore.");
      const result = applyBackup(data, app.dataDir, { overwrite: url.searchParams.get("overwrite") === "1", appVersion: opts.version });
      app.store.resetCache();
      return json(res, 200, result);
    }
    // --- attachments (raw file body, so these run before the JSON body parser)
    if (seg[0] === "chats" && seg[2] === "attachments" && seg[1]) {
      const chatId = seg[1];
      const chat = app.store.get(chatId);
      if (!chat || chat.hidden) throw new HttpError(404, "no such chat");
      if (m === "POST" && seg.length === 3) {
        const data = await readRaw(req, MAX_IMAGE_BYTES + 1024);
        return json(res, 201, app.attachments.save(chatId, url.searchParams.get("name") ?? "file", data));
      }
      if (m === "GET" && seg.length === 4) {
        const f = app.attachments.open(chatId, seg[3]);
        if (!f) throw new HttpError(404, "That attachment is gone.");
        const data = fs.readFileSync(f.path);
        // Only the four raster image types are ever shown as images; everything else is plain text. Nothing can run in the browser.
        res.writeHead(200, {
          "content-type": f.ref.kind === "image" ? f.ref.mime : "text/plain; charset=utf-8",
          "content-length": data.length,
          "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.ref.name)}`,
          "x-content-type-options": "nosniff",
          "content-security-policy": "sandbox; default-src 'none'; style-src 'none'",
          "cache-control": "no-store", // never kept in the browser cache: a deleted chat's files must not linger there
        });
        return void res.end(data);
      }
      throw new HttpError(405, "not allowed");
    }
    const body = m === "POST" || m === "PUT" || m === "PATCH" ? await readBody(req) : {};

    // --- bootstrap, settings, models
    if (seg[0] === "state" && m === "GET") {
      const s: BootstrapState = { engine: app.engine.name, fake: opts.fake, settings: app.settings.get(), usage: app.settings.usage(), version: opts.version };
      return json(res, 200, s);
    }
    if (seg[0] === "settings") {
      if (m === "PUT") return json(res, 200, app.settings.update(body as Partial<Settings>));
      return json(res, 200, app.settings.get());
    }
    if (seg[0] === "search" && m === "GET") {
      let gone = false;
      res.on("close", () => { gone = true; });
      const found = await searchLimited(app.store, url.searchParams.get("q") ?? "", { logPath: (id) => app.store.logPath(id), cancelled: () => gone });
      if (found === "busy") throw new HttpError(429, "Searching is busy. Try again in a moment.");
      return json(res, 200, found);
    }
    if (seg[0] === "models" && m === "GET") return json(res, 200, await app.engine.listModels().catch(() => []));

    // --- chats
    if (seg[0] === "chats") {
      if (seg.length === 1) {
        if (m === "GET") return json(res, 200, app.store.list().map((c) => ({ ...c, busy: app.isBusy(c.id), waiting: app.pendingApprovals(c.id).length > 0 })));
        if (m === "POST") return json(res, 201, app.store.create({ model: typeof body.model === "string" ? body.model : undefined }));
      }
      if (seg[1] === "reorder" && m === "POST" && seg.length === 2) {
        const ids = body.ids;
        if (!Array.isArray(ids) || ids.length > 200 || ids.some((x) => typeof x !== "string" || x.length > 80 || x.includes("\0"))) throw new HttpError(400, "ids must be a list of chat ids.");
        return json(res, 200, { ok: true, updated: app.store.setTabOrder(ids) });
      }
      const id = seg[1];
      const meta = app.store.get(id);
      if (!meta) return json(res, 404, { error: "no such chat" });
      if (seg.length === 2) {
        if (m === "GET") return json(res, 200, { meta, busy: app.isBusy(id), events: app.store.events(id), pendingApprovals: app.pendingApprovals(id) });
        if (m === "PATCH") {
          const patch: Record<string, unknown> = {};
          if (typeof body.title === "string") patch.title = body.title.slice(0, 120);
          if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
          if (typeof body.archived === "boolean") patch.archived = body.archived;
          if ("model" in body) {
            if (body.model !== null && typeof body.model !== "string") throw new HttpError(400, "model must be a name or null.");
            await app.setChatModel(id, body.model as string | null);
          }
          if ("projectDir" in body) {
            if (body.projectDir !== null && typeof body.projectDir !== "string") throw new HttpError(400, "projectDir must be a path or null.");
            await app.setProjectDir(id, body.projectDir as string | null);
          }
          return json(res, 200, app.store.update(id, patch));
        }
        if (m === "DELETE") {
          await app.removeChat(id);
          return json(res, 200, { ok: true });
        }
      }
      if (seg[2] === "messages" && m === "POST") {
        const raw = typeof body.text === "string" ? body.text.trim() : "";
        const attached = app.attachments.resolve(id, body.attachments);
        if (!raw && attached.length === 0) return json(res, 400, { error: "empty message" });
        const text = raw || (attached.length === 1 ? "Please take a look at the attached file." : "Please take a look at the attached files.");
        if (attached.length > MAX_PER_MESSAGE) return json(res, 400, { error: `At most ${MAX_PER_MESSAGE} attachments per message.` });
        try {
          app.send(id, text, attached);
        } catch (e) {
          return json(res, 409, { error: (e as Error).message });
        }
        return json(res, 202, { ok: true });
      }
      if (seg[2] === "files" && m === "GET") {
        const root = meta.projectDir || os.homedir();
        return json(res, 200, listDir(root, url.searchParams.get("path") ?? ""));
      }
      if (seg[2] === "git" && m === "GET" && (seg.length === 3 || (seg.length === 4 && seg[3] === "diff"))) {
        const dir = meta.projectDir;
        if (!dir) return json(res, 200, { repo: false, files: [], problem: "Choose a project folder for this chat to see its changes." });
        if (seg.length === 3) return json(res, 200, await gitStatus(dir));
        const file = url.searchParams.get("path");
        if (!file) throw new HttpError(400, "path is required.");
        return json(res, 200, await gitDiff(dir, file));
      }
      if (seg[2] === "git" && m === "GET" && ((seg.length === 4 && seg[3] === "branches") || (seg.length === 4 && seg[3] === "stash"))) {
        if (!meta.projectDir) throw new HttpError(400, "Choose a project folder for this chat first.");
        return json(res, 200, seg[3] === "branches" ? await gitBranches(meta.projectDir) : await gitStashList(meta.projectDir));
      }
      if (seg[2] === "git" && m === "POST" && ((seg.length === 4 && (seg[3] === "switch" || seg[3] === "stash")) || (seg.length === 5 && seg[3] === "stash" && (seg[4] === "apply" || seg[4] === "drop")))) {
        const dir = meta.projectDir;
        if (!dir) throw new HttpError(400, "Choose a project folder for this chat first.");
        if (app.isBusy(id)) throw new HttpError(409, "A reply is running and may still be editing files. Wait for it to finish (or stop it) first.");
        if (seg[3] === "switch") return json(res, 200, await gitSwitch(dir, { name: String(body.name ?? ""), create: body.create === true, stash: body.stash === true }));
        if (seg.length === 4) return json(res, 200, await gitStashPush(dir, { message: typeof body.message === "string" ? body.message : "", includeUntracked: body.includeUntracked !== false }));
        if (seg[4] === "apply") return json(res, 200, await gitStashApply(dir, String(body.sha ?? ""), body.drop !== false));
        return json(res, 200, await gitStashDrop(dir, String(body.sha ?? "")));
      }
      if (seg[2] === "git" && seg.length === 4 && seg[3] === "pr" && m === "GET") {
        if (!meta.projectDir) throw new HttpError(400, "Choose a project folder for this chat first.");
        return json(res, 200, { pr: await gitPrDetail(meta.projectDir) });
      }
      if (seg[2] === "git" && seg.length === 4 && seg[3] === "remote" && m === "GET") {
        if (!meta.projectDir) throw new HttpError(400, "Choose a project folder for this chat first.");
        return json(res, 200, await gitRemoteInfo(meta.projectDir));
      }
      if (seg[2] === "git" && m === "POST" && seg.length === 4 && (seg[3] === "push" || seg[3] === "pr")) {
        const dir = meta.projectDir;
        if (!dir) throw new HttpError(400, "Choose a project folder for this chat first.");
        if (app.isBusy(id)) throw new HttpError(409, "A reply is running. Wait for it to finish (or stop it) first.");
        if (seg[3] === "push") return json(res, 200, await gitPush(dir));
        return json(res, 200, await gitCreatePr(dir, { title: body.title as string, body: typeof body.body === "string" ? body.body : "", base: typeof body.base === "string" ? body.base : undefined, draft: body.draft === true }));
      }
      if (seg[2] === "git" && m === "POST" && seg.length === 4 && (seg[3] === "commit" || seg[3] === "undo")) {
        const dir = meta.projectDir;
        if (!dir) throw new HttpError(400, "Choose a project folder for this chat first.");
        if (app.isBusy(id)) throw new HttpError(409, "A reply is running and may still be editing files. Wait for it to finish (or stop it), then commit.");
        if (seg[3] === "undo") return json(res, 200, await gitUndo(dir, String(body.sha ?? "")));
        return json(res, 200, await gitCommit(dir, { message: body.message as string, paths: body.paths as string[], branch: typeof body.branch === "string" ? body.branch : undefined, allowRisky: Array.isArray(body.allowRisky) ? (body.allowRisky as string[]) : [] }));
      }
      if (seg[2] === "export" && seg.length === 3 && m === "GET") {
        const md = chatToMarkdown(meta, app.store.events(id));
        const name = exportFileName(meta.title);
        res.writeHead(200, {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="chat.md"; filename*=UTF-8''${encodeURIComponent(name)}`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        return res.end(md);
      }
      if (seg[2] === "stop" && m === "POST") {
        app.stop(id);
        return json(res, 200, { ok: true });
      }
      if (seg[2] === "approvals" && seg[3] && m === "POST") {
        const d = body.decision as ApprovalDecision;
        if (d !== "once" && d !== "chat" && d !== "deny") return json(res, 400, { error: "bad decision" });
        return json(res, app.resolveApproval(id, seg[3], d) ? 200 : 404, { ok: true });
      }
      if (seg[2] === "events" && m === "GET") return sse(req, res, id, Number(url.searchParams.get("after") ?? 0));
    }

    // --- saved prompts
    if (seg[0] === "prompts") {
      if (seg.length === 1 && m === "GET") return json(res, 200, app.prompts.list());
      if (seg.length === 1 && m === "POST") return json(res, 201, app.prompts.create(body));
      if (seg.length === 2 && m === "PUT") return json(res, 200, app.prompts.update(seg[1], body));
      if (seg.length === 2 && m === "DELETE") { app.prompts.remove(seg[1]); return json(res, 200, { ok: true }); }
      throw new HttpError(405, "not allowed");
    }

    // --- scheduled jobs
    if (seg[0] === "jobs") {
      try {
        if (seg.length === 1 && m === "GET") return json(res, 200, app.jobs.list());
        if (seg.length === 1 && m === "POST") return json(res, 201, app.jobs.create(body as never));
        const job = app.jobs.get(seg[1]);
        if (!job) return json(res, 404, { error: "no such job" });
        if (seg[2] === "run" && m === "POST") {
          app.background(app.scheduler.run(job.id));
          return json(res, 202, { ok: true });
        }
        if (m === "PUT") return json(res, 200, app.jobs.update(job.id, body as never));
        if (m === "DELETE") {
          app.jobs.remove(job.id);
          return json(res, 200, { ok: true });
        }
      } catch (e) {
        return json(res, 400, { error: (e as Error).message });
      }
    }

    // --- curator
    if (seg[0] === "curator") {
      if (m === "GET") return json(res, 200, app.curator.state());
      if (m === "POST" && seg[1] === "run") {
        app.background(app.curator.run());
        return json(res, 202, { ok: true });
      }
    }

    // --- agents
    if (seg[0] === "agents" && m === "GET") return json(res, 200, app.agents.listRuns());
    if (seg[0] === "agent-profiles") {
      try {
        if (seg.length === 1 && m === "GET") return json(res, 200, app.agents.listProfiles());
        const name = seg[1];
        if (m === "GET") {
          const p = app.agents.getProfile(name);
          return p ? json(res, 200, p) : json(res, 404, { error: "no such agent" });
        }
        if (m === "PUT") {
          const tools = Array.isArray(body.tools) ? body.tools.map(String) : [];
          return json(res, 200, app.agents.saveProfile({ name, description: String(body.description ?? ""), instructions: String(body.instructions ?? ""), tools }));
        }
        if (m === "DELETE") {
          app.agents.archiveProfile(name);
          return json(res, 200, { ok: true });
        }
      } catch (e) {
        return json(res, 400, { error: (e as Error).message });
      }
    }

    // --- memory
    if (seg[0] === "memory") {
      if (m === "GET") return json(res, 200, app.memory.state());
      if (m === "PUT") {
        const store = body.store as MemoryStoreName;
        if ((store !== "memory" && store !== "user") || !Array.isArray(body.entries)) return json(res, 400, { error: "bad request" });
        try {
          app.memory.write(store, body.entries.map(String));
        } catch (e) {
          return json(res, 400, { error: (e as Error).message });
        }
        return json(res, 200, app.memory.state());
      }
    }

    // --- skills
    if (seg[0] === "skills") {
      if (seg.length === 1 && m === "GET") return json(res, 200, app.skills.list());
      const name = seg[1];
      try {
        if (m === "GET") return json(res, 200, { name, content: app.skills.view(name), files: app.skills.files(name) });
        if (m === "PUT") {
          const exists = app.skills.list().some((s) => s.name === name);
          app.skills.manage({ action: exists ? "edit" : "create", name, content: String(body.content ?? "") });
          return json(res, 200, { ok: true });
        }
        if (m === "DELETE") {
          app.skills.manage({ action: "delete", name });
          return json(res, 200, { ok: true });
        }
      } catch (e) {
        return json(res, 400, { error: (e as Error).message });
      }
    }
    return json(res, 404, { error: "not found" });
  }

  function sse(req: http.IncomingMessage, res: http.ServerResponse, id: string, after: number) {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(": connected\n\n"); // flush headers so clients see the stream open
    let last = after;
    const send = (e: { seq: number }) => {
      if (e.seq <= last) return; // already replayed
      last = e.seq;
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    const off = app.store.subscribe(id, send);
    for (const e of app.store.events(id, after)) send(e);
    const ka = setInterval(() => res.write(": keepalive\n\n"), 15000);
    req.on("close", () => {
      clearInterval(ka);
      off();
    });
  }

  function serveStatic(res: http.ServerResponse, p: string) {
    const assets = opts.assets ?? {};
    const key = p === "/" ? "/index.html" : p;
    const a = assets[key] ?? (key.includes(".") ? undefined : assets["/index.html"]);
    if (!a) return json(res, 404, { error: "UI not built. Run npm run build." });
    res.writeHead(200, { "content-type": a.type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
    res.end(Buffer.from(a.data, "base64"));
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/?token=${token}`,
    port,
    token,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readRaw(req: http.IncomingMessage, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new HttpError(413, "That file is too large."));
        chunks.length = 0;
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "body too large"));
        chunks.length = 0;
      } else if (size <= MAX_BODY) chunks.push(c);
    });
    req.on("end", () => {
      try {
        const t = Buffer.concat(chunks).toString("utf8");
        const v = t ? (JSON.parse(t) as unknown) : {};
        if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
        resolve(v as Record<string, unknown>);
      } catch {
        reject(new HttpError(400, "bad json"));
      }
    });
    req.on("error", reject);
  });
}
