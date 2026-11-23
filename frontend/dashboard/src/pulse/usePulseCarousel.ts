import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function usePulseCarousel(ids: string[]) {
  const key = ids.join('|');
  const items = useMemo(() => key.split('|'), [key]);
  const [selected, setSelected] = useState({ id: items[0], listKey: key }),
    [paused, setPaused] = useState(false),
    [hover, setHover] = useState(false),
    [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  const [reduced, setReduced] = useState(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const direction = useRef(1);
  // Preserved selection by card identity so late quote/history responses could not displace an AI request.
  const current = Math.max(0, items.indexOf(selected.id));
  const setIndex = useCallback(
    (index: number) =>
      setSelected({ id: items[Math.max(0, Math.min(items.length - 1, index))], listKey: key }),
    [items, key],
  );
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)'),
      update = () => setReduced(preference.matches),
      visibility = () => setVisible(!document.hidden);
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  useEffect(() => {
    if (items.length < 2 || paused || hover || focused || reduced || !visible) return;
    // Reversed automatic travel at each end while retaining stable slide identities.
    const timer = setTimeout(() => {
      if (current + direction.current >= items.length || current + direction.current < 0)
        direction.current *= -1;
      setSelected({ id: items[current + direction.current], listKey: key });
    }, 7000);
    return () => clearTimeout(timer);
  }, [current, items, key, paused, hover, focused, reduced, visible]);
  return {
    index: current,
    rebasing: selected.listKey !== key,
    setIndex,
    paused,
    setPaused,
    reduced,
    visible,
    running: !paused && !hover && !focused && !reduced && visible,
    hover: setHover,
    focused: setFocused,
  };
}
