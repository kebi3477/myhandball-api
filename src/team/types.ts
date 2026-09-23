export type Gender = "W" | "M";

export interface TeamItem {
  teamNum: number;
  name: string;
  logoUrl: string | null;
  href: string | null;
}

export interface TeamListResponse {
  url: string;
  gender: Gender;
  teams: TeamItem[];
}
