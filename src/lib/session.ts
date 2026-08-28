import { useSyncExternalStore } from 'react';

/**
 * 학생 세션 = 로그인에 성공한 뒤 localStorage 에 담아 두는 students.id 와 이름.
 *
 * 계정은 선생님이 미리 만들어 둔다. 학생은 이름 + 숫자 4자리로 로그인하고,
 * 그 결과로 받은 id 를 이 저장소에 넣는다. 비밀번호는 여기에도, 어디에도 남기지 않는다.
 */

const STORAGE_KEY = 'quiz.student';

export interface StudentSession {
  id: string;
  name: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 저장된 id 가 UUID 모양인지. 손상된 값을 서버에 보내지 않으려고 확인한다. */
function isValidStudentId(id: string): boolean {
  return UUID_PATTERN.test(id.trim());
}

/** 화면에 표시할 이름. */
export function displayName(student: StudentSession): string {
  return student.name;
}

// ── 저장소 ────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

// undefined = 아직 localStorage 를 읽지 않음. null = 읽었고 세션이 없음.
// useSyncExternalStore 는 값이 안 바뀌면 같은 참조를 돌려받아야 하므로 캐시한다.
let cached: StudentSession | null | undefined;

function readFromStorage(): StudentSession | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('localStorage 를 읽지 못했습니다. 세션 없이 진행합니다.', error);
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn('저장된 세션이 손상되어 삭제합니다.', error);
    removeFromStorage();
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    removeFromStorage();
    return null;
  }
  // nickname 은 계정 방식으로 바뀌기 전에 쓰던 이름이다. 남아 있으면 그대로 살려 준다.
  const candidate = parsed as { id?: unknown; name?: unknown; nickname?: unknown };
  if (typeof candidate.id !== 'string' || !isValidStudentId(candidate.id)) {
    removeFromStorage();
    return null;
  }
  const name =
    typeof candidate.name === 'string'
      ? candidate.name
      : typeof candidate.nickname === 'string'
        ? candidate.nickname
        : '';
  if (name === '') {
    // 이름을 모르는 옛 세션(이어하기 코드로 들어온 경우)은 더 이상 쓸 수 없다.
    removeFromStorage();
    return null;
  }

  return { id: candidate.id, name };
}

function removeFromStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('localStorage 에서 세션을 지우지 못했습니다.', error);
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function getStudent(): StudentSession | null {
  if (cached === undefined) cached = readFromStorage();
  return cached;
}

export function setStudent(student: StudentSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(student));
  } catch (error) {
    console.warn('세션 저장 실패', error);
    throw new Error(
      '브라우저에 로그인 상태를 저장하지 못했습니다. 시크릿 모드이거나 저장소가 꽉 찼는지 확인해 주세요.',
    );
  }
  cached = student;
  notify();
}

export function clearStudent(): void {
  removeFromStorage();
  cached = null;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// 다른 탭에서 로그인/로그아웃한 경우에도 화면이 따라오도록.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    cached = readFromStorage();
    notify();
  });
}

/** 현재 학생 세션을 구독한다. 로그인 상태가 아니면 null. */
export function useStudent(): StudentSession | null {
  return useSyncExternalStore(subscribe, getStudent, () => null);
}
