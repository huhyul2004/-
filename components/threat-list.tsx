// 위협 목록 — 종·절멸 상세 페이지. IUCN 위협은 "대분류 > 중분류 > 항목" + 코드, 시기별로 나눠 그린다.
// 수기 입력 위협(코드 없음)은 예전처럼 이름만. 묶는 규칙은 lib/threat-display.ts (챗봇과 공용).
import type { ThreatRow } from "@/lib/db";
import { splitThreats, threatPathParts } from "@/lib/threat-display";

export function ThreatList({ threats, dark = false }: { threats: ThreatRow[]; dark?: boolean }) {
  const { manual, groups } = splitThreats(threats);
  const text = dark ? "text-zinc-300" : "text-zinc-700";
  const muted = dark ? "text-zinc-500" : "text-zinc-400";
  const pastBadge = dark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-200 text-zinc-600";

  return (
    <div className="mt-2 space-y-3">
      {manual.length > 0 && (
        <ul className="space-y-1.5">
          {manual.map((t) => (
            <li key={t.id} className={`text-xs ${text}`}>
              • {t.threat_name}
              {t.severity && <span className={`ml-1 ${muted}`}>({t.severity})</span>}
            </li>
          ))}
        </ul>
      )}
      {groups.map(({ group, threats: items }) => (
        <div key={group.timing ?? "none"} className={group.past ? "opacity-75" : undefined}>
          <p className={`mb-1 text-[10px] font-bold ${muted}`}>
            {group.past && (
              <span className={`mr-1 rounded px-1 py-px text-[9px] font-black ${pastBadge}`}>과거</span>
            )}
            {group.label}
            {group.timing && <span className="ml-1 font-mono font-normal">({group.timing})</span>}
            <span className="ml-1 font-normal">· {items.length}</span>
          </p>
          <ul className="space-y-1.5">
            {items.map((t) => {
              const parts = threatPathParts(t);
              const leaf = parts[parts.length - 1];
              const ancestors = parts.slice(0, -1);
              return (
                <li key={t.id} className={`text-xs ${group.past ? muted : text}`}>
                  {ancestors.length > 0 && <span className={muted}>{ancestors.join(" > ")} &gt; </span>}
                  <span className={group.past ? undefined : "font-medium"}>{leaf}</span>
                  <span className={`ml-1.5 font-mono text-[10px] ${muted}`} title="IUCN 위협 분류 코드">
                    {t.threat_code}
                  </span>
                  {t.severity && <span className={`ml-1 text-[10px] ${muted}`}>· {t.severity}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
