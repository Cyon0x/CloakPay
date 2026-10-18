import React from "react";
import Svg, { Path } from "react-native-svg";

const PATHS: Record<string, string[]> = {
  home: ["M3.5 10.6 12 3.6l8.5 7", "M6 9.4V20h12V9.4"],
  activity: ["M3.5 12h3.8l2.4-6 3.9 12L16 12h4.5"],
  send: ["M7 17 17 7", "M9 7h8v8"],
  link: [
    "M10.4 13.6a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1",
    "M13.6 10.4a4 4 0 0 0-5.7 0L5.6 12.7a4 4 0 0 0 5.7 5.7l1-1",
  ],
  user: ["M12 12.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2", "M4.8 20c.6-3.4 3.5-5.4 7.2-5.4s6.6 2 7.2 5.4"],
  wallet: ["M3.8 8.2A2.2 2.2 0 0 1 6 6h11.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2.2 2.2 0 0 1-2.2-2.2z", "M15.4 12.5h2.6"],
  shield: ["M12 3.4 5.4 6v5.6c0 4.2 2.8 7.3 6.6 9 3.8-1.7 6.6-4.8 6.6-9V6z"],
  bell: ["M18 16.2H6l1.2-2.1V11a4.8 4.8 0 0 1 9.6 0v3.1z", "M10.2 19.2h3.6"],
  alert: ["M12 4.6 3.4 19.4h17.2z", "M12 10v4.2", "M12 17h0.01"],
  close: ["M6.4 6.4 17.6 17.6", "M17.6 6.4 6.4 17.6"],
  copy: ["M9 9h9.5v11H9z", "M15.2 6.2V4H5.5v11h2.2"],
  check: ["m4.8 12.6 4.6 4.6 9.8-10.4"],
  qr: ["M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h2.5v2.5H14z", "M19.5 14v2.5H17", "M14 19.5h2.5"],
  chevronRight: ["m9.5 6.5 5.5 5.5-5.5 5.5"],
  arrowRight: ["M5 12h13.4", "m13.4 6.6 5.4 5.4-5.4 5.4"],
};

export function Icon({
  name,
  size = 20,
  color = "#14171b",
  strokeWidth = 1.7,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const paths = PATHS[name] ?? [];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
