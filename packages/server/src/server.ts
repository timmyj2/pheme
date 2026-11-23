import { gitCommit, gitCreatePr, gitDiff, gitPush, gitRemoteInfo, gitStatus, gitUndo } from "./git.ts";
import { HttpError } from "./http-error.ts";
import http from "node:http";
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
    if (seg[0] === "models" && m === "GET") return json(res, 200, await app.engine.listModels().catch(() => []));

    // --- chats
    if (seg[0] === "chats") {
      if (seg.length === 1) {
        if (m === "GET") return json(res, 200, app.store.list().map((c) => ({ ...c, busy: app.isBusy(c.id) })));
        if (m === "POST") return json(res, 201, app.store.create({ model: typeof body.model === "string" ? body.model : undefined }));
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
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return json(res, 400, { error: "empty message" });
        try {
          app.send(id, text);
        } catch (e) {
          return json(res, 409, { error: (e as Error).message });
        }
        return json(res, 202, { ok: true });
      }
      if (seg[2] === "git" && m === "GET" && (seg.length === 3 || (seg.length === 4 && seg[3] === "diff"))) {
        const dir = meta.projectDir;
        if (!dir) return json(res, 200, { repo: false, files: [], problem: "Choose a project folder for this chat to see its changes." });
        if (seg.length === 3) return json(res, 200, await gitStatus(dir));
        const file = url.searchParams.get("path");
        if (!file) throw new HttpError(400, "path is required.");
        return json(res, 200, await gitDiff(dir, file));
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
