import * as path from "path";
import * as os from "os";

/** 런처 데이터 폴더 구조 (Windows: %APPDATA%\.mmcraft) */
export class Layout {
  /** gameDir: 테스트용으로 게임 폴더만 따로 둘 때 */
  constructor(public root: string, private gameDir?: string) {}

  static default(): Layout {
    if (process.env.MMCRAFT_HOME) return new Layout(process.env.MMCRAFT_HOME);
    const base =
      process.platform === "win32"
        ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
        : process.platform === "darwin"
          ? path.join(os.homedir(), "Library", "Application Support")
          : os.homedir();
    return new Layout(path.join(base, ".mmcraft"));
  }

  get libraries() { return path.join(this.root, "libraries"); }
  get assets() { return path.join(this.root, "assets"); }
  get versions() { return path.join(this.root, "versions"); }
  get runtimes() { return path.join(this.root, "runtime"); }
  get cache() { return path.join(this.root, "cache"); }
  get backups() { return path.join(this.root, "backups"); }
  get logs() { return path.join(this.root, "logs"); }
  /** 게임 폴더 (mods, config, saves, options.txt ...) */
  get game() { return this.gameDir ?? path.join(this.root, "game"); }
  get mods() { return path.join(this.game, "mods"); }
  get saves() { return path.join(this.game, "saves"); }
  get state() { return path.join(this.root, "state.json"); }
  get settings() { return path.join(this.root, "settings.json"); }
  get account() { return path.join(this.root, "account.dat"); }
  versionDir(id: string) { return path.join(this.versions, id); }
  versionJar(id: string) { return path.join(this.versions, id, `${id}.jar`); }
  versionJson(id: string) { return path.join(this.versions, id, `${id}.json`); }
  natives(id: string) { return path.join(this.versions, id, "natives"); }
}

/** maven 좌표 → 경로 (group:artifact:version[:classifier][@ext]) */
export function mavenPath(name: string): string {
  let ext = "jar";
  let coord = name;
  const at = coord.indexOf("@");
  if (at >= 0) {
    ext = coord.slice(at + 1);
    coord = coord.slice(0, at);
  }
  const [group, artifact, version, classifier] = coord.split(":");
  const file = `${artifact}-${version}${classifier ? "-" + classifier : ""}.${ext}`;
  return [...group.split("."), artifact, version, file].join("/");
}
