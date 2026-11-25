import { useEffect, useRef, useState } from 'react';
import { PulseWidget } from './PulseWidget';
import type { View } from '../common/finance';

// Reserve a readable card even when navigation fills a short laptop sidebar.
export default function SidebarPulse({
  userId,
  demo,
  onNavigate,
}: {
  userId: number;
  demo: boolean;
  onNavigate: (view: View) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    [height, setHeight] = useState(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setHeight(Math.max(0, Math.min(232, Math.floor(entry.contentRect.height) - 16))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={host} className="pulse-slot">
      {/* Hidden navigation has zero height; defer requests until it is opened. */}
      {height >= 112 && (
        <PulseWidget
          key={`${demo}:${userId}`}
          height={height}
          userId={userId}
          demo={demo}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
