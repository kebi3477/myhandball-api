export interface FavoritePlayerItem {
  playerSeq: number;
  addedAt: string; // ISO 8601
}

export interface FavoritePlayersResponse {
  items: FavoritePlayerItem[]; // 추가한 순서 역순
}

export interface GuideProgressResponse {
  doneCount: number; // 0~5
  completedAt: string | null; // 5를 처음 채운 시각 (배지 획득일)
}
