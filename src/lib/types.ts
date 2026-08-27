/**
 * DB 와 주고받는 값의 모양.
 * 필드 이름은 SQL 의 컬럼/RPC 반환 컬럼 이름과 1:1로 맞춘다 (중간 매핑 계층을 두지 않는다).
 */

/** 화면이 데이터를 불러오는 동안 거치는 세 가지 상태. 로딩·에러·완료를 빠뜨리지 않게 한다. */
export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: T };

/** problems 테이블 한 행. answers 가 들어 있으므로 선생님 화면에서만 쓴다. */
export type Problem = {
  id: string;
  season_id: string;
  title: string;
  body: string;
  /** storage 의 problem-images 버킷 안 파일 경로. 이미지가 없으면 null. */
  image_path: string | null;
  answers: string[];
  is_published: boolean;
  order_index: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** get_problem RPC 결과. 학생에게 내려가는 문제 정보에는 정답이 없다. */
export type ProblemSummary = {
  problem_id: string;
  title: string;
  body: string;
  image_path: string | null;
  season_id: string;
  season_name: string;
}

/** seasons 테이블 한 행. 선생님 화면에서만 쓴다. */
export type Season = {
  id: string;
  name: string;
  is_published: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/** get_seasons_with_progress RPC 결과 한 행. 학생이 보는 시즌 목록. */
export type SeasonProgressRow = {
  season_id: string;
  name: string;
  order_index: number;
  total_problems: number;
  solved_count: number;
}

/** get_problems_with_progress RPC 결과 한 행. */
export type ProgressRow = {
  problem_id: string;
  title: string;
  order_index: number;
  solved: boolean;
  attempts: number;
}

/** submit_answer RPC 결과. */
export type SubmitResult = {
  is_correct: boolean;
  already_solved: boolean;
}

/** teacher_student_stats 뷰 한 행. */
export type StudentStats = {
  student_id: string;
  nickname: string;
  created_at: string;
  last_seen_at: string;
  attempt_count: number;
  solved_count: number;
}

/** teacher_problem_stats 뷰 한 행. */
export type ProblemStats = {
  problem_id: string;
  title: string;
  season_id: string;
  season_name: string;
  is_published: boolean;
  order_index: number;
  total_attempts: number;
  attempted_students: number;
  solved_students: number;
}

/** teacher_season_stats 뷰 한 행. 시즌 하나의 요약. */
export type SeasonStats = {
  season_id: string;
  name: string;
  is_published: boolean;
  order_index: number;
  problem_count: number;
  published_problem_count: number;
  participant_count: number;
  attempt_count: number;
  /** (학생, 문제) 쌍당 최대 1건이므로 "맞힌 문제 수" 와 같다. */
  correct_count: number;
}

/** teacher_student_season_stats 뷰 한 행. 시즌 × 학생. 한 번도 안 푼 학생도 0 으로 나온다. */
export type StudentSeasonStats = {
  season_id: string;
  student_id: string;
  nickname: string;
  attempt_count: number;
  solved_count: number;
  last_submitted_at: string | null;
}

/**
 * supabase-js 클라이언트에 넘기는 스키마 타입.
 * supabase/*.sql 의 테이블·뷰·RPC 와 1:1로 맞춘다. SQL 을 고치면 여기도 같이 고친다.
 * 이 타입이 있어야 rpc() 인자 이름과 반환값이 컴파일 타임에 검증된다.
 */
export interface Database {
  public: {
    Tables: {
      teachers: {
        Row: { id: string; email: string; created_at: string };
        Insert: { id: string; email: string; created_at?: string };
        Update: { id?: string; email?: string; created_at?: string };
        Relationships: [];
      };
      seasons: {
        Row: Season;
        Insert: { id?: string; name: string; is_published?: boolean; order_index?: number };
        Update: { name?: string; is_published?: boolean; order_index?: number };
        Relationships: [];
      };
      problems: {
        Row: Problem;
        Insert: {
          id?: string;
          season_id: string;
          title: string;
          body?: string;
          answers: string[];
          is_published?: boolean;
          order_index?: number;
          created_by?: string | null;
          image_path?: string | null;
        };
        Update: {
          season_id?: string;
          title?: string;
          body?: string;
          answers?: string[];
          is_published?: boolean;
          order_index?: number;
          image_path?: string | null;
        };
        Relationships: [];
      };
      students: {
        Row: { id: string; nickname: string; created_at: string; last_seen_at: string };
        Insert: { id?: string; nickname: string };
        Update: { nickname?: string; last_seen_at?: string };
        Relationships: [];
      };
      submissions: {
        Row: {
          id: number;
          student_id: string;
          problem_id: string;
          submitted_answer: string;
          is_correct: boolean;
          created_at: string;
        };
        Insert: {
          student_id: string;
          problem_id: string;
          submitted_answer: string;
          is_correct: boolean;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      teacher_student_stats: { Row: StudentStats; Relationships: [] };
      teacher_problem_stats: { Row: ProblemStats; Relationships: [] };
      teacher_season_stats: { Row: SeasonStats; Relationships: [] };
      teacher_student_season_stats: { Row: StudentSeasonStats; Relationships: [] };
    };
    Functions: {
      start_session: { Args: { p_nickname: string }; Returns: string };
      get_seasons_with_progress: { Args: { p_student_id: string }; Returns: SeasonProgressRow[] };
      get_problems_with_progress: {
        Args: { p_student_id: string; p_season_id: string };
        Returns: ProgressRow[];
      };
      get_problem: { Args: { p_problem_id: string }; Returns: ProblemSummary[] };
      submit_answer: {
        Args: { p_student_id: string; p_problem_id: string; p_answer: string };
        Returns: SubmitResult[];
      };
    };
  };
}
