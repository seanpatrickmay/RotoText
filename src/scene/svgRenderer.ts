import { projectPoint } from '../geometry/perspective';
import type { ScreenFrame } from '../geometry/screenSpace';
import type { Vec3 } from '../geometry/vec3';
import { depthOpacity, fogColor, gridLineWidth, type Primitive } from './targets';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRID_COLOR = '#8a8f98';
const STICK_COLOR = '#f4f1ea';
const STICK_WIDTH = 1.25;

export interface SceneRenderer {
  /** Replace the scene; creates one SVG element per primitive, in painter's order. */
  setScene(primitives: readonly Primitive[]): void;
  /** Project every primitive from `eye` and update the SVG in place. */
  render(eye: Vec3, frame: ScreenFrame): void;
}

const px = (v: number) => v.toFixed(2);

export function createSvgRenderer(svg: SVGSVGElement): SceneRenderer {
  // `visible` is the last value written, so unchanged visibility costs no DOM write.
  let items: { prim: Primitive; el: SVGElement; visible: boolean | null }[] = [];

  const setVisible = (item: { el: SVGElement; visible: boolean | null }, visible: boolean) => {
    if (item.visible === visible) return;
    item.visible = visible;
    item.el.setAttribute('visibility', visible ? 'visible' : 'hidden');
  };

  return {
    setScene(primitives) {
      items = primitives.map((prim) => {
        if (prim.kind === 'line') {
          const el = document.createElementNS(SVG_NS, 'line');
          el.setAttribute('stroke', prim.role === 'grid' ? GRID_COLOR : STICK_COLOR);
          el.setAttribute('stroke-width', String(prim.role === 'grid' ? gridLineWidth(prim.depth) : STICK_WIDTH));
          el.setAttribute('stroke-linecap', 'round');
          el.setAttribute('stroke-opacity', String(depthOpacity(prim.depth)));
          return { prim, el, visible: null };
        }
        // Fog, not alpha: a far disc stays opaque so nothing shows through it.
        const el = document.createElementNS(SVG_NS, 'polygon');
        el.setAttribute('fill', fogColor(prim.fill, prim.depth));
        return { prim, el, visible: null };
      });
      svg.replaceChildren(...items.map((i) => i.el));
    },

    render(eye, frame) {
      for (const item of items) {
        const { prim, el } = item;
        if (prim.kind === 'line') {
          const a = projectPoint(eye, prim.a, frame);
          const b = projectPoint(eye, prim.b, frame);
          if (!a || !b) {
            setVisible(item, false);
            continue;
          }
          setVisible(item, true);
          el.setAttribute('x1', px(a.x));
          el.setAttribute('y1', px(a.y));
          el.setAttribute('x2', px(b.x));
          el.setAttribute('y2', px(b.y));
          continue;
        }
        let points = '';
        let visible = true;
        for (const q of prim.points) {
          const p = projectPoint(eye, q, frame);
          if (!p) {
            visible = false;
            break;
          }
          points += `${px(p.x)},${px(p.y)} `;
        }
        setVisible(item, visible);
        if (visible) el.setAttribute('points', points);
      }
    },
  };
}
