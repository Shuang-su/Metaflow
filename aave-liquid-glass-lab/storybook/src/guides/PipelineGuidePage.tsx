import { GuideCodeBlock } from '../docs/GuideCodeBlock';
import type { StudyCaseId } from '../origin/types';
import { guideChapters } from './content';
import './guide.css';

export function PipelineGuidePage({ studyCase }: { studyCase: 'qr' | 'video' }) {
  const chapter = guideChapters[studyCase];
  const isVideo = studyCase === 'video';

  return (
    <main className="study-guide-page">
      <header>
        <h1>{chapter.title}：WebGL 管线</h1>
        <p className="study-lede">
          {isVideo
            ? '从 live video frame 到多个 circle/bar lens，逐步建立可暂停、可 seek、可恢复的 renderer。'
            : '从 source canvas 到 WebGL output，逐步管理 DPR、纹理更新、点击动画和像素验收。'}
        </p>
      </header>

      <section>
        <h2>资源图</h2>
        <div className="study-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>资源</th>
                <th>何时创建</th>
                <th>何时更新</th>
                <th>何时释放</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>source texture</td>
                <td>renderer 初始化</td>
                <td>{isVideo ? '每个有效视频帧' : '二维码内容变化'}</td>
                <td>controller.dispose()</td>
              </tr>
              <tr>
                <td>map texture</td>
                <td>镜片首次出现</td>
                <td>geometry / material 变化</td>
                <td>镜片移除或 renderer 销毁</td>
              </tr>
              <tr>
                <td>blur texture</td>
                <td>renderer 初始化</td>
                <td>{isVideo ? '随视频帧更新' : 'source 变化'}</td>
                <td>controller.dispose()</td>
              </tr>
              <tr>
                <td>output canvas</td>
                <td>组件挂载</td>
                <td>resize 同步 drawing buffer</td>
                <td>组件卸载</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Shader 如何消费 Map</h2>
        <p>
          shader 先把 R/G 从 0–1 还原到 -1–1，换算成 source texture 的 UV offset；R、G、B
          再使用略有差异的采样距离形成色散。B 通道提供高光强度，blur texture 只在高曲率区域混入。
        </p>
        <GuideCodeBlock sourceId="webgl-shader" />
      </section>

      <section>
        <h2>Renderer 生命周期</h2>
        <p>
          初始化阶段只创建一次 program、buffer 和 texture。resize 同步 drawing buffer、viewport 与
          lens pixel coordinates；交互只更新 map 或 uniforms。销毁阶段必须停止 RAF 并删除所有
          WebGL 句柄。
        </p>
        <GuideCodeBlock sourceId="webgl-controller" />
      </section>

      <section>
        <h2>{isVideo ? '媒体事件与恢复策略' : '点击动画与 DPR'}</h2>
        <ul>
          {isVideo ? (
            <>
              <li><code>play</code> 启动 renderer 帧循环，<code>pause</code> 停止常驻 RAF。</li>
              <li><code>seeked</code> 后立即上传当前帧，不等待下一次播放事件。</li>
              <li>context loss 后不能继续复用旧 texture/program 句柄，应重新创建 controller。</li>
              <li>跨域视频需要正确 CORS；<code>muted</code> 与 <code>playsInline</code> 保持移动端行为。</li>
            </>
          ) : (
            <>
              <li>CSS 尺寸用于布局，drawing buffer、viewport 和 lens 坐标统一乘 DPR。</li>
              <li>点击动画可以改变 geometry 或 uniforms，但静态 source 不应逐帧重传。</li>
              <li>每次 resize 后重新生成 atlas，并核对 lens 中心与二维码 Logo 中心。</li>
              <li>用像素签名证明动画真的改变了 WebGL output，而不是只改了 DOM overlay。</li>
            </>
          )}
        </ul>
        <GuideCodeBlock sourceId={isVideo ? 'video-example' : 'qr-example'} />
      </section>
    </main>
  );
}
