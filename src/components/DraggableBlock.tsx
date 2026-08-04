import { useRef, type ReactNode } from "react";

/**
 * Drag an appointment onto another day.
 *
 * Built on pointer events rather than HTML5 drag-and-drop, which barely works
 * on touch — and this app is used on a phone. That means distinguishing a drag
 * from a tap by hand: movement under the threshold opens the appointment,
 * beyond it starts a drag.
 *
 * The drop target is found with elementFromPoint rather than by listening on
 * every cell, so the calendar does not need a listener per day.
 */
export default function DraggableBlock({
  className,
  style,
  onOpen,
  onDropOnDay,
  children,
  ...rest
}: {
  className?: string;
  style?: React.CSSProperties;
  onOpen: () => void;
  onDropOnDay: (date: string) => void;
  children: ReactNode;
} & Record<string, unknown>) {
  const origin = useRef<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const ghost = useRef<HTMLElement | null>(null);

  /** Below this, it was a tap. */
  const THRESHOLD = 8;

  function cleanup() {
    ghost.current?.remove();
    ghost.current = null;
    document.querySelectorAll(".is-droptarget").forEach((el) => el.classList.remove("is-droptarget"));
  }

  function dayUnder(x: number, y: number): { date: string; el: Element } | null {
    // The ghost sits under the cursor, so it has to be ignored while looking.
    const previous = ghost.current?.style.display;
    if (ghost.current) ghost.current.style.display = "none";
    const el = document.elementFromPoint(x, y)?.closest("[data-day]");
    if (ghost.current && previous !== undefined) ghost.current.style.display = previous;
    const date = el?.getAttribute("data-day");
    return el && date ? { date, el } : null;
  }

  return (
    <button
      {...rest}
      className={className}
      style={{ ...style, touchAction: "none" }}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        origin.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!origin.current) return;
        const dx = e.clientX - origin.current.x;
        const dy = e.clientY - origin.current.y;

        if (!dragging.current && Math.hypot(dx, dy) < THRESHOLD) return;

        if (!dragging.current) {
          dragging.current = true;
          const source = e.currentTarget as HTMLElement;
          const rect = source.getBoundingClientRect();
          const copy = source.cloneNode(true) as HTMLElement;
          copy.className = `${source.className} agenda-ghost`;
          copy.style.width = `${rect.width}px`;
          copy.style.height = `${rect.height}px`;
          document.body.appendChild(copy);
          ghost.current = copy;
        }

        if (ghost.current) {
          ghost.current.style.left = `${e.clientX + 8}px`;
          ghost.current.style.top = `${e.clientY - 10}px`;
        }

        document.querySelectorAll(".is-droptarget").forEach((el) => el.classList.remove("is-droptarget"));
        dayUnder(e.clientX, e.clientY)?.el.classList.add("is-droptarget");
      }}
      onPointerUp={(e) => {
        const wasDragging = dragging.current;
        const target = wasDragging ? dayUnder(e.clientX, e.clientY) : null;
        origin.current = null;
        dragging.current = false;
        cleanup();

        if (!wasDragging) onOpen();
        else if (target) onDropOnDay(target.date);
      }}
      onPointerCancel={() => {
        origin.current = null;
        dragging.current = false;
        cleanup();
      }}
    >
      {children}
    </button>
  );
}
