/** 지금 pack/ 상태 그대로 실행 테스트 */
import { testPack } from "./tester";
import { readMods, readPack } from "./source";

async function main() {
  const pack = readPack();
  if (readMods().length === 0) {
    console.log("❌ pack/mods.json이 비어 있음 → 먼저 'CurseForge 가져오기'를 실행하세요");
    process.exit(1);
  }
  const r = await testPack({ minecraft: pack.minecraft, fabricLoader: pack.fabricLoader, mods: readMods(), label: "current" });
  console.log(r.ok ? `✅ ${r.reason}` : `❌ ${r.stage}: ${r.reason} (로그: ${r.logFile ?? "-"})`);
  process.exit(r.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
