import { GaussianMapGenerator } from "../maps/generator";
import {
  VoxelCollision,
  FlippedVoxelCollision,
} from "../../../metaflow-viewer/src/collision/voxel-collision";
import { extractSpans } from "./spans";
import { editCenter, sectionProjection, type SectionRequest } from "./section";
import type { GroundReview, GroundCandidate } from "./types";
import type { MapRenderJob } from "../maps/model";
export type ReviewScene = {
  id: string;
  job: MapRenderJob;
  sourceHash: string;
  collisionUrl: string;
  coverageUrl: string;
  gaussianProof?: { gaussianHash: string; verifiedFileCount: number };
};
export class SectionReview {
  private generator: GaussianMapGenerator | null = null;
  private sceneId = "";
  private sequence = 0;
  private abort: AbortController | null = null;
  private collision: { sourceHash: string; source: any } | null = null;
  private selected: ReturnType<SectionReview["current"]>;
  private busy = false;
  private evidence: ReturnType<SectionReview["current"]>;
  private raw: ImageData | null = null;
  private overlay: (() => void) | null = null;
  constructor(
    private current: () =>
      { review: GroundReview; candidate: GroundCandidate } | undefined,
    private scenes: () => ReviewScene[],
    private changed: () => void = () => {},
  ) {
    document.getElementById("section-render")!.onclick = () =>
      void this.render();
    document.getElementById("section-cancel")!.onclick = () => {
      this.cancel();
      document.getElementById("section-status")!.textContent =
        "已取消剖面生成。";
    };
    for (const id of ["section-edit", "section-axis"])
      document.getElementById(id)!.onchange = () => this.invalidate();
    document.getElementById("section-overlay")!.onchange = () => this.paint();
    window.addEventListener("pagehide", (event) => {
      this.cancel();
      if (!event.persisted) {
        this.generator?.destroy();
        this.generator = null;
      }
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) this.invalidate();
    });
  }
  selection() {
    const entry = this.current();
    if (entry === this.selected) return;
    this.selected = entry;
    this.invalidate();
    const select = document.getElementById("section-edit") as HTMLSelectElement;
    select.replaceChildren();
    entry?.candidate.edits.forEach((e, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `修改 ${i + 1} · ${e.after ? "填补" : "移除"}`;
      select.append(o);
    });
    this.updateButton();
  }
  hasEvidence() {
    return !!this.evidence && this.evidence === this.current();
  }
  private updateButton() {
    (document.getElementById("section-render") as HTMLButtonElement).disabled =
      this.busy || !this.current()?.candidate.edits.length;
  }
  private cancel() {
    this.sequence++;
    this.abort?.abort();
    this.abort = null;
    this.updateButton();
  }
  reset() {
    this.selected = undefined;
    this.invalidate();
  }
  private invalidate() {
    this.cancel();
    this.evidence = undefined;
    this.raw = null;
    this.overlay = null;
    this.paint();
    document.getElementById("section-status")!.textContent =
      "尚未生成当前修改的高斯剖面。";
    this.changed();
  }
  private paint() {
    const c = document.getElementById("gaussian-section") as HTMLCanvasElement,
      ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (this.raw) ctx.putImageData(this.raw, 0, 0);
    if (
      (document.getElementById("section-overlay") as HTMLInputElement).checked
    )
      this.overlay?.();
  }
  async render() {
    // Capture.grab and device creation cannot be preempted. Keep exclusive ownership
    // until the cancelled operation settles, even though its result is invalid now.
    if (this.busy) return;
    this.cancel();
    const seq = this.sequence,
      entry = this.current();
    if (!entry) return;
    const { review, candidate } = entry,
      scene = this.scenes().find((s) => s.sourceHash === review.sourceHash);
    const edit =
      candidate.edits[
        Number(
          (document.getElementById("section-edit") as HTMLSelectElement).value,
        )
      ];
    if (
      !scene?.gaussianProof ||
      scene.gaussianProof.gaussianHash !== scene.job.gaussianHash ||
      !edit
    ) {
      document.getElementById("section-status")!.textContent =
        "没有通过源指纹核验的高斯/碰撞源或修改项。";
      return;
    }
    const controller = new AbortController();
    this.abort = controller;
    const status = document.getElementById("section-status")!,
      button = document.getElementById("section-render") as HTMLButtonElement;
    this.busy = true;
    button.disabled = true;
    status.textContent = "加载独立高斯剖面，等待流式资源与排序；可取消。";
    try {
      const sceneKey = JSON.stringify(scene.job);
      if (this.sceneId !== sceneKey) {
        this.generator?.destroy();
        this.generator = null;
        this.sceneId = sceneKey;
      }
      if (!this.generator) {
        const g = await GaussianMapGenerator.create(
          document.getElementById("section-renderer") as HTMLCanvasElement,
          scene.job,
        );
        if (seq !== this.sequence) {
          g.destroy();
          return;
        }
        this.generator = g;
      }
      if (this.collision?.sourceHash !== review.sourceHash) {
        const [jr, br] = await Promise.all([
          fetch(scene.collisionUrl, { signal: controller.signal }),
          fetch(scene.collisionUrl.replace(/\.json$/, ".bin"), {
            signal: controller.signal,
          }),
        ]);
        if (!jr.ok || !br.ok) throw Error("原碰撞加载失败");
        const [jb, bb] = await Promise.all([
          jr.arrayBuffer(),
          br.arrayBuffer(),
        ]);
        const digest = async (b: ArrayBuffer) =>
          [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))]
            .map((n) => n.toString(16).padStart(2, "0"))
            .join("");
        if ((await digest(jb)) + ":" + (await digest(bb)) !== review.sourceHash)
          throw Error("原碰撞指纹不匹配");
        const m = JSON.parse(new TextDecoder().decode(jb)),
          words = new Uint32Array(bb),
          n = m.nodeWordCount ?? m.nodeCount;
        const C =
          review.coordinateSpace === "metaflow-rz180"
            ? FlippedVoxelCollision
            : VoxelCollision;
        const collision = new C(m, words.subarray(0, n), words.subarray(n));
        this.collision = {
          sourceHash: review.sourceHash,
          source: {
            collision,
            min: m.gridBounds.min,
            max: m.gridBounds.max,
            flipXY: review.coordinateSpace === "metaflow-rz180",
          },
        };
      }
      if (seq !== this.sequence) return;
      const center = editCenter(review, edit),
        axis = (document.getElementById("section-axis") as HTMLSelectElement)
          .value as "x" | "z";
      const bounds = {
        min: { x: center.x - 1, y: center.y - 0.48, z: center.z - 1 },
        max: { x: center.x + 1, y: center.y + 0.72, z: center.z + 1 },
      };
      bounds.min[axis] = center[axis] - 0.16;
      bounds.max[axis] = center[axis] + 0.16;
      const request: SectionRequest = {
          bounds,
          axis,
          width: 1000,
          height: 600,
        },
        projection = sectionProjection(request);
      const rendered = await this.generator.renderSection(
        request,
        controller.signal,
      );
      if (seq !== this.sequence) return;
      if (!rendered.hasSource || rendered.splats === 0)
        throw Error("范围内无已加载高斯来源，空白剖面不能用作接受依据");
      const verification = await fetch("/__mf97_review_context", {
        signal: controller.signal,
      });
      if (!verification.ok)
        throw Error("剖面生成期间源文件发生变化，不能用于接受修正");
      const verified = await verification.json();
      if (
        !verified.scenes.some(
          (s: ReviewScene) =>
            s.id === scene.id &&
            s.sourceHash === review.sourceHash &&
            s.gaussianProof?.gaussianHash === scene.gaussianProof?.gaussianHash,
        )
      )
        throw Error("剖面来源已失效");
      if (seq !== this.sequence) return;
      this.raw = rendered.image;
      const spans = extractSpans(this.collision.source, bounds, 1, 0).spans;
      this.overlay = () => {
        const ctx = (
          document.getElementById("gaussian-section") as HTMLCanvasElement
        ).getContext("2d")!;
        ctx.fillStyle = "#ffcf57";
        for (const p of spans) {
          const s = projection.project(p);
          ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
        }
        ctx.strokeStyle = "#7bea9b";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const [nx, ny, nz, d] = candidate.surface.plane;
        for (let i = 0; i <= 80; i++) {
          const p = {
            ...center,
            [projection.u]:
              projection.minU + ((projection.maxU - projection.minU) * i) / 80,
          };
          p.y = -(nx * p.x + nz * p.z + d) / ny;
          const q = projection.project(p);
          if (i) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
        }
        ctx.stroke();
        for (const e of candidate.edits) {
          const p = editCenter(review, e);
          if (!projection.contains(p)) continue;
          const q = projection.project(p),
            r = review.voxelResolution;
          ctx.strokeStyle = e.after ? "#68c7ff" : "#ff8a54";
          ctx.lineWidth = 2;
          ctx.strokeRect(
            q.x - (r / (projection.maxU - projection.minU)) * 500,
            q.y - (r / (projection.maxY - projection.minY)) * 300,
            (r / (projection.maxU - projection.minU)) * 1000,
            (r / (projection.maxY - projection.minY)) * 600,
          );
        }
      };
      this.paint();
      status.textContent = `已生成 ${axis === "z" ? "X–Y" : "Z–Y"} 剖面，厚度0.32米；${rendered.frames}帧准备，${spans.length}个原始支持样本。仅供逐项审查，不代表已接受或已通过行走。`;
      this.evidence = entry;
      this.changed();
    } catch (e) {
      if (seq === this.sequence)
        status.textContent =
          (e as Error).name === "AbortError"
            ? "已取消剖面生成。"
            : `剖面未完成：${(e as Error).message}`;
    } finally {
      this.busy = false;
      this.updateButton();
    }
  }
}
