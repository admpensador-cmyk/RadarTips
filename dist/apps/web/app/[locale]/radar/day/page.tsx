import { RadarHeader } from "@/components/radar/radar-header";
import { EmptyState } from "@/components/radar/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchRadarDay } from "@/lib/fetch-radar";

export default async function RadarDayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = rawLocale || "en";

  let payload;
  try {
    payload = await fetchRadarDay();
  } catch (e) {
    return (
      <div className="space-y-6">
        <RadarHeader locale={locale} generatedAt={null} isMock={false} />
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold">Erro ao carregar</h3>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/70">
              Não foi possível buscar o JSON do Radar. Verifique a variável{" "}
              <span className="font-mono">RADARTIPS_DATA_BASE_URL</span>.
            </p>
            <p className="mt-2 text-xs text-white/40">
              {String((e as Error)?.message ?? e)}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { meta, matches, highlights } = payload;

  return (
    <div className="space-y-6">
      <RadarHeader
        locale={locale}
        generatedAt={meta?.generated_at ?? null}
        isMock={meta?.is_mock}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Top picks</h2>
              <Badge className="text-white/70">PRO</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-white/60">
              (Layout pronto) Quando os highlights vierem preenchidos, eles aparecem aqui como cards premium.
            </p>
            <div className="mt-4 grid gap-3">
              {highlights?.length ? (
                highlights.map((h: any, idx: number) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-white/10 bg-white/5 p-3"
                  >
                    <div className="text-sm font-medium">{h.title ?? "Pick"}</div>
                    <div className="text-xs text-white/60">{h.subtitle ?? "—"}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">
                  Sem destaques hoje.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Resumo</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-white/70">
              <div className="flex items-center justify-between">
                <span>Jogos no radar</span>
                <span className="font-semibold text-white">{matches?.length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Idioma</span>
                <span className="font-semibold text-white">{locale.toUpperCase()}</span>
              </div>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                Dica: defina <span className="font-mono">RADARTIPS_DATA_BASE_URL</span> para apontar pro seu R2/CDN.
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Todos os jogos</h2>
          <span className="text-xs text-white/50">(tabela responsiva vem no próximo commit)</span>
        </div>

        {!matches?.length ? (
          <EmptyState locale={locale} />
        ) : (
          <Card>
            <CardContent>
              <pre className="text-xs text-white/60">
                {JSON.stringify(matches.slice(0, 3), null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
