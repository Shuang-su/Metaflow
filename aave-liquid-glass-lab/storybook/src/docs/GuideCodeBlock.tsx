import guideJson from '../generated/guide-source-content.json';

interface GuideSourceEntry {
  id: string;
  title: string;
  path: string;
  marker: string;
  language: string;
  code: string;
  highlightedHtml: string;
}

const guideSources = guideJson as Record<string, GuideSourceEntry>;

interface GuideCodeBlockProps {
  sourceId: string;
  open?: boolean;
  label?: string;
}

export function GuideCodeBlock({
  sourceId,
  open = true,
  label = '实际运行源码片段'
}: GuideCodeBlockProps) {
  const source = guideSources[sourceId];
  if (!source) return null;

  return (
    <details className="study-guide-source" open={open}>
      <summary>
        <span>{source.title}</span>
        <small>{label} · {source.path.replace('src/', '')}</small>
      </summary>
      <div
        className="study-highlighted-source"
        dangerouslySetInnerHTML={{ __html: source.highlightedHtml }}
      />
    </details>
  );
}
