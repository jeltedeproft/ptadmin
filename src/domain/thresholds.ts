import type { Settings } from "../db/schema";

export type ThresholdLevel = "ok" | "waarschuwing" | "kritiek" | "overschreden";

export const LEVEL_LABEL: Record<ThresholdLevel, string> = {
  ok: "In orde",
  waarschuwing: "Waarschuwing",
  kritiek: "Kritiek",
  overschreden: "Overschreden",
};

export interface ThresholdStatus {
  used: number;
  limit: number;
  ratio: number;
  remaining: number;
  level: ThresholdLevel;
}

function levelFor(ratio: number, warn: number, critical: number): ThresholdLevel {
  if (ratio >= 1) return "overschreden";
  if (ratio >= critical) return "kritiek";
  if (ratio >= warn) return "waarschuwing";
  return "ok";
}

/**
 * Art. 56bis small-business VAT exemption. The workbook keeps a safety margin
 * below the legal threshold so there is room to finish the year without
 * tripping over it — the effective ceiling is threshold − margin.
 */
export function vatStatus(yearRevenue: number, s: Settings): ThresholdStatus {
  const limit = s.vatThreshold - s.vatSafetyMargin;
  const ratio = limit > 0 ? yearRevenue / limit : 0;
  return {
    used: yearRevenue,
    limit,
    ratio,
    remaining: limit - yearRevenue,
    level: levelFor(ratio, s.warnRatio, s.criticalRatio),
  };
}

export interface SocialStatus extends ThresholdStatus {
  netProfit: number;
  /** Below this, social contributions can be waived (bijberoep). */
  exemptionThreshold: number;
  exempt: boolean;
}

/**
 * Social-contribution bands for a self-employed bijberoep. Net profit is
 * revenue minus the estimated business costs kept in Instellingen; the
 * main-occupation threshold is what the ratio is measured against.
 */
export function socialStatus(yearRevenue: number, s: Settings): SocialStatus {
  const netProfit = Math.max(0, yearRevenue - s.estimatedBusinessCosts);
  const limit = s.socialMainOccupationThreshold;
  const ratio = limit > 0 ? netProfit / limit : 0;
  return {
    used: netProfit,
    netProfit,
    limit,
    ratio,
    remaining: limit - netProfit,
    exemptionThreshold: s.socialExemptionThreshold,
    exempt: netProfit < s.socialExemptionThreshold,
    level: levelFor(ratio, s.warnRatio, s.criticalRatio),
  };
}
