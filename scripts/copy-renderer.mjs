import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
mkdirSync("dist/launcher/renderer", { recursive: true });
cpSync("src/launcher/renderer", "dist/launcher/renderer", { recursive: true });
cpSync("build/icon.png", "dist/launcher/renderer/icon.png");
// 로그인용 Azure Client ID: 환경변수(MMCRAFT_AZURE_CLIENT_ID) > src/launcher/config.json
const file = "src/launcher/config.json";
const base = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { azureClientId: "" };
const id = process.env.MMCRAFT_AZURE_CLIENT_ID || base.azureClientId || "";
writeFileSync("dist/launcher/config.json", JSON.stringify({ azureClientId: id }));
