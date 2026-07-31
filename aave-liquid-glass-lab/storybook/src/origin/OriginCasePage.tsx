import contentJson from '../generated/study-content.json';
import { OriginModuleHost } from './OriginModuleHost';
import type { StudyCaseId, StudyEntry } from './types';

const studyContent = contentJson as Record<StudyCaseId, StudyEntry>;

interface OriginCasePageProps {
  studyCase: StudyCaseId;
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="study-section-title">{children}</h2>;
}

export function OriginCasePage({ studyCase }: OriginCasePageProps) {
  const entry = studyContent[studyCase];

  return (
    <main className="origin-case-page">
      <header className="study-header">
        <h1>{entry.title}</h1>
        <p className="study-summary">{entry.summary}</p>
        {studyCase === 'overview' ? (
          <p className="study-source-line">
            研究起点：
            <a href="https://aave.com/design/building-glass-for-the-web" target="_blank" rel="noreferrer">
              Aave · Building Glass for the Web
            </a>
          </p>
        ) : null}
      </header>

      <section className="study-demo-section" aria-label={`${entry.title} 交互演示`}>
        <OriginModuleHost caseId={entry.originCase} />
      </section>

      <section className="study-prose-section">
        <SectionTitle>原文说明</SectionTitle>
        <div
          className={`${entry.originArticleClassName} study-origin-prose`}
          dangerouslySetInnerHTML={{ __html: entry.originalHtml }}
        />
      </section>

      <section className="study-implementation-section">
        <SectionTitle>实现说明</SectionTitle>
        <p>{entry.implementation}</p>

        {entry.details?.map(detail => (
          <article className="study-detail" key={detail.title}>
            <h3>{detail.title}</h3>
            <p>{detail.body}</p>
          </article>
        ))}

        <div className="study-metrics" aria-label="运行指标">
          {entry.metrics.map(metric => (
            <dl key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </dl>
          ))}
        </div>

        <h3>可复现规则</h3>
        <ul>
          {entry.rules.map(rule => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        <h3>浏览器与性能</h3>
        <p>{entry.browser}</p>
      </section>

      <section className="study-source-section">
        <SectionTitle>代码实现</SectionTitle>
        <p className="study-source-intro">
          以下代码来自本地锁定的 Aave 运行版本。为便于阅读，展示层进行语义等价的命名、截取边界、
          换行与缩进规范化，并加入以“研究注释”标识的中文说明；注释不属于原始 bundle，也不改变
          执行逻辑。未格式化文本及文件映射保留在源码研究主文档中。
        </p>
        {entry.sources.map((source, index) => (
          <details
            key={`${source.chunk}-${source.anchor}`}
            data-source-chunk={source.chunk}
            open={index === 0}
          >
            <summary>
              <span>{source.anchor}</span>
              <small>实现片段</small>
            </summary>
            <div
              className="study-highlighted-source"
              dangerouslySetInnerHTML={{ __html: source.highlightedHtml }}
            />
          </details>
        ))}
      </section>
    </main>
  );
}
