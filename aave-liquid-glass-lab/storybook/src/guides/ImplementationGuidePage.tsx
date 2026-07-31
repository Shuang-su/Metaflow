import contentJson from '../generated/study-content.json';
import { GuideCodeBlock } from '../docs/GuideCodeBlock';
import { SourceSnippet } from '../docs/SourceSnippet';
import { ReadableExample } from '../implementation/examples';
import { OriginModuleHost } from '../origin/OriginModuleHost';
import type { StudyCaseId, StudyEntry } from '../origin/types';
import { guideChapters } from './content';
import './guide.css';

const studyContent = contentJson as Record<StudyCaseId, StudyEntry>;

export function ImplementationGuidePage({ studyCase }: { studyCase: StudyCaseId }) {
  const chapter = guideChapters[studyCase];
  const evidence = studyContent[studyCase];

  return (
    <main className="study-guide-page">
      <header>
        <h1>{chapter.title}：构建与代码</h1>
        <p className="study-lede">{chapter.summary}</p>
      </header>

      <section>
        <h2>1. 先定义效果与交互契约</h2>
        <p>
          先操作目标效果，观察镜片边界、状态变化和响应速度。这里用于确定验收标准；
          本页后半部分运行的是可修改的 TypeScript、React 与 GLSL 实现。
        </p>
        <div className="study-live-reference">
          <OriginModuleHost caseId={studyCase === 'overview' ? 'hero' : studyCase} />
        </div>
      </section>

      <section>
        <h2>2. 明确数据流</h2>
        <p>{chapter.question}</p>
        <div className="study-step-grid">
          {chapter.buildSteps.map((step, index) => (
            <article key={step.title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>3. 逐步实现并运行</h2>
        <p>
          下面的效果直接运行本研究册中的 TypeScript Core 和 React 适配层。代码块来自当前画面
          使用的源文件，参数、分支和生命周期都可以修改，不是用于讲解的伪代码。
        </p>
        <div className="study-readable-example">
          <ReadableExample studyCase={studyCase} />
        </div>
        {chapter.guideSources.map((sourceId, index) => (
          <GuideCodeBlock key={sourceId} sourceId={sourceId} open={index === 0} />
        ))}
      </section>

      <section>
        <h2>4. 为什么这样写</h2>
        {chapter.reasons.map(reason => (
          <article className="study-reason" key={reason.title}>
            <h3>{reason.title}</h3>
            <p>{reason.body}</p>
          </article>
        ))}
      </section>

      <section>
        <h2>5. 参数与行为校核</h2>
        <p>
          下面的短片段只用于校核关键参数、DOM 结构和状态转移。构建产物名称不参与实现，
          读者只需要关注已经格式化的语义和本页运行代码。
        </p>
        <SourceSnippet studyCase={studyCase} />
        <div className="study-metrics" aria-label="运行指标">
          {evidence.metrics.map(metric => (
            <dl key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </dl>
          ))}
        </div>
      </section>

      <section>
        <h2>6. 常见错误与验收</h2>
        <div className="study-check-columns">
          <div>
            <h3>不要这样写</h3>
            <ul>
              {chapter.pitfalls.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>完成后必须证明</h3>
            <ul>
              {chapter.validation.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="study-browser-note">{evidence.browser}</p>
      </section>
    </main>
  );
}
