import contentJson from '../generated/study-content.json';
import { GuideCodeBlock } from '../docs/GuideCodeBlock';
import { SourceSnippet } from '../docs/SourceSnippet';
import { ReadableExample } from '../implementation/examples';
import { DraggableToggleExample } from '../implementation/examples/ToggleExample';
import { OriginModuleHost } from '../origin/OriginModuleHost';
import type { StudyCaseId, StudyEntry } from '../origin/types';
import { guideChapters } from './content';
import './guide.css';

const studyContent = contentJson as Record<StudyCaseId, StudyEntry>;

export function ImplementationGuidePage({ studyCase }: { studyCase: StudyCaseId }) {
  const chapter = guideChapters[studyCase];
  const evidence = studyContent[studyCase];
  const hasToggleDrag = studyCase === 'toggle';
  const sectionOffset = hasToggleDrag ? 1 : 0;

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

      {hasToggleDrag ? (
        <section>
          <h2>4. 扩展：拖动选择</h2>
          <p>
            点击适合离散选择；拖动模式把同一个 glass indicator 变成连续输入。
            按住任意选项后横向拖动，镜片会跟随指针，跨过相邻选项中点时更新选择，
            松手后吸附到最近一项。点击和键盘语义仍由真实按钮保留。
          </p>
          <div className="study-readable-example">
            <DraggableToggleExample />
          </div>
          <div className="study-step-grid">
            <article>
              <span>01</span>
              <h3>捕获指针</h3>
              <p>pointer capture 保证手指或鼠标离开按钮后，拖动流仍由当前控件接收。</p>
            </article>
            <article>
              <span>02</span>
              <h3>连续插值</h3>
              <p>位置直接跟随指针，宽度和高度在左右选项的实际 bbox 之间插值。</p>
            </article>
            <article>
              <span>03</span>
              <h3>更新选择</h3>
              <p>指针跨过选项中心分界时更新状态，让图标、文字和折射 overlay 同步。</p>
            </article>
            <article>
              <span>04</span>
              <h3>松手吸附</h3>
              <p>释放后复用 50 / 13 的 spring 回到最近选项，并继续完成速度形变回弹。</p>
            </article>
          </div>
          <GuideCodeBlock
            sourceId="toggle-drag-example"
            label="拖动扩展实际运行源码"
          />
          <p className="study-browser-note">
            拖动只连续更新 lens position、filter region 和选中态；只有插值后的镜片尺寸变化
            才会更新 displacement map。控件使用 pointer events，因此鼠标、触控笔和触摸屏共用一条路径。
          </p>
        </section>
      ) : null}

      <section>
        <h2>{4 + sectionOffset}. 为什么这样写</h2>
        {chapter.reasons.map(reason => (
          <article className="study-reason" key={reason.title}>
            <h3>{reason.title}</h3>
            <p>{reason.body}</p>
          </article>
        ))}
      </section>

      <section>
        <h2>{5 + sectionOffset}. 参数与行为校核</h2>
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
        <h2>{6 + sectionOffset}. 常见错误与验收</h2>
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
