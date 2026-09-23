import type { Gender } from "../team/types"; // 경로는 네 프로젝트 구조에 맞게 조정

export type RankTeamInfo = {
  name: string;
  logoUrl: string | null;
};

export type RankItem = {
  rank: number;
  team: RankTeamInfo;
  played: number;    
  points: number;   
  wins: number;    
  draws: number;   
  losses: number;  
  goalsFor: number; 
  goalsAgainst: number;
  goalDiff: number;  
  last5: ("W" | "L" | "D")[];
};

export type RankingResponse = {
  url: string;
  leagueGender: Gender;
  leagueSeason: string;
  leagueType: string;
  items: RankItem[];
};
