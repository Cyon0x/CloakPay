import type { SVGProps } from "react";

/**
 * CloakPay icon set.
 *
 * One library, one grid (24px), one stroke weight, so every screen reads the
 * same. Drawn in-house rather than pulled from a package: the shapes are few
 * enough to keep in one reviewable file, and it removes a runtime dependency.
 */
/** A true circle. Two arcs with matching sweep flags, not a collapsed lens. */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0`;
}

const PATHS: Record<string, string[]> = {
  home: ["M3.5 10.6 12 3.6l8.5 7", "M6 9.4V20h12V9.4"],
  send: ["M7 17 17 7", "M9 7h8v8"],
  receive: ["M17 7 7 17", "M15 17H7V9"],
  link: [
    "M10.4 13.6a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1",
    "M13.6 10.4a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  activity: ["M3.5 12h3.8l2.4-6 3.9 12L16 12h4.5"],
  settings: ["M4.6 8.4h8.2", "M17.3 8.4h2.1", "M4.6 15.6h2.4", "M12.1 15.6h7.3", "M15.4 6.4v4", "M9.9 13.6v4"],
  user: ["M12 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2", "M4.8 20c.6-3.4 3.5-5.4 7.2-5.4s6.6 2 7.2 5.4"],
  search: [circle(10.6, 10.6, 6.6), "M15.4 15.4 20.5 20.5"],
  copy: ["M9 9h9.5v11H9z", "M15.2 6.2V4H5.5v11h2.2"],
  check: ["m4.8 12.6 4.6 4.6 9.8-10.4"],
  share: ["M12 15.5V3.6", "m8.2 7.4 3.8-3.8 3.8 3.8", "M5 14v6.4h14V14"],
  qr: [
    "M4 4h6v6H4z",
    "M14 4h6v6h-6z",
    "M4 14h6v6H4z",
    "M14 14h2.5v2.5H14z",
    "M19.5 14v2.5H17",
    "M14 19.5h2.5",
    "M19.5 19.5h0.01",
  ],
  wallet: [
    "M3.8 8.2A2.2 2.2 0 0 1 6 6h11.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2.2 2.2 0 0 1-2.2-2.2z",
    "M15.4 12.5h2.6",
  ],
  shield: ["M12 3.4 5.4 6v5.6c0 4.2 2.8 7.3 6.6 9 3.8-1.7 6.6-4.8 6.6-9V6z"],
  clock: [circle(12, 12, 8.2), "M12 7.4V12l3.1 2"],
  alert: ["M12 4.6 3.4 19.4h17.2z", "M12 10v4.2", "M12 17h0.01"],
  external: ["M13.5 4.6H19.4V10.5", "M19.4 4.6 11 13", "M18 14.4v4.6H5V6h4.6"],
  plus: ["M12 5.4v13.2", "M5.4 12h13.2"],
  close: ["M6.4 6.4 17.6 17.6", "M17.6 6.4 6.4 17.6"],
  lock: ["M6.6 10.6h10.8v9H6.6z", "M9 10.6V7.8a3 3 0 0 1 6 0v2.8"],
  bell: ["M18 16.2H6l1.2-2.1V11a4.8 4.8 0 0 1 9.6 0v3.1z", "M10.2 19.2h3.6"],
  logout: ["M14 7.4V5H5v14h9v-2.4", "M10.4 12h9.2", "m16.6 9 3 3-3 3"],
  gift: ["M4 10.6h16V20H4z", "M4 10.6 6.4 4.8h4.2L12 10.6", "M12 10.6l1.4-5.8h4.2L20 10.6", "M12 10.6V20"],
  sliders: ["M5 8h9", "M17.6 8H19", "M5 16h3", "M11.6 16H19", "M15.8 6.2v3.6", "M9.8 14.2v3.6"],
  refresh: ["M19 12a7 7 0 1 1-2.4-5.3", "M19.4 4.4v4.2h-4.2"],
  arrowRight: ["M5 12h13.4", "m13.4 6.6 5.4 5.4-5.4 5.4"],
  arrowLeft: ["M19 12H5.6", "m10.6 6.6L5.2 12l5.4 5.4"],
  chevronRight: ["m9.5 6.5 5.5 5.5-5.5 5.5"],
  eye: [circle(12, 12, 3.1), "M3.2 12S6.4 5.9 12 5.9 20.8 12 20.8 12 17.6 18.1 12 18.1 3.2 12 3.2 12"],
  eyeOff: [circle(12, 12, 3.1), "M4.4 4.4 19.6 19.6", "M9.4 6.3A9.6 9.6 0 0 1 12 5.9c5.6 0 8.8 6.1 8.8 6.1a17 17 0 0 1-2.6 3.4", "M6 7.5A17 17 0 0 0 3.2 12S6.4 18.1 12 18.1c1 0 1.9-.2 2.7-.5"],
  /* Theme. Drawn to read at 16px on a busy header, so the disc is large and
     the rays are short and separated rather than thin and crowded. */
  sun: [
    circle(12, 12, 4.2),
    "M12 2.4v2.3",
    "M12 19.3v2.3",
    "M2.4 12h2.3",
    "M19.3 12h2.3",
    "M5.2 5.2 6.8 6.8",
    "M17.2 17.2 18.8 18.8",
    "M18.8 5.2 17.2 6.8",
    "M6.8 17.2 5.2 18.8",
  ],
  /* A crescent: the major arc of the outer circle, closed by a shallower arc of
     the circle biting into it. Both radii have to be large enough for the chord
     they span. An undersized radius is not an error SVG reports, it is silently
     scaled up to suit, which turns the crescent into two opposed semicircles
     and the shape into a hook. */
  moon: ["M8.12 3.88A9 9 0 1 0 18.71 18A9.4 9.4 0 0 1 8.12 3.88Z"],
  menu: ["M4 7.5h16", "M4 12h16", "M4 16.5h16"],
  // A ledger, not another hamburger: bulleted rows read as "transactions".
  list: [
    circle(5.6, 7, 1.15),
    "M9.8 7h9.4",
    circle(5.6, 12, 1.15),
    "M9.8 12h9.4",
    circle(5.6, 17, 1.15),
    "M9.8 17h9.4",
  ],
  // Two arrows passing each other, which is the shape people already know.
  swap: ["M4.6 8.6h11.6", "m13.5 5.7 2.9 2.9-2.9 2.9", "M19.4 15.4H7.8", "m10.5 12.5-2.9 2.9 2.9 2.9"],
  download: ["M12 4.2v11", "m7.7 10.8 4.3 4.4 4.3-4.4", "M5.2 19.6h13.6"],
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: keyof typeof PATHS | string;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, strokeWidth = 1.6, ...rest }: IconProps) {
  const paths = PATHS[name] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export type IconName = keyof typeof PATHS;
