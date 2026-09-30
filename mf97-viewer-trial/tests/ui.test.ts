import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { initAnnotationControls } from "../../metaflow-viewer/src/ui/annotation-controls";
import {
  withNavigationEnabled,
  navigationCapability,
} from "../../metaflow-viewer/src/navigation/nav-annotation";
import {
  clipMapSegment,
  mapLayerMembership,
  mapRouteForLayer,
} from "../../metaflow-viewer/src/navigation/drawing";
import {
  annotationHotspotPresentation,
  annotationPresentationPose,
} from "../../metaflow-viewer/src/ui/annotations";

// Minimal DOM event harness: run the real controls without a WebGL device.
class Element {
  children: Element[] = [];
  parent: Element | null = null;
  className = "";
  textContent = "";
  hidden = false;
  disabled = false;
  id = "";
  type = "";
  dataset: Record<string, string> = {};
  attrs = new Map<string, string>();
  listeners = new Map<string, Set<(event: Event) => void>>();
  classList = {
    contains: (name: string) => this.className.split(" ").includes(name),
    add: (name: string) => this.classList.toggle(name, true),
    remove: (name: string) => this.classList.toggle(name, false),
    toggle: (name: string, force?: boolean) => {
      const classes = new Set(this.className.split(" ").filter(Boolean)),
        on = force ?? !classes.has(name);
      if (on) classes.add(name);
      else classes.delete(name);
      this.className = [...classes].join(" ");
      return on;
    },
  };
  append(...nodes: Element[]) {
    nodes.forEach((node) => {
      node.parent = this;
      this.children.push(node);
    });
  }
  replaceChildren(...nodes: Element[]) {
    this.children.forEach((node) => {
      node.parent = null;
    });
    this.children = [];
    this.append(...nodes);
  }
  querySelector(selector: string): Element | null {
    for (const child of this.children) {
      if (child.classList.contains(selector.slice(1))) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  contains(node: Element): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }
  setAttribute(key: string, value: string) {
    this.attrs.set(key, value);
  }
  getAttribute(key: string) {
    return this.attrs.get(key) ?? null;
  }
  addEventListener(type: string, handler: (event: Event) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(handler);
  }
  removeEventListener(type: string, handler: (event: Event) => void) {
    this.listeners.get(type)?.delete(handler);
  }
  dispatchEvent(event: Event): boolean {
    if (!event.target)
      Object.defineProperty(event, "target", {
        configurable: true,
        value: this,
      });
    this.listeners.get(event.type)?.forEach((handler) => handler(event));
    if (event.bubbles && !event.cancelBubble) this.parent?.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  focus() {
    dom.activeElement = this;
  }
  click() {
    this.dispatchEvent(new Event("click", { bubbles: true }));
  }
}
const dom = {
  activeElement: null as Element | null,
  createElement: () => new Element(),
};
class MouseEvent extends Event {}
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: dom,
});
Object.defineProperty(globalThis, "MouseEvent", {
  configurable: true,
  value: MouseEvent,
});
class Events {
  handlers = new Map<string, Set<() => void>>();
  on(name: string, handler: () => void) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(handler);
    return { off: () => this.handlers.get(name)?.delete(handler) };
  }
  fire(name: string) {
    this.handlers.get(name)?.forEach((handler) => handler());
  }
}
const fixture = (guidanceMode = true, invalidNav = false) => {
  const root = new Element(),
    nav = new Element();
  nav.className = "sse-annotationNav";
  root.append(nav);
  for (const name of [
    "annotationPrev",
    "annotationInfo",
    "annotationNext",
    "annotationMenu",
  ]) {
    const node = new Element();
    node.className = `sse-${name}`;
    nav.append(node);
  }
  const info = nav.querySelector(".sse-annotationInfo")!;
  for (const name of ["annotationNavNumber", "annotationNavTitle"]) {
    const node = new Element();
    node.className = `sse-${name}`;
    info.append(node);
  }
  for (const name of ["annotationsRow", "annotationsCheck"]) {
    const node = new Element();
    node.className = `sse-${name}`;
    root.append(node);
  }
  const base = {
    position: [0, 0, 0],
    title: "<b>plain text</b>",
    text: "",
    camera: { initial: { position: [0, 1.5, 0], target: [0, 0, 1], fov: 75 } },
  };
  const annotations = [
    base,
    withNavigationEnabled({ ...base, title: "Nav one" }, true),
    { ...base, title: "Ordinary content" },
    withNavigationEnabled({ ...base, title: "Nav two" }, true),
  ];
  if (invalidNav)
    annotations.push(
      withNavigationEnabled(
        {
          ...base,
          title: "Nav awaiting camera",
          camera: { initial: { ...base.camera.initial, fov: 0 } },
        },
        true,
      ),
    );
  const events = new Events(),
    selections: number[] = [];
  const state = {
    loaded: true,
    showAnnotations: true,
    selectedAnnotation: 1 as number | null,
    guidanceMode,
    guidanceTarget: 1 as number | null,
    inputMode: "desktop",
    controlsHidden: false,
  };
  const dispose = initAnnotationControls(
    {
      state,
      events,
      annotations,
      selectAnnotation: (index: number) => {
        selections.push(index);
      },
    } as any,
    root as any,
  );
  return {
    root,
    nav,
    info,
    state,
    events,
    selections,
    dispose,
    menu: nav.querySelector(".sse-annotationMenu")!,
    number: nav.querySelector(".sse-annotationNavNumber")!,
  };
};
const key = (name: string) => {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "key", { value: name });
  return event;
};

test("selected title opens a list retaining ordinary text and original indices", () => {
  const f = fixture(false);
  f.info.click();
  assert.equal(f.info.getAttribute("aria-expanded"), "true");
  assert.equal(f.menu.hidden, false);
  assert.equal(f.menu.children.length, 4);
  assert.equal(f.menu.children[0].children[0].textContent, "<b>plain text</b>");
  assert.equal(f.menu.children[2].children[1].textContent, "说明");
  f.menu.children[2].click();
  assert.deepEqual(f.selections, [2]);
  assert.equal(f.state.guidanceTarget, 1);
  assert.equal(f.menu.hidden, true);
  f.dispose();
});
test("guided arrows retain Nav source indices; normal mode restores numbering and all markers", () => {
  const f = fixture();
  assert.equal(f.number.textContent, "");
  f.nav.querySelector(".sse-annotationNext")!.click();
  assert.deepEqual(f.selections, [3]);
  f.state.guidanceTarget = 3;
  f.events.fire("guidanceTarget:changed");
  f.nav.querySelector(".sse-annotationNext")!.click();
  assert.deepEqual(f.selections, [3, 1]);
  f.state.guidanceMode = false;
  f.state.selectedAnnotation = 1;
  f.events.fire("guidanceMode:changed");
  assert.equal(f.number.textContent, "2");
  f.nav.querySelector(".sse-annotationNext")!.click();
  assert.deepEqual(f.selections, [3, 1, 2]);
  f.dispose();
});
test("menu owns keyboard and wheel input; Escape restores title focus", () => {
  const f = fixture();
  let sceneKeys = 0,
    sceneWheels = 0;
  f.root.addEventListener("keydown", () => {
    sceneKeys++;
  });
  f.root.addEventListener("wheel", () => {
    sceneWheels++;
  });
  f.info.dispatchEvent(key("ArrowDown"));
  assert.equal(dom.activeElement, f.menu.children[1]);
  f.menu.dispatchEvent(new Event("wheel", { bubbles: true }));
  f.menu.children[1].dispatchEvent(key("Escape"));
  assert.equal(f.menu.hidden, true);
  assert.equal(dom.activeElement, f.info);
  assert.equal(sceneKeys, 0);
  assert.equal(sceneWheels, 0);
  f.dispose();
});
test("instances have unique menu ownership and disposal removes subscriptions", () => {
  const a = fixture(),
    b = fixture();
  assert.notEqual(a.menu.id, b.menu.id);
  assert.equal(a.info.getAttribute("aria-controls"), a.menu.id);
  a.dispose();
  assert.equal(a.menu.children.length, 0);
  assert.equal(
    [...a.events.handlers.values()].reduce(
      (n, handlers) => n + handlers.size,
      0,
    ),
    0,
  );
  b.info.click();
  assert.equal(b.menu.hidden, false);
  b.dispose();
});
test("declared Nav without a valid camera stays listed with a disabled reason", () => {
  const f = fixture(true, true);
  f.info.click();
  const item = f.menu.children[4];
  assert.equal(f.menu.children[0].hidden, true);
  assert.equal(f.menu.children[2].hidden, true);
  assert.equal(item.hidden, false);
  assert.equal(item.disabled, true);
  assert.equal(item.children[0].textContent, "Nav awaiting camera");
  assert.match(item.children[1].textContent, /有效观看相机/);
  f.nav.querySelector(".sse-annotationNext")!.click();
  assert.deepEqual(f.selections, [3]);
  f.dispose();
});

test("guide presentation retains ordinary information hotspots while limiting only Nav hotspots", () => {
  const ordinary = { title: "ordinary", text: "" };
  const nav = withNavigationEnabled(
    {
      ...ordinary,
      camera: {
        initial: { position: [0, 1.5, 0], target: [0, 0, 1], fov: 75 },
      },
    },
    true,
  );
  const near = new Set([1]);
  assert.deepEqual(annotationHotspotPresentation(ordinary, 0, near, true, 1), {
    visible: true,
    guidance: true,
    navigable: false,
    target: false,
    kind: "information",
  });
  assert.equal(
    annotationHotspotPresentation(nav, 1, near, true, 1).kind,
    "navigation",
  );
  assert.equal(
    annotationHotspotPresentation(nav, 1, near, true, 1).visible,
    true,
  );
  assert.equal(
    annotationHotspotPresentation(nav, 2, near, true, 1).visible,
    false,
  );
  assert.equal(
    annotationHotspotPresentation(ordinary, 0, near, false, null).kind,
    "number",
  );
  assert.equal(
    annotationHotspotPresentation(nav, 2, near, false, null).visible,
    true,
  );
});

test("map clipping includes crossing segments with both endpoints outside the displayed layer", () => {
  const start = { x: 0, y: -1, z: 0 },
    end = { x: 100, y: 3, z: 20 };
  assert.deepEqual(clipMapSegment(start, end, [0, 2]), {
    start: { x: 25, y: 0, z: 5 },
    end: { x: 75, y: 2, z: 15 },
    enters: true,
    exits: true,
  });
  assert.deepEqual(clipMapSegment(end, start, [0, 2]), {
    start: { x: 75, y: 2, z: 15 },
    end: { x: 25, y: 0, z: 5 },
    enters: true,
    exits: true,
  });
  assert.equal(
    clipMapSegment({ x: 0, y: 3, z: 0 }, { x: 1, y: 3, z: 1 }, [0, 2]),
    null,
  );
  assert.deepEqual(start, { x: 0, y: -1, z: 0 });
  assert.deepEqual(end, { x: 100, y: 3, z: 20 });
});

test("leaving walk mode uses the current camera rather than a stale physics sample for nearby markers", () => {
  const cameraPosition = { x: 30, y: 4, z: 1 };
  const lastWalk = { position: { x: 0, y: 1.5, z: 0 }, supportHeight: 0 };
  assert.deepEqual(
    annotationPresentationPose("walk", lastWalk, cameraPosition),
    {
      position: lastWalk.position,
      supportHeight: 0,
    },
  );
  for (const mode of ["orbit", "fly"] as const) {
    assert.deepEqual(
      annotationPresentationPose(mode, lastWalk, cameraPosition),
      {
        position: cameraPosition,
        supportHeight: undefined,
      },
    );
  }
  assert.deepEqual(annotationPresentationPose("walk", null, cameraPosition), {
    position: cameraPosition,
    supportHeight: undefined,
  });
});

test("actual built-in selection dispatch keeps ordinary and invalid Nav content independent from camera and goal", () => {
  // Run the actual small index.ts dispatch wrapper with observable dependencies;
  // the full Viewer constructor requires a graphics device and is outside this test.
  const source = readFileSync(
    new URL("../../metaflow-viewer/src/index.ts", import.meta.url),
    "utf8",
  );
  const start = source.indexOf("const uiHandle: ViewerHandle");
  const end = source.indexOf("// The built-in controls use", start);
  assert.ok(
    start >= 0 && end > start,
    "Viewer dispatch wrapper must remain identifiable",
  );
  const program = ts.transpileModule(source.slice(start, end), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const base = {
    position: [0, 0, 0],
    title: "ordinary",
    text: "body",
    camera: { initial: { position: [0, 1.5, 0], target: [0, 0, 1], fov: 75 } },
  };
  const valid = withNavigationEnabled(base, true);
  const invalid = {
    ...valid,
    camera: { initial: { ...base.camera.initial, fov: 0 } },
  };
  const state = {
    guidanceMode: true,
    guidanceTarget: 7,
    selectedAnnotation: null as number | null,
    cameraMode: "walk",
  };
  const cameraWrites: unknown[] = [],
    events: unknown[][] = [],
    publicSelections: unknown[] = [];
  const app = { renderNextFrame: false };
  const dispatch = new Function(
    "state",
    "global",
    "events",
    "app",
    "handle",
    "navigationCapability",
    `${program}\nreturn uiHandle.selectAnnotation;`,
  )(
    state,
    {
      settings: { annotations: [base, valid, invalid] },
      camera: {
        setPosition: (...values: unknown[]) => cameraWrites.push(values),
      },
    },
    { fire: (...values: unknown[]) => events.push(values) },
    app,
    { selectAnnotation: (index: unknown) => publicSelections.push(index) },
    navigationCapability,
  );
  dispatch(0);
  assert.equal(state.selectedAnnotation, 0);
  dispatch(2);
  assert.equal(state.selectedAnnotation, 2);
  assert.equal(state.guidanceTarget, 7);
  assert.equal(state.cameraMode, "walk");
  assert.deepEqual(cameraWrites, []);
  assert.deepEqual(publicSelections, []);
  assert.deepEqual(events, []);
  dispatch(1);
  assert.deepEqual(events, [["guidance:select", 1]]);
  dispatch(null);
  assert.equal(state.selectedAnnotation, null);
  assert.equal(state.guidanceTarget, 7);
  assert.equal(app.renderNextFrame, true);
  state.guidanceMode = false;
  dispatch(0);
  assert.deepEqual(publicSelections, [0]);
});

test("multiple map layers require explicit identities; overlapping heights do not associate regions", () => {
  const layers = [
    {
      id: "scene:ground",
      label: "地面",
      supportRange: [0, 2] as [number, number],
    },
    {
      id: "scene:bridge",
      label: "上层",
      supportRange: [0, 2] as [number, number],
    },
  ];
  assert.equal(
    mapLayerMembership(undefined, 1, layers, "scene:ground"),
    "unconfirmed",
  );
  assert.equal(
    mapLayerMembership("unbound:ground", 1, layers, "scene:ground"),
    "unconfirmed",
  );
  assert.equal(
    mapLayerMembership("scene:ground", 8, layers, "scene:ground"),
    "shown",
  );
  assert.equal(
    mapLayerMembership("scene:bridge", 1, layers, "scene:ground"),
    "other",
  );
  assert.equal(
    mapLayerMembership(undefined, 1, layers.slice(0, 1), "scene:ground"),
    "shown",
  );
  assert.equal(
    mapLayerMembership(undefined, 3, layers.slice(0, 1), "scene:ground"),
    "other",
  );
});

test("height clipping describes only a slice boundary, while verified route spans can name another layer", () => {
  const layers = [
    {
      id: "scene:ground",
      label: "地面",
      supportRange: [0, 2] as [number, number],
    },
    {
      id: "scene:upper",
      label: "上层",
      supportRange: [3, 5] as [number, number],
    },
  ];
  const route = {
    points: [
      { x: 0, y: 1, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 4, y: 4, z: 0 },
    ],
    polys: [],
    asset: "fixture",
    revision: 1,
  };
  const single = mapRouteForLayer(route, layers.slice(0, 1), "scene:ground");
  assert.equal(single.unconfirmed, false);
  assert.equal(single.segments.length, 2);
  assert.deepEqual(
    single.boundaries.map((boundary) => boundary.label),
    ["路线超出当前高度范围"],
  );
  const unknown = mapRouteForLayer(route, layers, "scene:ground");
  assert.equal(unknown.unconfirmed, true);
  assert.deepEqual(unknown.segments, []);
  assert.deepEqual(unknown.boundaries, []);
  const associated = {
    ...route,
    surfaces: [
      {
        surfaceId: "ground-surface",
        layerId: "scene:ground",
        start: 0,
        end: 1,
      },
      { surfaceId: "upper-surface", layerId: "scene:upper", start: 1, end: 2 },
    ],
  };
  const ground = mapRouteForLayer(associated, layers, "scene:ground");
  assert.equal(ground.unconfirmed, false);
  assert.deepEqual(ground.segments, [
    { start: route.points[0], end: route.points[1] },
  ]);
  assert.deepEqual(ground.boundaries, [
    { point: route.points[1], label: "通往 上层" },
  ]);
  assert.deepEqual(route.points[2], { x: 4, y: 4, z: 0 });
});

test("route layer display rejects invalid and conflicting spans and keeps repeated occurrences", () => {
  const layers = [
    { id: "scene:a", label: "A 层", supportRange: [-1, 1] as [number, number] },
    { id: "scene:b", label: "B 层", supportRange: [-1, 1] as [number, number] },
  ];
  const route = {
    points: [0, 1, 2, 3].map((x) => ({ x, y: 0, z: 0 })),
    polys: [],
    asset: "fixture",
    revision: 1,
    surfaces: [
      { surfaceId: "repeated", layerId: "scene:a", start: 0, end: 1 },
      { surfaceId: "other", layerId: "scene:b", start: 1, end: 2 },
      { surfaceId: "repeated", layerId: "scene:a", start: 2, end: 3 },
    ],
  };
  const selected = mapRouteForLayer(route, layers, "scene:a");
  assert.equal(selected.segments.length, 2);
  assert.deepEqual(
    selected.segments.map((segment) => segment.start.x),
    [0, 2],
  );
  assert.deepEqual(selected.boundaries, [
    { point: route.points[1], label: "通往 B 层" },
  ]);
  const invalid = mapRouteForLayer(
    {
      ...route,
      surfaces: [{ surfaceId: "bad", layerId: "scene:a", start: 0.5, end: 3 }],
    },
    layers,
    "scene:a",
  );
  assert.equal(invalid.unconfirmed, true);
  assert.deepEqual(invalid.segments, []);
  const conflicting = mapRouteForLayer(
    {
      ...route,
      surfaces: [
        { surfaceId: "a", layerId: "scene:a", start: 0, end: 3 },
        { surfaceId: "b", layerId: "scene:b", start: 0, end: 3 },
      ],
    },
    layers,
    "scene:a",
  );
  assert.equal(conflicting.unconfirmed, true);
  assert.deepEqual(conflicting.segments, []);
});
