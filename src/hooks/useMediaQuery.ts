import { useEffect, useState } from "react";

/**
 * Screen size as state, not just as CSS.
 *
 * The agenda needs this in JavaScript rather than a media query: on a wide
 * screen it shows a full week, on a phone three days. That changes which dates
 * are fetched and how far the arrows step, so CSS alone cannot express it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
