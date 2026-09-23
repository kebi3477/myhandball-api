export interface PolicyTable {
  headers: string[];
  rows: string[][];
}

export interface PolicySection {
  id: string;
  title: string;
  paragraphs?: string[]; // 문단 (표·목록보다 먼저 보여 준다)
  items?: string[]; // 글머리 목록
  table?: PolicyTable;
}

/** 앱이 그대로 그릴 수 있는 처리방침 구조 */
export interface PolicyDocument {
  title: string;
  version: string;
  effectiveDate: string; // "2026-09-23"
  intro: string;
  sections: PolicySection[];
  contact: { email: string };
}
