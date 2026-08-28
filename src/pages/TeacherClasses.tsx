import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import { STUDENT_COLUMNS, type LoadState, type SchoolClass } from '../lib/types';

/** 반 목록 + 반마다 몇 명이 있는지. 삭제 전에 알려주려면 인원수가 필요하다. */
type Loaded = { classes: SchoolClass[]; countByClassId: Map<string, number> };

export default function TeacherClasses() {
  const [state, setState] = useState<LoadState<Loaded>>({ status: 'loading' });
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [busyClassId, setBusyClassId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });

    const [classesResult, studentsResult] = await Promise.all([
      supabase
        .from('classes')
        .select('*')
        .order('order_index', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<SchoolClass[]>(),
      supabase
        .from('students')
        .select(STUDENT_COLUMNS)
        .returns<{ class_id: string | null }[]>(),
    ]);

    const error = classesResult.error ?? studentsResult.error;
    if (error) {
      setState({ status: 'error', message: toUserMessage(error) });
      return;
    }

    const countByClassId = new Map<string, number>();
    for (const student of studentsResult.data ?? []) {
      if (student.class_id === null) continue;
      countByClassId.set(student.class_id, (countByClassId.get(student.class_id) ?? 0) + 1);
    }

    setState({ status: 'ready', value: { classes: classesResult.data ?? [], countByClassId } });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    const name = newName.trim();
    if (name.length < 1 || name.length > 40) {
      setActionError('반 이름은 1~40자로 입력해 주세요.');
      return;
    }

    // 새 반은 항상 목록 맨 아래에 붙인다.
    const lastIndex =
      state.status === 'ready'
        ? state.value.classes.reduce((max, item) => Math.max(max, item.order_index), 0)
        : 0;

    setIsCreating(true);
    const { error } = await supabase.from('classes').insert({ name, order_index: lastIndex + 1 });
    setIsCreating(false);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    setNewName('');
    await load();
  }

  async function rename(item: SchoolClass): Promise<void> {
    const next = window.prompt('반 이름을 입력하세요.', item.name);
    if (next === null) return;

    const name = next.trim();
    if (name.length < 1 || name.length > 40) {
      setActionError('반 이름은 1~40자로 입력해 주세요.');
      return;
    }

    setActionError(null);
    setBusyClassId(item.id);
    const { error } = await supabase.from('classes').update({ name }).eq('id', item.id);
    setBusyClassId(null);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  /** 위/아래로 한 칸. 두 반의 order_index 를 맞바꾼다. */
  async function move(item: SchoolClass, direction: -1 | 1): Promise<void> {
    if (state.status !== 'ready') return;
    const list = state.value.classes;
    const index = list.findIndex((candidate) => candidate.id === item.id);
    const neighbour = list[index + direction];
    if (!neighbour) return;

    setActionError(null);
    setBusyClassId(item.id);

    // 만들 때 넣은 값이 겹칠 수 있으므로 자리(index)를 기준으로 다시 매긴다.
    const [first, second] = await Promise.all([
      supabase.from('classes').update({ order_index: index + direction + 1 }).eq('id', item.id),
      supabase.from('classes').update({ order_index: index + 1 }).eq('id', neighbour.id),
    ]);

    setBusyClassId(null);
    const error = first.error ?? second.error;
    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  async function remove(item: SchoolClass, studentCount: number): Promise<void> {
    const confirmed = window.confirm(
      studentCount === 0
        ? `"${item.name}" 반을 삭제할까요?`
        : `"${item.name}" 반을 삭제할까요?\n\n` +
            `이 반의 학생 ${studentCount}명은 "반 없음" 이 됩니다.\n` +
            '학생 계정과 제출 기록은 지워지지 않습니다.',
    );
    if (!confirmed) return;

    setActionError(null);
    setBusyClassId(item.id);
    const { error } = await supabase.from('classes').delete().eq('id', item.id);
    setBusyClassId(null);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  const classes = state.status === 'ready' ? state.value.classes : [];

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-stone-900">반 관리</h1>
        <Link to="/teacher/students" className="text-sm text-stone-500 hover:text-stone-800">
          학생 관리 →
        </Link>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        여기서 만든 반이 학생 등록 화면의 <strong>반 드롭다운</strong>에 나옵니다. 이름을 고치면 그 반
        학생 전부에게 반영됩니다.
      </p>

      <form
        onSubmit={(event) => void create(event)}
        className="mt-4 rounded-lg border border-stone-200 bg-white p-4"
      >
        <label htmlFor="newClass" className="block text-sm font-medium text-stone-700">
          새 반
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="newClass"
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={40}
            placeholder="목요일 A반"
            className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="submit"
            disabled={isCreating}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {isCreating ? '만드는 중…' : '만들기'}
          </button>
        </div>
      </form>

      {actionError !== null && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

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

      {state.status === 'ready' && classes.length === 0 && (
        <p className="mt-4 rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          아직 반이 없습니다. 위에서 첫 반을 만들어 주세요.
        </p>
      )}

      {state.status === 'ready' && classes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {classes.map((item, index) => {
            const studentCount = state.value.countByClassId.get(item.id) ?? 0;
            return (
              <li
                key={item.id}
                className="rounded-lg border border-stone-200 bg-white p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-stone-900">{item.name}</p>
                  <p className="mt-0.5 text-xs text-stone-500">학생 {studentCount}명</p>
                </div>

                <div className="mt-3 flex shrink-0 flex-wrap gap-2 sm:mt-0">
                  <button
                    type="button"
                    disabled={busyClassId === item.id || index === 0}
                    onClick={() => void move(item, -1)}
                    aria-label={`${item.name} 위로`}
                    className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={busyClassId === item.id || index === classes.length - 1}
                    onClick={() => void move(item, 1)}
                    aria-label={`${item.name} 아래로`}
                    className="rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-300"
                  >
                    ↓
                  </button>
                  <Link
                    to={`/teacher/students?class=${item.id}`}
                    className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                  >
                    학생 보기
                  </Link>
                  <button
                    type="button"
                    disabled={busyClassId === item.id}
                    onClick={() => void rename(item)}
                    className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
                  >
                    이름 수정
                  </button>
                  <button
                    type="button"
                    disabled={busyClassId === item.id}
                    onClick={() => void remove(item, studentCount)}
                    className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Layout>
  );
}
