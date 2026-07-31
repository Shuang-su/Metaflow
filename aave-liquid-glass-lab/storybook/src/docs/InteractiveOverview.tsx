import { useState } from 'react';
import { GuideCodeBlock } from './GuideCodeBlock';
import { OriginModuleHost } from '../origin/OriginModuleHost';
import type { OriginCaseId } from '../origin/types';
import '../guides/guide.css';

const domCases: Array<{ id: OriginCaseId; label: string }> = [
  { id: 'switch', label: 'Switch' },
  { id: 'slider', label: 'Slider' },
  { id: 'toggle', label: 'Tabs' }
];

const surfaceCases: Array<{ id: OriginCaseId; label: string }> = [
  { id: 'qr', label: 'QR Canvas' },
  { id: 'video', label: 'Video' },
  { id: 'how-it-works', label: 'Map' }
];

function LiveSampler({
  cases,
  initial
}: {
  cases: Array<{ id: OriginCaseId; label: string }>;
  initial: OriginCaseId;
}) {
  const [selected, setSelected] = useState<OriginCaseId>(initial);
  return (
    <div className="study-live-sampler">
      <div className="study-sampler-tabs" role="tablist" aria-label="选择交互案例">
        {cases.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected === item.id}
            onClick={() => setSelected(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <OriginModuleHost caseId={selected} />
    </div>
  );
}

export function InteractiveOverview() {
  return (
    <div className="study-overview">
      <section className="study-overview-hero">
        <OriginModuleHost caseId="hero" />
      </section>

      <section>
        <h2>同一种材料，两个渲染入口</h2>
        <p>
          普通 DOM 由 SVG filter 折射，Canvas 与 Video 由 WebGL shader 折射。两条路径共享镜片
          geometry、displacement map 通道和更新规则，差别只在如何读取 source pixels。
        </p>
        <div className="study-path-grid">
          <article>
            <span>DOM / SVG</span>
            <h3>真实控件继续负责交互</h3>
            <p>checkbox、range 和 button 保留语义，玻璃层只消费派生位置与视觉状态。</p>
          </article>
          <article>
            <span>Canvas / WebGL</span>
            <h3>像素表面进入纹理管线</h3>
            <p>source、map 与 blur texture 在 shader 中重新采样，支持 QR 动画与 live video。</p>
          </article>
        </div>
      </section>

      <section>
        <h2>先操作，再读代码</h2>
        <p>切换下面的案例，观察镜片如何跟随状态、位置和尺寸变化，而输入语义仍由原生控件提供。</p>
        <LiveSampler cases={domCases} initial="switch" />
      </section>

      <section>
        <h2>从最小组件骨架开始</h2>
        <p>
          组件只声明 target、lens geometry 和 position；生成 map、建立 filter 与清理由共享核心负责。
          这让交互组件保持普通 React 结构，而玻璃材料可以独立演进。
        </p>
        <GuideCodeBlock sourceId="hero-example" />
        <p>
          map 外部使用中性位移，R/G 描述水平和垂直采样方向，B 保存边缘与高光信息。展开下面的核心
          生成器可以看到 SDF、dome 与 splay 如何被编码。
        </p>
        <GuideCodeBlock sourceId="lens-map" open={false} label="核心生成器" />
      </section>

      <section>
        <h2>进入像素表面</h2>
        <p>QR、Video 和参数实验使用同一套几何，但由 WebGL 或可视化 map 完成验证。</p>
        <LiveSampler cases={surfaceCases} initial="qr" />
      </section>
    </div>
  );
}
