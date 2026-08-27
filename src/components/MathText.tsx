import katex from 'katex';

/**
 * 본문 텍스트 안의 LaTeX 를 KaTeX 로 렌더링한다.
 *
 *   $x^2+1$       인라인 수식 (문장 중간)
 *   $$\int_0^1$$  블록 수식 (가운데 정렬된 별도 줄)
 *   \$            달러 기호 자체 (수식으로 해석되지 않는다)
 *
 * 수식이 아닌 부분은 React 가 텍스트 노드로 그리므로 HTML 이 섞여도 그대로 글자로 보인다.
 * 수식 부분만 KaTeX 가 만든 HTML 을 넣는데, trust:false 라 \href 같은 위험한 명령은 무시된다.
 */

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; display: boolean };

/**
 * 앞에서부터 한 글자씩 훑으며 텍스트와 수식을 갈라낸다.
 *
 * 정규식 대신 직접 훑는 이유: `\$` 로 escape 한 달러 기호를 자리표시자로 치환했다가
 * 되돌리는 방식은 자리표시자가 본문에 실제로 등장하면 깨진다. 여기서는 escape 를
 * 만나는 즉시 텍스트로 확정하므로 그런 구멍이 없다.
 */
export function splitSegments(source: string): Segment[] {
  const segments: Segment[] = [];
  let buffer = '';
  let index = 0;

  const flushText = () => {
    if (buffer.length > 0) {
      segments.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };

  while (index < source.length) {
    const char = source[index];

    // \$ 는 수식 구분자가 아니라 달러 기호 그 자체다.
    if (char === '\\' && source[index + 1] === '$') {
      buffer += '$';
      index += 2;
      continue;
    }

    if (char === '$') {
      const display = source[index + 1] === '$';
      const delimiter = display ? '$$' : '$';
      const from = index + delimiter.length;
      const end = source.indexOf(delimiter, from);
      const value = end === -1 ? '' : source.slice(from, end);

      // 닫는 기호가 없거나 속이 비었으면 수식이 아니다. 인라인 수식은 줄을 넘지 않는다
      // ("$3 와 $5" 같은 문장이 통째로 수식으로 잡히는 일을 줄인다).
      const isMath = end !== -1 && value.trim().length > 0 && (display || !value.includes('\n'));
      if (isMath) {
        flushText();
        segments.push({ kind: 'math', value, display });
        index = end + delimiter.length;
        continue;
      }
    }

    buffer += char;
    index += 1;
  }

  flushText();
  return segments;
}

function MathSpan({ tex, display }: { tex: string; display: boolean }) {
  let html: string;
  try {
    html = katex.renderToString(tex, {
      displayMode: display,
      throwOnError: true,
      trust: false,
      strict: false,
    });
  } catch (error) {
    // 오타를 조용히 삼키면 선생님이 눈치채지 못한다. 원문을 그대로 보여주고 표시를 남긴다.
    const message = error instanceof Error ? error.message : '수식을 읽을 수 없습니다.';
    return (
      <span
        title={message}
        className="rounded bg-red-50 px-1 font-mono text-sm text-red-700 underline decoration-wavy"
      >
        {display ? `$$${tex}$$` : `$${tex}$`}
      </span>
    );
  }

  if (display) {
    return <span className="my-2 block overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/** 감싸는 요소는 호출하는 쪽이 정한다 (줄바꿈 유지 여부가 화면마다 다르므로). */
export function MathText({ text }: { text: string }) {
  return (
    <>
      {splitSegments(text).map((segment, index) =>
        segment.kind === 'text' ? (
          <span key={index}>{segment.value}</span>
        ) : (
          <MathSpan key={index} tex={segment.value} display={segment.display} />
        ),
      )}
    </>
  );
}
