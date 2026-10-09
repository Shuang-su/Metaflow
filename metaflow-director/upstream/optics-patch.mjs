// Build-time only. Immutable upstream source hashes remain verifiable.
export function opticsPatch(code, id) {
  const replace = (from, to) => {
    if (!code.includes(from))
      throw Error(`Pinned optics anchor missing: ${id}: ${from}`);
    code = code.replace(from, to);
  };
  if (id.endsWith("/scene.ts")) {
    replace(
      "(profiling || this.autoSampling || this.movingRender) && !this.lockedRenderMode;",
      "((profiling || this.autoSampling || this.movingRender) && !this.lockedRenderMode) || !!(this as any).directorProfile;",
    );
    replace(
      "const observer = new ResizeObserver",
      "const observer = (this as any).directorObserver = new ResizeObserver",
    );
    replace(
      "canvasContainer.addEventListener('pointermove', (event: PointerEvent) => {",
      "const directorPointerMove = (event: PointerEvent) => {",
    );
    replace(
      "        }, true);",
      "        };\n        canvasContainer.addEventListener('pointermove', directorPointerMove, true);\n        (this as any).directorDetach = () => canvasContainer.removeEventListener('pointermove', directorPointerMove, true);",
    );
  }
  if (id.endsWith("/projected-splat-renderer.ts")) {
    replace(
      "const cameraComponent = camera.camera;",
      "const cameraComponent = camera.camera;\n        cameraComponent.calculateProjection?.(cameraComponent.projectionMatrix, 0);",
    );
    replace(
      "const { camera, targetSize, events } = this.scene;",
      "const { camera, events } = this.scene;\n        const targetSize = camera.targetSize;",
    );
    replace(
      "new UniformFormat('numSplats', UNIFORMTYPE_UINT)",
      "new UniformFormat('directorOptics', UNIFORMTYPE_VEC4),\n            new UniformFormat('directorPeaking', UNIFORMTYPE_VEC4),\n            new UniformFormat('numSplats', UNIFORMTYPE_UINT)",
    );
    replace(
      "compute.setParameter('numSplats',",
      "compute.setParameter('directorOptics', (this.scene as any).directorOptics ?? [1,0,0,1]);\n            compute.setParameter('directorPeaking', (this.scene as any).directorPeaking ?? [0,0,0,0]);\n            compute.setParameter('numSplats',",
    );
  }
  if (id.endsWith("/shaders/projected-splat-projector-shader.ts")) {
    replace(
      "struct ProjectorUniforms {",
      "struct ProjectorUniforms {\n    directorOptics: vec4f,\n    directorPeaking: vec4f,",
    );
    replace(
      "let determinant = cov00 * cov11 - cov01 * cov01;",
      `let originalDet = max(1e-20, cov00 * cov11 - cov01 * cov01);
    var defocus = 0.0;
    if (uniforms.directorOptics.z > 0.5 && depth > 0.0 && (uniforms.directorOptics.w > 0.5 || depth >= uniforms.directorOptics.x)) {
        let coc = 0.5 * focal.x * uniforms.directorOptics.y * abs(1.0 / max(depth, 1e-6) - 1.0 / uniforms.directorOptics.x);
        // coc is the circle radius. A uniform disk has per-axis variance R^2/4.
        // z also compensates the pinned re-based Gaussian's truncated variance.
        // Aperture radius and the independent optical warning stay unchanged.
        defocus = 0.25 * coc * coc * uniforms.directorOptics.z;
    }
    cov00 += defocus;
    cov11 += defocus;
    let determinant = cov00 * cov11 - cov01 * cov01;`,
    );
    replace(
      "gradedAlpha = clamp(gradedAlpha, 0.0, 1.0);",
      "gradedAlpha = clamp(gradedAlpha, 0.0, 1.0) * sqrt(originalDet / max(determinant,1e-20));",
    );
    replace(
      "color = vec4f(graded, gradedAlpha);",
      `color = vec4f(graded, gradedAlpha);
    // A separate centered clear pass. Never tint an aperture sample.
    if (uniforms.directorPeaking.x > 0.5) {
        let coc = 0.5 * focal.x * uniforms.directorOptics.y * abs(1.0 / max(depth, 1e-6) - 1.0 / uniforms.directorOptics.x) / uniforms.viewport.y;
        let warning = pow(clamp(1.0 - exp(-coc * 18.0), 0.0, 1.0), 0.85) * 0.76;
        color = vec4f(vec3f(warning), gradedAlpha);
    }`,
    );
  }
  return code;
}
