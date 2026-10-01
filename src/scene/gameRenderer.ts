import { pieceAt, type BuiltLevel } from '../game/pieces';
import type { GameView } from '../game/session';
import { projectPoint } from '../geometry/perspective';
import { screenMmToViewport, type Point2, type ScreenFrame } from '../geometry/screenSpace';
import type { Vec3 } from '../geometry/vec3';

const SVG_NS = 'http://www.w3.org/2000/svg';
const GHOST_COLOR = '#f4f1ea';

export interface GameRenderer {
  /** Replace the drawn level; creates one ghost and one piece line per piece. */
  setLevel(level: BuiltLevel): void;
  /** Project every piece from `eye` and update the SVG in place. */
  render(eye: Vec3, frame: ScreenFrame, view: GameView): void;
}

const px = (v: number) => v.toFixed(2);

function setLine(el: SVGLineElement, a: Point2, b: Point2): void {
  el.setAttribute('x1', px(a.x));
  el.setAttribute('y1', px(a.y));
  el.setAttribute('x2', px(b.x));
  el.setAttribute('y2', px(b.y));
}

export function createGameRenderer(svg: SVGSVGElement): GameRenderer {
  const ghostGroup = document.createElementNS(SVG_NS, 'g');
  ghostGroup.setAttribute('stroke', GHOST_COLOR);
  ghostGroup.setAttribute('stroke-opacity', '0.15');
  ghostGroup.setAttribute('stroke-width', '1.5');
  ghostGroup.setAttribute('stroke-dasharray', '6 6');
  const pieceGroup = document.createElementNS(SVG_NS, 'g');
  pieceGroup.setAttribute('stroke-linecap', 'round');
  svg.replaceChildren(ghostGroup, pieceGroup);

  let level: BuiltLevel | null = null;
  let ghosts: SVGLineElement[] = [];
  let pieces: { el: SVGLineElement; visible: boolean | null }[] = [];
  let lastColor = '';
  let lastWidth = '';
  /** Groups stay hidden from setLevel until the first render, so no zero-length line paints as a dot. */
  let shown = false;

  return {
    setLevel(next) {
      level = next;
      ghosts = next.pieces.map(() => document.createElementNS(SVG_NS, 'line'));
      pieces = next.pieces.map(() => ({ el: document.createElementNS(SVG_NS, 'line'), visible: null }));
      ghostGroup.replaceChildren(...ghosts);
      pieceGroup.replaceChildren(...pieces.map((p) => p.el));
      ghostGroup.setAttribute('visibility', 'hidden');
      pieceGroup.setAttribute('visibility', 'hidden');
      shown = false;
    },

    render(eye, frame, view) {
      if (!level) return;
      if (!shown) {
        ghostGroup.setAttribute('visibility', 'visible');
        pieceGroup.setAttribute('visibility', 'visible');
        shown = true;
      }
      // Colour and width are shared by every piece: set them once on the group.
      if (view.color !== lastColor) {
        pieceGroup.setAttribute('stroke', view.color);
        lastColor = view.color;
      }
      const width = view.widthPx.toFixed(2);
      if (width !== lastWidth) {
        pieceGroup.setAttribute('stroke-width', width);
        lastWidth = width;
      }
      level.pieces.forEach((piece, i) => {
        setLine(ghosts[i]!, screenMmToViewport(piece.glass[0], frame), screenMmToViewport(piece.glass[1], frame));
        const [qa, qb] = pieceAt(piece, view.flyT);
        const a = projectPoint(eye, qa, frame);
        const b = projectPoint(eye, qb, frame);
        const item = pieces[i]!;
        const visible = a !== null && b !== null;
        if (visible !== item.visible) {
          item.el.setAttribute('visibility', visible ? 'visible' : 'hidden');
          item.visible = visible;
        }
        if (a && b) setLine(item.el, a, b);
      });
    },
  };
}
