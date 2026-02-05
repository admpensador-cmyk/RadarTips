import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { RadarMatch } from "@/lib/radar-types";
import { ArrowRight, Lock } from "lucide-react";

function pct(v?: number) {
  if (typeof v !== "number") return "—";
  return `${Math.round(v * 100)}%`;
}

function num(v?: number) {
  if (typeof v !== "number") return "—";
  const rounded = Math.round(v * 100) / 100;
  return `${rounded}`;
}

export function MatchCard({ match, locked }: { match: RadarMatch; locked?: boolean }) {
  const loss = match.lose_prob;
  const ev = match.ev;

  return (
    <Card className={locked ? "relative overflow-hidden" : undefined}>
      <CardHeader className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-white/60">
            {match.country ? `${match.country} · ` : ""}
            {match.league || "League"}
          </div>
          <div className="mt-1 text-base font-semibold">
            {match.home || "Home"} <ArrowRight className="inline h-4 w-4 opacity-60" /> {match.away || "Away"}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {typeof ev === "number" ? (
            <Badge className={ev >= 0 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}>
              EV {num(ev)}
            </Badge>
          ) : null}

          {typeof loss === "number" ? (
            <Badge className={loss <= 0.45 ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200"}>
              Loss {pct(loss)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className={locked ? "opacity-30" : undefined}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/60">Market</div>
            <div className="mt-1 font-medium">{match.market || "—"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/60">Odd</div>
            <div className="mt-1 font-medium">{typeof match.odds === "number" ? match.odds.toFixed(2) : "—"}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/60">Win prob</div>
            <div className="mt-1 font-medium">{pct(match.win_prob)}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-white/60">Tip</div>
            <div className="mt-1 font-medium">{match.tips || "—"}</div>
          </div>
        </div>
      </CardContent>

      {locked && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm backdrop-blur">
            <div className="flex items-center gap-2 font-medium">
              <Lock className="h-4 w-4" /> Locked (PRO)
            </div>
            <div className="mt-1 text-white/70">Upgrade to unlock this pick.</div>
          </div>
        </div>
      )}
    </Card>
  );
}
