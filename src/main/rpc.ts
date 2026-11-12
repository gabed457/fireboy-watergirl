import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
export type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
};
export class JsonLines {
  private pending = "";
  private decoder = new StringDecoder("utf8");
  constructor(
    private emit: (m: RpcMessage) => void,
    private fail: (e: Error) => void,
  ) {}
  push(chunk: Buffer | string) {
    this.pending +=
      typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    if (this.pending.length > 8 * 1024 * 1024) {
      this.pending = "";
      this.fail(Error("Protocol frame exceeds 8 MiB."));
      return;
    }
    let i;
    while ((i = this.pending.indexOf("\n")) >= 0) {
      const line = this.pending.slice(0, i).trim();
      this.pending = this.pending.slice(i + 1);
      if (!line) continue;
      try {
        const m = JSON.parse(line);
        if (!m || typeof m !== "object" || Array.isArray(m)) throw Error();
        this.emit(m);
      } catch {
        this.fail(Error("Malformed app-server protocol message."));
      }
    }
  }
}
export function safeError(e: unknown): string {
  return (e instanceof Error ? e.message : String(e))
    .replace(/https?:\/\/[^\s"<>]+/g, "[URL omitted]")
    .replace(/(?:Bearer\s+|sk-)[A-Za-z0-9._-]+/gi, "[credential omitted]")
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[credential omitted]",
    )
    .slice(0, 800);
}
export class RpcClient extends EventEmitter {
  child?: ChildProcessWithoutNullStreams;
  private next = 0;
  private pending = new Map<
    string,
    {
      resolve: (r: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private responses = new Map<string, Promise<any>>();
  private ended = false;
  private startupError = "";
  start(
    executable: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ) {
    if (this.child) throw Error("Process already started.");
    this.ended = false;
    this.child = spawn(executable, args, {
      cwd,
      env,
      stdio: "pipe",
      shell: false,
    });
    const parser = new JsonLines(
      (m) => this.receive(m),
      (e) => this.fail(e),
    );
    this.child.stdout.on("data", (b) => parser.push(b));
    this.child.stdin.on("error", (e) => this.fail(e));
    // Stderr is diagnostics only; never forward potentially sensitive raw runtime output.
    this.child.stderr.on("data", (b) => {
      const clean = String(b)
        .split("\n")
        .filter((l) =>
          /^(Error:|error:|invalid |unknown |expected )/.test(l.trim()),
        )
        .map((l) => safeError(l))
        .join(" ");
      if (clean) this.startupError = clean;
      this.emit("diagnostic", "Runtime emitted diagnostic output (redacted).");
    });
    this.child.on("error", (e) => this.fail(e));
    this.child.on("exit", (code, signal) =>
      this.fail(
        Error(`Codex process exited (${signal || code}). ${this.startupError}`),
      ),
    );
  }
  private receive(m: RpcMessage) {
    if (m.method) {
      if (m.id !== undefined) {
        const key = String(m.id);
        let response = this.responses.get(key);
        if (!response) {
          response = this.handle(m);
          this.responses.set(key, response);
        }
        void response.then(
          (r) => this.write({ id: m.id, result: r }),
          (e) =>
            this.write({
              id: m.id,
              error: { code: -32601, message: safeError(e) },
            }),
        );
      } else this.emit("notification", m.method, m.params);
      return;
    }
    if (m.id === undefined) return;
    const key = String(m.id),
      p = this.pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(key);
    if (m.error) p.reject(Error(m.error.message));
    else if ("result" in m) p.resolve(m.result);
    else p.reject(Error("Missing protocol response result."));
  }
  handler?: (method: string, params: any) => Promise<any>;
  private async handle(m: RpcMessage) {
    if (!this.handler) throw Error("No request handler.");
    return this.handler(m.method!, m.params);
  }
  private write(m: RpcMessage) {
    if (!this.ended && this.child?.stdin.writable)
      this.child.stdin.write(JSON.stringify(m) + "\n");
  }
  request<T = any>(
    method: string,
    params: unknown = {},
    timeout = 30000,
  ): Promise<T> {
    if (this.ended || !this.child)
      return Promise.reject(Error("Codex is disconnected."));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(String(id));
        reject(Error(`Codex ${method} timed out.`));
      }, timeout);
      this.pending.set(String(id), { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  notify(method: string, params: unknown = {}) {
    this.write({ method, params });
  }
  private fail(e: Error) {
    if (this.ended) return;
    this.ended = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
    this.emit("disconnect", safeError(e));
    this.child?.kill("SIGTERM");
  }
  close() {
    this.fail(Error("Disconnected by operator."));
    const child = this.child;
    if (child) {
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null)
          child.kill("SIGKILL");
      }, 1500).unref();
    }
    this.removeAllListeners();
  }
}
