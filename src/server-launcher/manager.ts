/**
 * 서버 프로세스 관리 (Electron과 분리 → 자동 테스트 가능)
 * - 시작 / 정지 / 명령어 / 접속자 목록
 * - 크래시·알 수 없는 종료 → 자동 재시작 (짧은 시간에 연속이면 멈추고 알림)
 * - 새 팩: 미리 받기 → 공지·30초 카운트다운 → 전원 킥 → 정지 → 월드 백업 → 교체 → 재시작
 */
import { EventEmitter } from "events";
import { ChildProcess, spawn as nodeSpawn, SpawnOptions } from "child_process";

export type Phase = "stopped" | "preparing" | "starting" | "running" | "stopping" | "updating" | "restarting";

export type Level = "info" | "warn" | "error" | "success";
/** 화면에서 번역할 알림 (key는 renderer/i18n.js의 "n." 항목) */
export interface Notice {
  level: Level;
  key: string;
  vars?: Record<string, string | number>;
}

export interface LaunchSpec {
  command: string;
  args: string[];
  cwd: string;
  packVersion: string;
  minecraft: string;
  notices?: Notice[];
}

export interface UpdateCheck {
  /** restart / minecraft-upgrade = 재시작 필요, pack-only = 기록만, offline = 확인 못 함 */
  kind: "none" | "install" | "pack-only" | "restart" | "minecraft-upgrade" | "downgrade" | "offline";
  from?: string;
  to?: string;
  fromMc?: string;
  toMc?: string;
}

export interface ManagerDeps {
  /** 팩 확인·설치 후 실행할 명령 */
  prepare(progress: ProgressFn): Promise<LaunchSpec>;
  /** 새 팩 확인 */
  check(): Promise<UpdateCheck>;
  /** 서버를 끄기 전에 새 파일 미리 받기 */
  prefetch(progress: ProgressFn): Promise<void>;
  /** 서버 쪽은 그대로인 팩 업데이트: 기록만 바꿈 */
  recordPackOnly(): Promise<void>;
  /** 월드 백업 → 백업 폴더 (월드가 없으면 null) */
  backup(label: string): Promise<string | null>;
  /** 게임 안에 보낼 글 (공지·킥 사유) */
  text(key: "announce" | "countdown" | "kick", vars?: Record<string, string | number>): string;
  spawn?: (command: string, args: string[], opts: SpawnOptions) => ChildProcess;
}

export type ProgressFn = (label: string, done: number, total: number) => void;

export interface Timings {
  countdownSec: number;
  /** 카운트다운 중 공지할 남은 초 */
  announceAt: number[];
  stopTimeoutMs: number;
  restartDelayMs: number;
  /** crashWindowMs 안에 maxCrashes번 비정상 종료하면 자동 재시작 멈춤 */
  crashWindowMs: number;
  maxCrashes: number;
  /** 자동 시작(재시작·업데이트)에서 준비가 실패했을 때 다시 시도 */
  retryDelayMs: number;
  maxRetries: number;
}

export const DEFAULT_TIMINGS: Timings = {
  countdownSec: 30,
  announceAt: [30, 20, 10, 5, 4, 3, 2, 1],
  stopTimeoutMs: 120_000,
  restartDelayMs: 5_000,
  crashWindowMs: 10 * 60_000,
  maxCrashes: 3,
  retryDelayMs: 60_000,
  maxRetries: 5,
};

export interface Snapshot {
  phase: Phase;
  players: string[];
  packVersion?: string;
  minecraft?: string;
  startedAt?: number;
  /** 업데이트 카운트다운 남은 초 */
  countdown?: number;
  /** 업데이트 중이면 목표 팩 버전 */
  updatingTo?: string;
  /** 연속 크래시로 자동 재시작을 멈춤 */
  halted: boolean;
  pid?: number;
}

// 로그 앞부분: "[12:00:00] [Server thread/INFO]: " 또는 "... (Minecraft) " — 채팅("<이름> ...")은 걸리지 않게 바로 뒤를 봄
const DONE_RE = /Done \([\d.,]+s\)!/;
const JOIN_RE = /(?:\]:|\))\s([A-Za-z0-9_]{1,16}) joined the game\s*$/;
const LEFT_RE = /(?:\]:|\))\s([A-Za-z0-9_]{1,16}) left the game\s*$/;
/** /stop 명령 (콘솔: "Stopping the server", 게임 안 관리자: "[Steve: Stopping the server]") */
const STOP_CMD_RE = /(?:\]:|\))\s(\[[A-Za-z0-9_]{1,16}: )?Stopping the server\]?\s*$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 바이트 줄 → 글자 (UTF-8이 아니면 한국어 Windows 기본(CP949)으로) */
const utf8 = new TextDecoder("utf-8", { fatal: true });
let cp949: TextDecoder | null = null;
export function decodeLine(bytes: Buffer): string {
  try {
    return utf8.decode(bytes);
  } catch {
    try {
      cp949 ??= new TextDecoder("euc-kr");
      return cp949.decode(bytes);
    } catch {
      return bytes.toString("latin1");
    }
  }
}

export declare interface ServerManager {
  on(e: "phase", fn: (s: Snapshot) => void): this;
  on(e: "line", fn: (line: string) => void): this;
  on(e: "players", fn: (players: string[]) => void): this;
  on(e: "notice", fn: (n: Notice) => void): this;
  on(e: "progress", fn: (p: { label: string; done: number; total: number }) => void): this;
}

export class ServerManager extends EventEmitter {
  private child: ChildProcess | null = null;
  private phase: Phase = "stopped";
  private players = new Set<string>();
  private spec?: LaunchSpec;
  private startedAt?: number;
  private countdown?: number;
  private updatingTo?: string;
  private halted = false;
  private crashTimes: number[] = [];
  private retries = 0;
  /** 운영자가 켜 두길 원함 (정지 버튼·stop 명령이면 false) */
  private wanted = false;
  /** 지금 종료는 우리가(정지·업데이트) 시킨 것 */
  private expectingExit = false;
  /** 서버 안에서 /stop이 실행됨 → 운영자 정지로 봄 */
  private stopCommandSeen = false;
  private exitWaiters: (() => void)[] = [];
  private timer: NodeJS.Timeout | null = null;
  private cancelCountdown = false;
  private updating = false;
  private lastDowngradeNotice?: string;
  private readonly t: Timings;
  private readonly spawnFn: NonNullable<ManagerDeps["spawn"]>;

  constructor(private deps: ManagerDeps, timings: Partial<Timings> = {}) {
    super();
    this.t = { ...DEFAULT_TIMINGS, ...timings };
    this.spawnFn = deps.spawn ?? nodeSpawn;
  }

  snapshot(): Snapshot {
    return {
      phase: this.phase,
      players: [...this.players].sort((a, b) => a.localeCompare(b)),
      packVersion: this.spec?.packVersion,
      minecraft: this.spec?.minecraft,
      startedAt: this.phase === "running" ? this.startedAt : undefined,
      countdown: this.countdown,
      updatingTo: this.updatingTo,
      halted: this.halted,
      pid: this.child?.pid,
    };
  }

  get isRunning() { return this.child !== null; }
  get playerCount() { return this.players.size; }
  get busy() { return this.updating || !["stopped", "running"].includes(this.phase); }

  private setPhase(p: Phase) {
    this.phase = p;
    this.emit("phase", this.snapshot());
  }
  private notice(level: Level, key: string, vars?: Record<string, string | number>) {
    this.emit("notice", { level, key, vars });
  }
  private progress: ProgressFn = (label, done, total) => this.emit("progress", { label, done, total });

  /** 시작 버튼 */
  async start() {
    if (this.phase !== "stopped") return;
    this.wanted = true;
    this.halted = false;
    this.crashTimes = [];
    this.retries = 0;
    await this.launch(false);
  }

  /** 정지 버튼 (재시작 안 함) */
  async stop() {
    this.wanted = false;
    this.cancelCountdown = true;
    this.clearTimer();
    if (this.phase === "restarting") return this.setPhase("stopped");
    if (!this.child) return;
    await this.stopProcess();
  }

  /** 재시작 버튼 */
  async restart() {
    if (this.updating) return;
    this.clearTimer();
    if (this.child) {
      this.wanted = false;
      this.cancelCountdown = true;
      await this.stopProcess();
    }
    if (this.phase === "restarting") this.setPhase("stopped");
    if (this.phase === "stopped") await this.start();
  }

  /** 명령어 입력창 */
  command(text: string) {
    const cmd = text.trim().replace(/^\//, "");
    if (!cmd || !this.child?.stdin?.writable) return false;
    if (/^stop\s*$/i.test(cmd)) this.wanted = false; // 직접 stop = 정지 버튼과 같음
    this.child.stdin.write(cmd + "\n");
    return true;
  }

  /** 서버를 정지·대기 상태로 두고 끝낼 때 (런처 종료·런처 업데이트) */
  async shutdown() {
    this.wanted = false;
    this.cancelCountdown = true;
    this.clearTimer();
    if (this.child) await this.stopProcess();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async launch(auto: boolean) {
    this.setPhase("preparing");
    let spec: LaunchSpec;
    try {
      spec = await this.deps.prepare(this.progress);
    } catch (e: any) {
      this.progress("", 0, 0);
      this.notice("error", "n.prepareFail", { msg: e?.message ?? String(e) });
      if (auto && this.wanted && this.retries < this.t.maxRetries) {
        this.retries++;
        this.notice("warn", "n.retry", { sec: Math.round(this.t.retryDelayMs / 1000), n: this.retries, max: this.t.maxRetries });
        this.setPhase("restarting");
        this.timer = setTimeout(() => this.launch(true), this.t.retryDelayMs);
      } else {
        if (auto) this.haltNow();
        this.setPhase("stopped");
      }
      return;
    }
    this.progress("", 0, 0);
    if (!this.wanted) return this.setPhase("stopped"); // 준비 중에 정지를 누름
    this.retries = 0;
    this.spec = spec;
    for (const n of spec.notices ?? []) this.emit("notice", n);
    this.spawnServer(spec);
  }

  private spawnServer(spec: LaunchSpec) {
    this.players.clear();
    this.emit("players", []);
    this.expectingExit = false;
    this.stopCommandSeen = false;
    this.setPhase("starting");
    let child: ChildProcess;
    try {
      child = this.spawnFn(spec.command, spec.args, { cwd: spec.cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (e: any) {
      this.notice("error", "n.spawnFail", { msg: e?.message ?? String(e) });
      return this.onExit(-1);
    }
    this.child = child;
    const reader = () => {
      let rest = Buffer.alloc(0);
      return (buf: Buffer) => {
        rest = Buffer.concat([rest, buf]);
        let i: number;
        while ((i = rest.indexOf(10)) >= 0) {
          let line = rest.subarray(0, i);
          rest = rest.subarray(i + 1);
          if (line.length && line[line.length - 1] === 13) line = line.subarray(0, line.length - 1);
          this.onLine(decodeLine(line));
        }
      };
    };
    child.stdout?.on("data", reader());
    child.stderr?.on("data", reader());
    child.stdin?.on("error", () => {});
    let exited = false;
    child.on("error", (e) => {
      if (exited) return;
      exited = true;
      this.notice("error", "n.spawnFail", { msg: e.message });
      this.onExit(-1);
    });
    child.on("exit", (code, signal) => {
      if (exited) return;
      exited = true;
      this.onExit(code ?? signal ?? null);
    });
  }

  private onLine(line: string) {
    this.emit("line", line);
    if (this.phase === "starting" && DONE_RE.test(line)) {
      this.startedAt = Date.now();
      this.setPhase("running");
      this.notice("success", "n.started", { pack: this.spec?.packVersion ?? "?" });
      return;
    }
    let m = JOIN_RE.exec(line);
    if (m) {
      this.players.add(m[1]);
      return this.emit("players", this.snapshot().players);
    }
    m = LEFT_RE.exec(line);
    if (m) {
      this.players.delete(m[1]);
      return this.emit("players", this.snapshot().players);
    }
    if (STOP_CMD_RE.test(line)) this.stopCommandSeen = true;
  }

  private onExit(code: number | string | null) {
    this.child = null;
    this.players.clear();
    this.emit("players", []);
    const waiters = this.exitWaiters;
    this.exitWaiters = [];
    const planned = this.expectingExit || this.stopCommandSeen || !this.wanted;
    if (this.stopCommandSeen && !this.expectingExit) this.wanted = false;
    this.expectingExit = false;
    if (waiters.length) {
      waiters.forEach((w) => w());
      return; // 정지·업데이트 쪽에서 이어서 처리
    }
    if (planned) {
      this.notice("info", "n.stopped");
      return this.setPhase("stopped");
    }
    // 크래시 또는 알 수 없는 종료
    const now = Date.now();
    this.crashTimes = [...this.crashTimes.filter((t) => now - t < this.t.crashWindowMs), now];
    if (this.crashTimes.length >= this.t.maxCrashes) {
      this.haltNow();
      return this.setPhase("stopped");
    }
    this.notice("warn", "n.crashed", { code: code ?? "?", sec: Math.round(this.t.restartDelayMs / 1000) });
    this.setPhase("restarting");
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.wanted && this.phase === "restarting") this.launch(true);
    }, this.t.restartDelayMs);
  }

  private haltNow() {
    this.halted = true;
    this.wanted = false;
    this.notice("error", "n.crashLoop", { n: this.t.maxCrashes, min: Math.round(this.t.crashWindowMs / 60000) });
  }

  /** stop 명령 → 기다림 → 오래 걸리면 강제 종료 */
  private stopProcess(): Promise<void> {
    const child = this.child;
    if (!child) return Promise.resolve();
    const done = new Promise<void>((r) => this.exitWaiters.push(r));
    if (this.phase !== "stopping") {
      this.expectingExit = true;
      if (this.phase !== "updating") this.setPhase("stopping");
      if (child.stdin?.writable) child.stdin.write("stop\n");
      else child.kill();
      const killer = setTimeout(() => {
        if (this.child === child) {
          this.notice("warn", "n.forceKill");
          child.kill("SIGKILL");
        }
      }, this.t.stopTimeoutMs);
      done.then(() => {
        clearTimeout(killer);
        if (this.phase === "stopping") {
          this.notice("info", "n.stopped");
          this.setPhase("stopped");
        }
      });
    }
    return done;
  }

  private tellAll(text: string) {
    this.command(`tellraw @a ${JSON.stringify({ text: `[MMCraft] ${text}`, color: "yellow" })}`);
  }

  /** 주기적으로 호출: 새 팩이 있으면 업데이트 */
  async checkForUpdate(): Promise<UpdateCheck | null> {
    if (this.updating || this.phase === "preparing" || this.phase === "starting" || this.phase === "stopping" || this.phase === "restarting") return null;
    let c: UpdateCheck;
    try {
      c = await this.deps.check();
    } catch {
      return null;
    }
    if (c.kind === "downgrade") {
      if (this.lastDowngradeNotice !== c.to) this.notice("error", "n.downgrade", { from: c.fromMc ?? "?", to: c.toMc ?? "?" });
      this.lastDowngradeNotice = c.to;
      return c;
    }
    if (c.kind === "pack-only" && !this.busy) {
      await this.deps.recordPackOnly().catch(() => {});
      if (this.spec && c.to) this.spec.packVersion = c.to;
      this.notice("info", "n.packOnly", { from: c.from ?? "?", to: c.to ?? "?" });
      this.emit("phase", this.snapshot());
      return c;
    }
    // 꺼져 있으면 다음 시작 때 자동으로 맞춤
    if ((c.kind === "restart" || c.kind === "minecraft-upgrade") && this.phase === "running" && !this.busy) {
      await this.runUpdate(c);
    }
    return c;
  }

  private async runUpdate(c: UpdateCheck) {
    this.updating = true;
    this.cancelCountdown = false;
    this.updatingTo = c.to;
    try {
      this.notice("info", c.kind === "minecraft-upgrade" ? "n.updateFoundMc" : "n.updateFound", {
        from: c.from ?? "?", to: c.to ?? "?", fromMc: c.fromMc ?? "?", toMc: c.toMc ?? "?",
      });
      this.emit("phase", this.snapshot());

      // 1) 켜 둔 채로 미리 받기
      try {
        await this.deps.prefetch(this.progress);
      } catch (e: any) {
        this.notice("error", "n.prefetchFail", { msg: e?.message ?? String(e) });
        return;
      } finally {
        this.progress("", 0, 0);
      }
      if (this.phase !== "running" || this.cancelCountdown) return;

      // 2) 접속자가 있으면 공지 + 카운트다운
      if (this.players.size > 0) {
        this.tellAll(this.deps.text("announce", { sec: this.t.countdownSec, to: c.to ?? "" }));
        this.notice("info", "n.announced", { n: this.players.size, sec: this.t.countdownSec });
        for (let s = this.t.countdownSec; s > 0; s--) {
          if (this.cancelCountdown || this.phase !== "running") return;
          this.countdown = s;
          this.emit("phase", this.snapshot());
          if (s !== this.t.countdownSec && this.t.announceAt.includes(s)) this.tellAll(this.deps.text("countdown", { sec: s }));
          await sleep(1000);
        }
        this.countdown = undefined;
        if (this.cancelCountdown || this.phase !== "running") return;
        // 3) 전원 킥 (밴 아님)
        this.command(`kick @a ${this.deps.text("kick")}`);
        this.notice("info", "n.kicked");
        await sleep(1000);
      }

      // 4) 정지 → 백업 → 교체(준비 단계) → 재시작
      this.setPhase("updating");
      await this.stopProcess();
      if (this.cancelCountdown) {
        // 업데이트 도중 운영자가 정지를 누름 → 켜지 않음 (다음 시작 때 새 팩으로 맞춤)
        this.notice("info", "n.stopped");
        return this.setPhase("stopped");
      }
      try {
        const where = await this.deps.backup(`${c.from ?? "old"}-to-${c.to ?? "new"}`);
        if (where) this.notice("info", "n.backupDone", { path: where });
      } catch (e: any) {
        // 백업이 안 되면 바꾸지 않고 예전 버전 그대로 다시 켬 (월드 보호)
        this.notice("error", "n.backupFail", { msg: e?.message ?? String(e) });
        this.updating = false;
        this.updatingTo = undefined;
        if (this.spec) return this.spawnServer(this.spec);
        return this.setPhase("stopped");
      }
      this.wanted = true;
      this.retries = 0;
      await this.launch(true);
      if (this.spec?.packVersion === c.to) this.notice("success", "n.updated", { to: c.to ?? "?" });
    } finally {
      this.updating = false;
      this.updatingTo = undefined;
      this.countdown = undefined;
      this.emit("phase", this.snapshot());
    }
  }
}
