export type Locale = "en" | "pt" | "es" | "fr" | "de";

export const LOCALES: Locale[] = ["en", "pt", "es", "fr", "de"];

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}

export function localeLabel(locale: Locale): string {
  switch (locale) {
    case "pt":
      return "Português";
    case "es":
      return "Español";
    case "fr":
      return "Français";
    case "de":
      return "Deutsch";
    default:
      return "English";
  }
}
