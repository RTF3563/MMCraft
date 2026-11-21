// 서버 최적화·안정화 후보 모드의 26.3 Fabric 지원 확인 (Modrinth + CurseForge)
const MC = "26.3";
const UA = { "User-Agent": "RTF3563/MMCraft-research (github.com/RTF3563/MMCraft)" };
const CF_KEY = (process.env.CF_API_KEY || "").trim();
const cands = [
  ["c2me-fabric", "c2me"], ["scalablelux", "scalablelux"], ["krypton", "krypton"], ["chunky", "chunky-pregenerator"],
  ["servercore", "servercore"], ["vmp-fabric", "very-many-players"], ["noisium", "noisium"], ["alternate-current", "alternate-current"],
  ["moonrise-opt", "moonrise"], ["ksyxis", "ksyxis"], ["packet-fixer", "packet-fixer"], ["neruina", "neruina"],
  ["async-locator", "async-locator"], ["fastback", "fastback"], ["lmd", "let-me-despawn"], ["clumps", "clumps"],
  ["threadtweak", "threadtweak"], ["structure-layout-optimizer", "structure-layout-optimizer"], ["ai-improvements", "ai-improvements"],
  ["chunky-border", "chunky-border"], ["fabric-carpet", "carpet"],
];
const j = async (u, h = {}) => { const r = await fetch(u, { headers: { ...UA, ...h } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const out = [];
for (const [mr, cf] of cands) {
  const row = { mr, cf };
  try {
    const p = await j(`https://api.modrinth.com/v2/project/${mr}`);
    row.title = p.title; row.client = p.client_side; row.server = p.server_side; row.desc = p.description; row.mrId = p.id;
    row.mrLatestGame = p.game_versions?.filter((g) => /^\d/.test(g) && !/[a-z]/i.test(g)).slice(-3).join(",");
    const vs = await j(`https://api.modrinth.com/v2/project/${mr}/version?loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(`["${MC}"]`)}`);
    if (vs[0]) {
      row.mr = `${mr}`; row.mrVer = `${vs[0].version_number} (${vs[0].version_type}, ${vs[0].date_published.slice(0, 10)})`;
      const deps = [];
      for (const d of vs[0].dependencies || []) if (d.dependency_type === "required" || d.dependency_type === "incompatible") deps.push(`${d.dependency_type}:${d.project_id}`);
      row.mrDeps = deps.join(" ");
    }
  } catch (e) { row.mrErr = String(e.message || e); }
  if (CF_KEY) {
    try {
      const s = await j(`https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&slug=${cf}`, { "x-api-key": CF_KEY });
      const m = s.data?.[0];
      if (m) {
        row.cfName = m.name; row.cfDist = m.allowModDistribution;
        const f = await j(`https://api.curseforge.com/v1/mods/${m.id}/files?gameVersion=${MC}&modLoaderType=4&pageSize=5`, { "x-api-key": CF_KEY });
        const ff = (f.data || []).filter((x) => x.gameVersions.includes(MC));
        if (ff[0]) row.cfVer = `${ff[0].displayName} (${ff[0].releaseType === 1 ? "release" : ff[0].releaseType === 2 ? "beta" : "alpha"}, ${ff[0].fileDate.slice(0, 10)})`;
        const latest = (m.latestFilesIndexes || []).filter((x) => x.modLoader === 4).map((x) => x.gameVersion);
        row.cfLatestGame = [...new Set(latest)].slice(0, 3).join(",");
      } else row.cfErr = "not found";
    } catch (e) { row.cfErr = String(e.message || e); }
  }
  out.push(row);
}
// 의존성 id → 이름
const ids = [...new Set(out.flatMap((r) => (r.mrDeps || "").split(" ").filter(Boolean).map((d) => d.split(":")[1])))];
if (ids.length) {
  const ps = await j(`https://api.modrinth.com/v2/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`);
  const name = Object.fromEntries(ps.map((p) => [p.id, p.slug]));
  for (const r of out) if (r.mrDeps) r.mrDeps = r.mrDeps.replace(/:(\w+)/g, (_m, id) => `:${name[id] || id}`);
}
console.log("RESULT_JSON_START");
console.log(JSON.stringify(out, null, 1));
console.log("RESULT_JSON_END");
