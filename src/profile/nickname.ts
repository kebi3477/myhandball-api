/**
 * 닉네임 규칙. 앱 `domain/models/nickname.dart`와 **반드시 같아야 한다**
 * (서버가 느슨하면 랭킹에 이상한 이름이, 빡빡하면 앱에서 통과한 값이 저장 실패).
 * - 앞뒤 공백 제거 후 2~10자, 코드 포인트 기준 (한글 한 글자 = 1)
 * - 허용 문자: 가-힣, ㄱ-ㅎ, ㅏ-ㅣ, a-zA-Z, 0-9 (공백·이모지·특수문자 불가)
 */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 10;
const ALLOWED = /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9]+$/u;

/** 규칙 위반이면 어느 규칙인지 알 수 있는 메시지, 통과면 null */
export function nicknameError(raw: unknown): string | null {
  if (typeof raw !== "string") return "닉네임이 필요해요";
  const v = raw.trim();
  const len = [...v].length;
  if (len < NICKNAME_MIN) return `닉네임은 ${NICKNAME_MIN}자 이상이어야 해요`;
  if (len > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MAX}자 이하여야 해요`;
  if (!ALLOWED.test(v)) return "닉네임에는 한글, 영문, 숫자만 쓸 수 있어요 (공백·특수문자·이모지 불가)";
  return null;
}

/** 중복 비교 키: 대소문자 무시 + 공백 제거 */
export function nicknameKey(v: string): string {
  return v.replace(/\s+/g, "").toLowerCase();
}
