import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function RadarHeader({
  locale,
  generatedAt,
  isMock,
}: {
  locale: string;
  generatedAt?: string | null;
  isMock?: boolean;
}) {
  const date = generatedAt ? new Date(generatedAt) : null;
  const label = date ? date.toLocaleString(locale) : "—";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Radar do Dia</h1>
          <p className="text-sm text-white/60">Atualização: {label}</p>
        </div>
        <div className="flex items-center gap-2">
          {isMock ? <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-200">MOCK</Badge> : null}
          <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200">LIVE</Badge>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/70">
          <span className="font-medium text-white/90">Atalhos:</span>
          <Link className="rounded-lg px-2 py-1 hover:bg-white/10" href={`/${locale}/radar/day`}>Dia</Link>
          <Link className="rounded-lg px-2 py-1 hover:bg-white/10" href={`/${locale}/radar/week`}>Semana</Link>
          <span className="text-white/30">•</span>
          <a className="rounded-lg px-2 py-1 hover:bg-white/10" href="/" target="_blank" rel="noreferrer">Site legado</a>
        </div>
      </Card>
    </div>
  );
}
