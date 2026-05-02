// class_name 필드의 영문 잔존을 한글로 일괄 보정
import fs from "fs";
import path from "path";

const envFile = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

import { getDb } from "../lib/db";

// 현재 DB 에 들어가있는 영문 라벨 → 한글
const CLASS_MAP: Record<string, string> = {
  // 라틴 학명 클래스
  Mammalia: "포유류",
  mammal: "포유류",
  Aves: "조류",
  bird: "조류",
  Reptilia: "파충류",
  reptile: "파충류",
  Amphibia: "양서류",
  amphibian: "양서류",
  Actinopterygii: "어류 (조기어류)",
  Actinopteri: "어류 (조기어류)",
  Teleostei: "어류 (경골어류)",
  fish: "어류",
  Chondrichthyes: "어류 (연골어류)",
  Sarcopterygii: "어류 (육기어류)",
  Insecta: "곤충",
  insect: "곤충",
  Arachnida: "거미류",
  Malacostraca: "갑각류",
  Gastropoda: "복족류",
  Bivalvia: "이매패류",
  Cephalopoda: "두족류",
  Anthozoa: "산호류",
  Hexacorallia: "산호류 (육방산호)",
  Octocorallia: "산호류 (팔방산호)",
  Hydrozoa: "히드라류",
  Scyphozoa: "해파리류",
  // 식물·균류·이끼
  Magnoliopsida: "식물 (쌍떡잎)",
  Liliopsida: "식물 (외떡잎)",
  Pinopsida: "식물 (침엽수)",
  Coniferae: "식물 (침엽수)",
  Polypodiopsida: "양치식물",
  Equisetopsida: "양치식물 (속새류)",
  Bryopsida: "선태식물",
  Jungermanniopsida: "이끼류 (우산이끼)",
  Marchantiopsida: "이끼류 (우산이끼)",
  Cycadopsida: "식물 (소철)",
  Ginkgoopsida: "식물 (은행)",
  Lecanoromycetes: "지의류",
  Agaricomycetes: "버섯류",
  // 기타
  Cestoda: "촌충류",
  Trematoda: "흡충류",
  Polychaeta: "다모류",
  Clitellata: "환형동물",
  Echinoidea: "성게류",
  Asteroidea: "불가사리류",
  Crinoidea: "바다나리류",
  Holothuroidea: "해삼류",
  Polyplacophora: "다판류",
};

function main() {
  const db = getDb();
  const update = db.prepare("UPDATE species SET class_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");

  // 현재 DB 에 있는 모든 class_name 값 확인
  const distinct = db
    .prepare("SELECT class_name, COUNT(*) as n FROM species WHERE class_name IS NOT NULL GROUP BY class_name ORDER BY n DESC")
    .all() as { class_name: string; n: number }[];

  console.log("=== 현재 class_name 분포 ===");
  for (const d of distinct) console.log(`  ${d.class_name}: ${d.n}`);

  let totalFixed = 0;
  for (const [from, to] of Object.entries(CLASS_MAP)) {
    if (from === to) continue;
    const rows = db.prepare("SELECT id FROM species WHERE class_name = ?").all(from) as { id: string }[];
    if (rows.length === 0) continue;
    const tx = db.transaction((items: typeof rows) => {
      for (const r of items) update.run(to, r.id);
    });
    tx(rows);
    console.log(`  ${from} → ${to}: ${rows.length}건`);
    totalFixed += rows.length;
  }

  console.log(`\n✓ ${totalFixed}건 수정`);

  console.log("\n=== 수정 후 분포 ===");
  const after = db
    .prepare("SELECT class_name, COUNT(*) as n FROM species WHERE class_name IS NOT NULL GROUP BY class_name ORDER BY n DESC")
    .all() as { class_name: string; n: number }[];
  for (const d of after) console.log(`  ${d.class_name}: ${d.n}`);
}

main();
