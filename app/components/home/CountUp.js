"use client";

import { useEffect, useRef, useState } from "react";

// Renders the real value on the server and for reduced-motion users. For
// everyone else it counts up from 0 on mount, and later changes (a refetch)
// animate from the number that was showing, not from 0.
export default function CountUp({ value, duration = 800 }) {
  const [display, setDisplay] = useState(value);
  const from = useRef(0);

  useEffect(() => {
    let frame;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // No animation: just show the new number.
      from.current = value;
      frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }

    const startValue = from.current;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      from.current = Math.round(startValue + (value - startValue) * eased);
      setDisplay(from.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return display.toLocaleString("en-US");
}
