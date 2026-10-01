import { projectPoint } from '../geometry/perspective';
import type { ScreenFrame } from '../geometry/screenSpace';
import type { Vec3 } from '../geometry/vec3';
import { depthOpacity, gridLineWidth, type Primitive } from './targets';

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
  let items: { prim: Primitive; el: SVGElement }[] = [];

  return {
    setScene(primitives) {
      items = primitives.map((prim) => {
        if (prim.kind === 'line') {
          const el = document.createElementNS(SVG_NS, 'line');
          el.setAttribute('stroke', prim.role === 'grid' ? GRID_COLOR : STICK_COLOR);
          el.setAttribute('stroke-width', String(prim.role === 'grid' ? gridLineWidth(prim.depth) : STICK_WIDTH));
          el.setAttribute('stroke-linecap', 'round');
          el.setAttribute('opacity', String(depthOpacity(prim.depth)));
          return { prim, el };
        }
        const el = document.createElementNS(SVG_NS, 'polygon');
        el.setAttribute('fill', prim.fill);
        el.setAttribute('opacity', String(depthOpacity(prim.depth)));
        return { prim, el };
      });
      svg.replaceChildren(...items.map((i) => i.el));
    },

    render(eye, frame) {
      for (const { prim, el } of items) {
        if (prim.kind === 'line') {
          const a = projectPoint(eye, prim.a, frame);
          const b = projectPoint(eye, prim.b, frame);
          if (!a || !b) {
            el.setAttribute('visibility', 'hidden');
            continue;
          }
          el.setAttribute('visibility', 'visible');
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
        el.setAttribute('visibility', visible ? 'visible' : 'hidden');
        if (visible) el.setAttribute('points', points);
      }
    },
  };
}
