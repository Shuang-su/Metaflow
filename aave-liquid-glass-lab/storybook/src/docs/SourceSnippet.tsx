import contentJson from '../generated/study-content.json';
import type { StudyCaseId, StudyEntry } from '../origin/types';

const studyContent = contentJson as Record<StudyCaseId, StudyEntry>;

interface SourceSnippetProps {
  studyCase: StudyCaseId;
  index?: number;
}

export function SourceSnippet({ studyCase, index = 0 }: SourceSnippetProps) {
  const source = studyContent[studyCase].sources[index];
  if (!source) return null;

  return (
    <figure className="study-readme-source" data-source-chunk={source.chunk}>
      <figcaption>
        <span>{source.anchor}</span>
        <small>参数与行为校核 · 含研究注释</small>
      </figcaption>
      <div
        className="study-highlighted-source"
        dangerouslySetInnerHTML={{ __html: source.highlightedHtml }}
      />
    </figure>
  );
}
