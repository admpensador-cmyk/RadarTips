"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function EmptyState({ locale }: { locale: string }) {
  const copy = {
    en: {
      title: "No matches in the Radar yet",
      body: "This usually means the daily snapshot is still generating or the competitions have no scheduled fixtures today.",
      cta: "Refresh",
    },
    pt: {
      title: "Sem jogos no Radar por enquanto",
      body: "Geralmente isso significa que o snapshot diário ainda está sendo gerado ou não há partidas nas competições hoje.",
      cta: "Atualizar",
    },
  } as const;

  const t = (copy as any)[locale] ?? copy.en;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold">{t.title}</h3>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-white/70">{t.body}</p>
        <div className="mt-4">
          <Button onClick={() => window.location.reload()}>{t.cta}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
