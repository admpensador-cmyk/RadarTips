import Link from "next/link";

export default function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const locale = params.locale;

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <Link href={`/${locale}/radar/day`} className="text-lg font-semibold tracking-tight">
          RadarTips <span className="text-white/50">•</span> <span className="text-white/70">Radar</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm text-white/70">
          <Link className="rounded-lg px-2 py-1 hover:bg-white/10" href={`/en/radar/day`}>EN</Link>
          <Link className="rounded-lg px-2 py-1 hover:bg-white/10" href={`/pt/radar/day`}>PT</Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        {children}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-white/40">
        RadarTips © {new Date().getFullYear()} • Dados via snapshots (R2)
      </footer>
    </div>
  );
}
