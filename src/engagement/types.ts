export type PredictionPick = "home" | "draw" | "away";

export interface PredictionResponse {
  matchSeq: number;
  myPick: PredictionPick | null; // X-Device-Id 없으면 null
  total: number;
  home: number; // 표 수
  draw: number;
  away: number;
  open: boolean; // 경기 시작 전까지만 true (startsAt 기준)
}

export interface MvpCandidateItem {
  playerSeq: number | null;
  playerName: string;
  teamName: string;
  side: "home" | "away";
  number: number | null;
  statLine: string; // "8골 3AS" — 01번 선수 기록에서 생성
  votes: number;
}

export interface MvpResponse {
  matchSeq: number;
  open: boolean; // 경기 종료 후에만 true
  myVote: number | null; // playerSeq
  myVoteName: string | null; // playerSeq를 특정 못 한 선수에 투표했을 때를 위해 이름도 준다
  total: number;
  candidates: MvpCandidateItem[]; // 득표 내림차순
}

export interface CheerItem {
  id: number;
  text: string;
  likes: number;
  liked: boolean; // 내가 눌렀는지
  isMine: boolean;
  createdAt: string;
}

export interface CheerListResponse {
  teamNum: number;
  total: number;
  page: number;
  items: CheerItem[]; // 최신순
}
