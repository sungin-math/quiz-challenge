import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { toUserMessage } from '../lib/errors';
import type { LoadState, Season } from '../lib/types';

export default function TeacherSeasons() {
  const [state, setState] = useState<LoadState<Season[]>>({ status: 'loading' });
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [busySeasonId, setBusySeasonId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' });

    const { data, error } = await supabase
      .from('seasons')
      .select('*')
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true })
      .returns<Season[]>();

    if (error) {
      setState({ status: 'error', message: toUserMessage(error) });
      return;
    }
    setState({ status: 'ready', value: data ?? [] });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setActionError(null);

    const name = newName.trim();
    if (name.length < 1 || name.length > 60) {
      setActionError('시즌 이름은 1~60자로 입력해 주세요.');
      return;
    }

    // 새 시즌은 항상 목록 맨 아래에 붙인다.
    const lastIndex = state.status === 'ready' ? state.value.reduce((max, s) => Math.max(max, s.order_index), 0) : 0;

    setIsCreating(true);
    const { error } = await supabase
      .from('seasons')
      .insert({ name, is_published: false, order_index: lastIndex + 1 });
    setIsCreating(false);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    setNewName('');
    await load();
  }

  async function togglePublished(season: Season): Promise<void> {
    setActionError(null);
    setBusySeasonId(season.id);

    const { error } = await supabase
      .from('seasons')
      .update({ is_published: !season.is_published })
      .eq('id', season.id);

    setBusySeasonId(null);
    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  async function rename(season: Season): Promise<void> {
    const next = window.prompt('시즌 이름을 입력하세요.', season.name);
    if (next === null) return;

    const name = next.trim();
    if (name.length < 1 || name.length > 60) {
      setActionError('시즌 이름은 1~60자로 입력해 주세요.');
      return;
    }

    setActionError(null);
    setBusySeasonId(season.id);
    const { error } = await supabase.from('seasons').update({ name }).eq('id', season.id);
    setBusySeasonId(null);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  async function remove(season: Season): Promise<void> {
    const confirmed = window.confirm(
      `"${season.name}" 시즌을 삭제할까요?\n\n` +
        '이 시즌에 속한 문제와 학생들의 제출 기록이 모두 함께 삭제됩니다.\n' +
        '되돌릴 수 없습니다. 잠시 숨기려는 것이라면 삭제 대신 "비공개로" 를 쓰세요.',
    );
    if (!confirmed) return;

    setActionError(null);
    setBusySeasonId(season.id);
    const { error } = await supabase.from('seasons').delete().eq('id', season.id);
    setBusySeasonId(null);

    if (error) {
      setActionError(toUserMessage(error));
      return;
    }
    await load();
  }

  return (
    <Layout>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-stone-900">시즌 관리</h1>
        <Link to="/teacher" className="text-sm text-stone-500 hover:text-stone-800">
          문제 관리 →
        </Link>
      </div>
      <p className="mt-1 text-sm text-stone-600">
        문제는 시즌 하나에 속합니다. <strong>공개된 시즌의 공개된 문제만</strong> 학생에게 보입니다.
      </p>

      <form onSubmit={(event) => void create(event)} className="mt-4 rounded-lg border border-stone-200 bg-white p-4">
        <label htmlFor="newSeason" className="block text-sm font-medium text-stone-700">
          새 시즌
        </label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input
            id="newSeason"
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={60}
            placeholder="2026 여름특강"
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
        <p className="mt-1 text-xs text-stone-500">새 시즌은 비공개로 만들어집니다. 문제를 다 넣은 뒤 공개하세요.</p>
      </form>

      {actionError !== null && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>
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

      {state.status === 'ready' && state.value.length === 0 && (
        <p className="mt-4 rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          아직 시즌이 없습니다. 위에서 첫 시즌을 만들어 주세요.
        </p>
      )}

      {state.status === 'ready' && state.value.length > 0 && (
        <ul className="mt-4 space-y-2">
          {state.value.map((season) => (
            <li key={season.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    season.is_published
                      ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                      : 'rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-500'
                  }
                >
                  {season.is_published ? '공개' : '비공개'}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-stone-900">{season.name}</span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to={`/teacher?season=${season.id}`}
                  className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  문제 보기
                </Link>
                <button
                  type="button"
                  disabled={busySeasonId === season.id}
                  onClick={() => void togglePublished(season)}
                  className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  {season.is_published ? '비공개로' : '공개로'}
                </button>
                <button
                  type="button"
                  disabled={busySeasonId === season.id}
                  onClick={() => void rename(season)}
                  className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
                >
                  이름 수정
                </button>
                <button
                  type="button"
                  disabled={busySeasonId === season.id}
                  onClick={() => void remove(season)}
                  className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
