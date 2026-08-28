import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { GRADES, STUDENT_COLUMNS, type LoadState, type SchoolClass, type Student } from '../lib/types';

/** 학생과 반을 함께 들고 있어야 드롭다운과 목록에 반 이름을 붙일 수 있다. */
type Loaded = { students: Student[]; classes: SchoolClass[] };

/** 새 계정 입력칸 한 벌. 비밀번호 말고는 비워 둬도 저장된다. */
interface Draft {
  name: string;
  school: string;
  grade: string;
  class_id: string;
  password: string;
}

const EMPTY_DRAFT: Draft = { name: '', school: '', grade: '', class_id: '', password: '' };

/** 비밀번호는 숫자 4자리. 화면과 서버(teacher_create_student) 양쪽에서 같은 규칙을 건다. */
const PASSWORD_PATTERN = /^\d{4}$/;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 4);
}

/** 드롭다운의 빈 선택지는 '' 로 두고, 서버로 보낼 때만 null 로 바꾼다. */
function toClassId(value: string): string | null {
  return value === '' ? null : value;
}

export default function TeacherStudents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const classFilter = searchParams.get('class') ?? '';

  const [state, setState] = useState<LoadState<Loaded>>({ status: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [isCreating, setIsCreating] = useState(false);

  const [bulkText, setBulkText] = useState('');
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [isBulkRunning, setIsBulkRunning] = useState(false);

  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(true);

  // 한 번에 한 학생만 편집한다. 비밀번호 입력칸도 같은 방식으로 연다.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Omit<Draft, 'password'>>({
    name: '',
    school: '',
    grade: '',
    class_id: '',
  });
  const [passwordTargetId, setPasswordTargetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });

    const [studentsResult, classesResult] = await Promise.all([
      supabase
        .from('students')
        .select(STUDENT_COLUMNS)
        .order('name', { ascending: true })
        .returns<Student[]>(),
      supabase
        .from('classes')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<SchoolClass[]>(),
    ]);

    const error = studentsResult.error ?? classesResult.error;
    if (error) {
      setState({ status: 'error', message: toUserMessage(error) });
      return;
    }
    setState({
      status: 'ready',
      value: { students: studentsResult.data ?? [], classes: classesResult.data ?? [] },
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const classes = state.status === 'ready' ? state.value.classes : [];
  const classNameOf = (classId: string | null): string =>
    classes.find((item) => item.id === classId)?.name ?? '';

  async function createStudent(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);
    setNotice(null);

    if (draft.name.trim() === '') {
      setActionError('이름을 입력해 주세요.');
      return;
    }
    if (!PASSWORD_PATTERN.test(draft.password)) {
      setActionError('비밀번호는 숫자 4자리로 입력해 주세요.');
      return;
    }

    setIsCreating(true);
    const { error } = await supabase.rpc('teacher_create_student', {
      p_name: draft.name.trim(),
      p_school: draft.school.trim(),
      p_grade: draft.grade,
      p_class_id: toClassId(draft.class_id),
      p_password: draft.password,
    });
    setIsCreating(false);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    setNotice(`${draft.name.trim()} 학생 계정을 만들었습니다.`);
    // 반·학년·학교는 다음 학생도 같은 경우가 많으므로 남겨 둔다.
    setDraft({ ...draft, name: '', password: '' });
    await load();
  }

  async function runBulk(): Promise<void> {
    setActionError(null);
    setNotice(null);
    setBulkErrors([]);

    const lines = bulkText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    if (lines.length === 0) {
      setActionError('추가할 내용을 붙여넣어 주세요.');
      return;
    }

    // 반은 이름으로 적고 여기서 id 를 찾는다. 없는 반이면 만들지 않고 알려 준다.
    const classIdByName = new Map(classes.map((item) => [item.name.trim().toLowerCase(), item.id]));

    // 형식이 틀린 줄이 하나라도 있으면 아무것도 만들지 않는다.
    // 절반만 들어간 상태에서 어디까지 됐는지 세는 것보다 낫다.
    const drafts: Draft[] = [];
    const problems: string[] = [];

    lines.forEach((line, index) => {
      const label = `${index + 1}번째 줄`;
      // 엑셀에서 복사한 탭 구분도 받는다.
      const parts = line.split(/[\t,]/).map((part) => part.trim());
      if (parts.length !== 5) {
        problems.push(`${label}: 쉼표로 구분한 5칸(이름, 학교, 학년, 반, 비밀번호)이 필요합니다.`);
        return;
      }

      const [name, school, grade, className, password] = parts;
      if (name === '') {
        problems.push(`${label}: 이름이 비어 있습니다.`);
        return;
      }
      if (!PASSWORD_PATTERN.test(password)) {
        problems.push(`${label}: 비밀번호가 숫자 4자리가 아닙니다.`);
        return;
      }
      if (grade !== '' && !GRADES.includes(grade as (typeof GRADES)[number])) {
        problems.push(`${label}: 학년은 ${GRADES.join(' · ')} 중 하나여야 합니다 ("${grade}").`);
        return;
      }

      let classId = '';
      if (className !== '') {
        const found = classIdByName.get(className.toLowerCase());
        if (found === undefined) {
          problems.push(`${label}: "${className}" 반이 없습니다. 반 관리에서 먼저 만들어 주세요.`);
          return;
        }
        classId = found;
      }

      drafts.push({ name, school, grade, class_id: classId, password });
    });

    if (problems.length > 0) {
      setBulkErrors(problems);
      return;
    }

    setIsBulkRunning(true);
    const failures: string[] = [];
    let created = 0;
    for (const item of drafts) {
      const { error } = await supabase.rpc('teacher_create_student', {
        p_name: item.name,
        p_school: item.school,
        p_grade: item.grade,
        p_class_id: toClassId(item.class_id),
        p_password: item.password,
      });
      if (error) failures.push(`${item.name}: ${toUserMessage(error)}`);
      else created += 1;
    }
    setIsBulkRunning(false);

    setBulkErrors(failures);
    setNotice(
      `${created}명을 추가했습니다.${failures.length > 0 ? ` ${failures.length}명은 실패했습니다.` : ''}`,
    );
    if (failures.length === 0) setBulkText('');
    await load();
  }

  async function saveEdit(student: Student): Promise<void> {
    setActionError(null);
    setNotice(null);

    if (editDraft.name.trim() === '') {
      setActionError('이름을 입력해 주세요.');
      return;
    }

    setBusyId(student.id);
    const { error } = await supabase
      .from('students')
      .update({
        name: editDraft.name.trim(),
        school: editDraft.school.trim(),
        grade: editDraft.grade,
        class_id: toClassId(editDraft.class_id),
      })
      .eq('id', student.id);
    setBusyId(null);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    setEditingId(null);
    await load();
  }

  async function setPassword(student: Student): Promise<void> {
    setActionError(null);
    setNotice(null);

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setActionError('비밀번호는 숫자 4자리로 입력해 주세요.');
      return;
    }

    setBusyId(student.id);
    const { error } = await supabase.rpc('teacher_set_student_password', {
      p_student_id: student.id,
      p_password: newPassword,
    });
    setBusyId(null);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    setPasswordTargetId(null);
    setNewPassword('');
    setNotice(`${student.name} 학생의 비밀번호를 바꿨습니다.`);
  }

  async function toggleActive(student: Student): Promise<void> {
    setActionError(null);
    setNotice(null);
    setBusyId(student.id);

    const { error } = await supabase
      .from('students')
      .update({ is_active: !student.is_active })
      .eq('id', student.id);

    setBusyId(null);
    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  async function remove(student: Student): Promise<void> {
    const confirmed = window.confirm(
      `"${student.name}" 학생 계정을 삭제할까요?\n이 학생이 제출한 기록도 함께 삭제되며 되돌릴 수 없습니다.\n\n기록을 남기고 로그인만 막으려면 "사용 중지" 를 쓰세요.`,
    );
    if (!confirmed) return;

    setActionError(null);
    setNotice(null);
    setBusyId(student.id);

    const { error } = await supabase.from('students').delete().eq('id', student.id);

    setBusyId(null);
    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  const students = state.status === 'ready' ? state.value.students : [];
  const needle = query.trim().toLowerCase();
  const visible = students.filter((student) => {
    if (!showInactive && !student.is_active) return false;
    // 'none' = 반이 정해지지 않은 학생만.
    if (classFilter === 'none' && student.class_id !== null) return false;
    if (classFilter !== '' && classFilter !== 'none' && student.class_id !== classFilter) return false;
    if (needle === '') return true;
    return [student.name, student.school, student.grade, classNameOf(student.class_id)]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });

  const inputClass =
    'w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200';

  const classOptions = (
    <>
      <option value="">반 없음</option>
      {classes.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </>
  );

  const gradeOptions = (
    <>
      <option value="">선택 안 함</option>
      {GRADES.map((grade) => (
        <option key={grade} value={grade}>
          {grade}
        </option>
      ))}
    </>
  );

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-stone-900">학생 관리</h1>
        <Link to="/teacher/classes" className="text-sm text-stone-500 hover:text-stone-800">
          반 관리 →
        </Link>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        학생은 <span className="font-medium">이름</span>과{' '}
        <span className="font-medium">숫자 4자리 비밀번호</span>로 로그인합니다. 이름만으로 계정을 찾으므로
        같은 이름은 만들 수 없습니다.
      </p>

      {actionError && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {state.status === 'ready' && classes.length === 0 && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          아직 반이 없습니다.{' '}
          <Link to="/teacher/classes" className="font-medium underline">
            반 관리
          </Link>
          에서 먼저 반을 만들면 아래 드롭다운에서 고를 수 있습니다. 반 없이도 계정은 만들 수 있습니다.
        </p>
      )}

      {/* ── 한 명 추가 ─────────────────────────────────────────────── */}
      <form onSubmit={createStudent} className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-medium text-stone-700">새 학생</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="text-xs text-stone-500">이름</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              maxLength={20}
              placeholder="김민수"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">학교</span>
            <input
              type="text"
              value={draft.school}
              onChange={(event) => setDraft({ ...draft, school: event.target.value })}
              maxLength={40}
              placeholder="○○고등학교"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">학년</span>
            <select
              value={draft.grade}
              onChange={(event) => setDraft({ ...draft, grade: event.target.value })}
              className={`${inputClass} bg-white`}
            >
              {gradeOptions}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">반</span>
            <select
              value={draft.class_id}
              onChange={(event) => setDraft({ ...draft, class_id: event.target.value })}
              className={`${inputClass} bg-white`}
            >
              {classOptions}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-stone-500">초기 비밀번호</span>
            <input
              type="text"
              value={draft.password}
              onChange={(event) => setDraft({ ...draft, password: onlyDigits(event.target.value) })}
              inputMode="numeric"
              maxLength={4}
              placeholder="숫자 4자리"
              className={`${inputClass} tracking-[0.3em]`}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={isCreating}
          className="mt-3 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isCreating ? '만드는 중…' : '학생 추가'}
        </button>
        <p className="mt-2 text-xs text-stone-500">
          추가한 뒤 학교·학년·반은 그대로 남습니다. 같은 반 학생을 이어서 넣기 좋습니다.
        </p>
      </form>

      {/* ── 여러 명 추가 ───────────────────────────────────────────── */}
      <details className="mt-3 rounded-lg border border-stone-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-stone-700">
          여러 명 한 번에 추가
        </summary>
        <p className="mt-2 text-xs text-stone-500">
          한 줄에 한 명씩,{' '}
          <span className="font-mono text-stone-700">이름, 학교, 학년, 반, 비밀번호</span> 순서로
          적어 주세요. 엑셀에서 5칸을 복사해 붙여넣어도 됩니다. 학교·학년·반은 비워 둘 수 있습니다.
        </p>
        <p className="mt-1 text-xs text-stone-500">
          학년은 <span className="font-medium">{GRADES.join(' · ')}</span> 중 하나여야 하고, 반은{' '}
          <span className="font-medium">반 관리에 있는 이름</span>과 정확히 같아야 합니다.
        </p>
        <textarea
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={'김민수, ○○고등학교, 고1, 목요일 A반, 1234\n이서연, ○○고등학교, 고1, 목요일 A반, 5678'}
          className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
        {bulkErrors.length > 0 && (
          <ul className="mt-2 space-y-1 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {bulkErrors.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => void runBulk()}
          disabled={isBulkRunning}
          className="mt-3 rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBulkRunning ? '추가하는 중…' : '붙여넣은 대로 추가'}
        </button>
      </details>

      {/* ── 찾기 ───────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름 · 학교 · 학년 · 반으로 찾기"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <select
          value={classFilter}
          onChange={(event) => {
            const next = event.target.value;
            setSearchParams(next === '' ? {} : { class: next }, { replace: true });
          }}
          aria-label="반으로 거르기"
          className="shrink-0 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        >
          <option value="">전체 반</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
          <option value="none">반 없음</option>
        </select>
        <label className="flex shrink-0 items-center gap-1.5 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-200"
          />
          사용 중지 포함
        </label>
        <span className="shrink-0 text-sm text-stone-500">{visible.length}명</span>
      </div>

      {state.status === 'loading' && <p className="mt-4 text-stone-500">불러오는 중입니다…</p>}

      {state.status === 'error' && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{state.message}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {state.status === 'ready' && visible.length === 0 && (
        <p className="mt-4 rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          {students.length === 0
            ? '아직 만들어 둔 학생 계정이 없습니다. 위에서 첫 계정을 만들어 보세요.'
            : '조건에 맞는 학생이 없습니다.'}
        </p>
      )}

      {state.status === 'ready' && visible.length > 0 && (
        <ul className="mt-4 space-y-2">
          {visible.map((student) => (
            <li key={student.id} className="rounded-lg border border-stone-200 bg-white p-4">
              {editingId === student.id ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block">
                    <span className="text-xs text-stone-500">이름</span>
                    <input
                      type="text"
                      value={editDraft.name}
                      onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                      maxLength={20}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-stone-500">학교</span>
                    <input
                      type="text"
                      value={editDraft.school}
                      onChange={(event) => setEditDraft({ ...editDraft, school: event.target.value })}
                      maxLength={40}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-stone-500">학년</span>
                    <select
                      value={editDraft.grade}
                      onChange={(event) => setEditDraft({ ...editDraft, grade: event.target.value })}
                      className={`${inputClass} bg-white`}
                    >
                      {gradeOptions}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-stone-500">반</span>
                    <select
                      value={editDraft.class_id}
                      onChange={(event) =>
                        setEditDraft({ ...editDraft, class_id: event.target.value })
                      }
                      className={`${inputClass} bg-white`}
                    >
                      {classOptions}
                    </select>
                  </label>
                  <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                    <button
                      type="button"
                      onClick={() => void saveEdit(student)}
                      disabled={busyId === student.id}
                      className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <div className="sm:flex sm:items-center sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-900">{student.name}</span>
                      {!student.is_active && (
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500">
                          사용 중지
                        </span>
                      )}
                      {student.class_id !== null && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                          {classNameOf(student.class_id)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-stone-500">
                      {[student.school, student.grade].filter((part) => part !== '').join(' · ') ||
                        '학교·학년 미입력'}
                    </p>
                  </div>

                  <div className="mt-3 flex shrink-0 flex-wrap gap-2 sm:mt-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(student.id);
                        setPasswordTargetId(null);
                        setEditDraft({
                          name: student.name,
                          school: student.school,
                          grade: student.grade,
                          class_id: student.class_id ?? '',
                        });
                      }}
                      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordTargetId(passwordTargetId === student.id ? null : student.id);
                        setNewPassword('');
                      }}
                      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      비밀번호
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleActive(student)}
                      disabled={busyId === student.id}
                      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {student.is_active ? '사용 중지' : '다시 사용'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(student)}
                      disabled={busyId === student.id}
                      className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}

              {passwordTargetId === student.id && editingId !== student.id && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
                  <label className="block">
                    <span className="text-xs text-stone-500">새 비밀번호</span>
                    <input
                      type="text"
                      value={newPassword}
                      onChange={(event) => setNewPassword(onlyDigits(event.target.value))}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="숫자 4자리"
                      className={`${inputClass} w-32 tracking-[0.3em]`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void setPassword(student)}
                    disabled={busyId === student.id}
                    className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                  >
                    바꾸기
                  </button>
                  <p className="w-full text-xs text-stone-500">
                    지금 쓰는 비밀번호는 해시로만 저장되어 있어 확인할 수 없습니다. 잊어버렸다면 새로
                    정해 학생에게 알려 주세요.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
