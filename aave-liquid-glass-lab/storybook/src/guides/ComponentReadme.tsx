import { GuideCodeBlock } from '../docs/GuideCodeBlock';
import { OriginModuleHost } from '../origin/OriginModuleHost';
import type { StudyCaseId } from '../origin/types';
import { guideChapters } from './content';
import './guide.css';

export function ComponentReadme({ studyCase }: { studyCase: StudyCaseId }) {
  const chapter = guideChapters[studyCase];

  return (
    <div className="study-component-readme">
      <p className="study-lede">{chapter.summary}</p>

      <section className="study-live-reference" aria-label={`${chapter.title} 交互效果`}>
        <OriginModuleHost caseId={studyCase === 'overview' ? 'hero' : studyCase} />
      </section>

      <h2>这个组件解决什么问题</h2>
      <p>{chapter.question}</p>

      <h2>实现结构</h2>
      <ol>
        {chapter.buildSteps.slice(0, 3).map(step => (
          <li key={step.title}>
            <strong>{step.title}</strong>：{step.body}
          </li>
        ))}
      </ol>

      <GuideCodeBlock sourceId={chapter.primarySource} />

      <h2>先记住三条规则</h2>
      <ul>
        {chapter.principle.map(rule => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      <p className="study-next-step">
        下一页 <strong>构建与代码</strong> 会把这套结构拆成数据流、数学、生命周期、浏览器差异和验收步骤。
      </p>
    </div>
  );
}
