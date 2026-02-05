export type RadarMeta = {
  is_mock?: boolean;
  generated_at?: string | null;
};

export type RadarMatch = {
  id?: number | string;
  kickoff?: string; // ISO
  league?: string;
  country?: string;
  home?: string;
  away?: string;
  home_logo?: string;
  away_logo?: string;
  market?: string;
  odds?: number;
  win_prob?: number; // 0..1
  lose_prob?: number; // 0..1
  ev?: number;
  tips?: string;
};

export type RadarHighlight = {
  title?: string;
  subtitle?: string;
  match_id?: number | string;
};

export type RadarDayPayload = {
  meta: RadarMeta;
  matches: RadarMatch[];
  highlights: RadarHighlight[];
};
