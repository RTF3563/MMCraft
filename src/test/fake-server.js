// 자동 테스트용 가짜 마인크래프트 서버 (콘솔 입출력만 흉내)
// 받은 명령은 FAKE_LOG 파일에 한 줄씩 기록
"use strict";
const fs = require("fs");
const log = process.env.FAKE_LOG;
const mode = process.env.FAKE_MODE || "normal";
const stamp = () => "[12:00:00] [Server thread/INFO]: ";
const say = (s) => process.stdout.write(stamp() + s + "\n");
const players = new Set();

say("Starting minecraft server version 26.3");
setTimeout(() => {
  if (mode === "crash-on-start") process.exit(1);
  say('Done (1.234s)! For help, type "help"');
  if (mode === "crash-after-start") setTimeout(() => process.exit(1), 50);
}, 60);

let buf = "";
process.stdin.on("data", (d) => {
  buf += d.toString("utf8");
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const cmd = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (log) fs.appendFileSync(log, cmd + "\n");
    const [name, ...rest] = cmd.split(" ");
    if (name === "stop") {
      say("Stopping the server");
      for (const p of players) say(`${p} left the game`);
      setTimeout(() => process.exit(0), 30);
    } else if (name === "opstop") {
      say("[Steve: Stopping the server]");
      setTimeout(() => process.exit(0), 30);
    } else if (name === "join") {
      players.add(rest[0]);
      say(`${rest[0]} joined the game`);
    } else if (name === "chat") {
      say(`<${rest[0]}> Bob joined the game`);
    } else if (name === "kick" && rest[0] === "@a") {
      for (const p of players) say(`${p} left the game`);
      players.clear();
    } else if (name === "korean") {
      say("안녕하세요 서버");
    }
  }
});
