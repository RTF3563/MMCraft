import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
mkdirSync("dist/launcher/renderer", { recursive: true });
cpSync("src/launcher/renderer", "dist/launcher/renderer", { recursive: true });
cpSync("build/icon.png", "dist/launcher/renderer/icon.png");
// 로그인용 Azure Client ID: 환경변수(MMCRAFT_AZURE_CLIENT_ID) > src/launcher/config.json
const file = "src/launcher/config.json";
const base = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { azureClientId: "" };
const id = process.env.MMCRAFT_AZURE_CLIENT_ID || base.azureClientId || "";
writeFileSync("dist/launcher/config.json", JSON.stringify({ azureClientId: id }));

// 서버 런처 화면: 글꼴·풍경·돌 타일은 런처와 같은 파일을 씀
const sr = "dist/server-launcher/renderer";
mkdirSync(sr, { recursive: true });
cpSync("src/server-launcher/renderer", sr, { recursive: true });
for (const f of ["fonts", "scene.png", "tile.png"]) cpSync(`src/launcher/renderer/${f}`, `${sr}/${f}`, { recursive: true });
cpSync("build/server-icon.png", `${sr}/icon.png`);
