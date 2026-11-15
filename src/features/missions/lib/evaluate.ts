import type { Kind, LabDocument, TraceResult } from "../../../shared/document";
import { labels } from "../../../shared/document";
/**
 * 每个实验要求光线“实际经过”的器件类型。
 * 判定依据是到屏光线自身的经过记录，场景中仅仅存在目标器件不算有效证据。
 */
const required: Record<string, Kind> = {
  focus: "lens",
  reflection: "mirror",
  refraction: "prism",
};
/** 各实验的通过阈值（保持原有数值不变） */
const thresholds: Record<string, { ratio: number; rms?: number }> = {
  focus: { ratio: 0.8, rms: 3 },
  reflection: { ratio: 0.8 },
  refraction: { ratio: 0.6 },
};
export function evaluateMission(
  id: string,
  doc: LabDocument,
  result: TraceResult,
) {
  const energy = doc.items
    .filter((e) => e.kind === "source")
    .reduce((s, e) => s + e.power, 0);
  const kind = required[id];
  const threshold = thresholds[id] ?? { ratio: 1 };
  // 当前布局中真实存在的目标器件
  const targets = new Set(
    doc.items.filter((e) => e.kind === kind).map((e) => e.id),
  );
  // 有效命中：光线自身的路径真实经过目标器件、并最终到达接收屏。
  // 有效能量 = 这些命中各自功率之和（直射、绕行的光线不计入）。
  const valid = result.hits.filter((h) => h.path.some((p) => targets.has(p)));
  const received = valid.reduce((s, h) => s + h.power, 0);
  const center = received
    ? valid.reduce((s, h) => s + h.position * h.power, 0) / received
    : 0;
  const rms = received
    ? Math.sqrt(
        valid.reduce((s, h) => s + (h.position - center) ** 2 * h.power, 0) /
          received,
      )
    : Infinity;
  const ratio = energy ? received / energy : 0;
  const complete =
    ratio >= threshold.ratio &&
    (threshold.rms === undefined || rms <= threshold.rms);
  // 未完成时给出与当前布局一致的原因
  let reason = "";
  if (!complete) {
    const label = labels[kind];
    if (targets.size === 0)
      reason = `场景中没有${label}，请添加器件或撤销恢复`;
    else if (valid.length === 0)
      reason = `尚无光线经过${label}后到达接收屏`;
    else if (ratio < threshold.ratio)
      reason = `经过${label}的有效能量仅 ${(ratio * 100).toFixed(0)}%，需 ≥ ${threshold.ratio * 100}%`;
    else
      reason = `光斑 RMS 半径 ${rms.toFixed(2)} mm，需 ≤ ${threshold.rms} mm`;
  }
  return {
    complete,
    ratio,
    rms,
    reason,
    progress: Math.min(
      1,
      threshold.rms === undefined
        ? ratio / threshold.ratio
        : Math.min(
            ratio / threshold.ratio,
            threshold.rms / Math.max(threshold.rms, rms),
          ),
    ),
  };
}
