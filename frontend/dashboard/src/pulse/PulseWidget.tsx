import { useMemo, useRef } from 'react';
import type { View } from '../common/finance';
import { FeatureIcon } from '../common/FeatureIcon';
import { buildPulseCards, pulseContext, pulsePositions } from './pulse-models';
import type { PulseCard } from './pulse-models';
import { usePulseSources } from './usePulseSources';
import { usePulseMarket } from './usePulseMarket';
import { usePulseCarousel } from './usePulseCarousel';
import { usePulseInsight } from './usePulseInsight';
import { PulseGraphic } from './PulseGraphic';

export function PulseWidget({
  height,
  userId,
  demo,
  onNavigate,
}: {
  height: number;
  userId: number;
  demo: boolean;
  onNavigate: (view: View) => void;
}) {
  const data = usePulseSources(userId, demo);
  const symbols = useMemo(
    () =>
      pulsePositions(data.holdings)
        .slice(0, 3)
        .map((p) => p.label),
    [data.holdings],
  );
  const markets = usePulseMarket(symbols);
  const context = useMemo(
    () => pulseContext(data.graph, data.holdings, data.run),
    [data.graph, data.holdings, data.run],
  );
  const ai = usePulseInsight(context, `${demo ? 'demo' : 'user'}:${userId}`);
  const base = useMemo(
    () => buildPulseCards(data.graph, data.holdings, markets, data.run),
    [data.graph, data.holdings, markets, data.run],
  );
  const actionViews: Record<string, View> = {
    cashflow: 'graph',
    diversification: 'ai',
    forecast: 'history',
    assumptions: 'ai',
    explore: 'graph',
  };
  const aiCard: PulseCard = {
    id: 'ai',
    kicker: ai.insight ? 'Local AI · suggestion' : 'Local AI · on demand',
    title: ai.insight
      ? 'Try a what-if'
      : ai.busy
        ? 'Thinking…'
        : ai.message
          ? 'Try again'
          : 'Ask AI for a next step',
    value: '',
    detail:
      ai.insight?.message ??
      (ai.message ? ai.message : 'Get a suggestion grounded in your scenario signals.'),
    footnote: ai.insight
      ? 'AI can make mistakes · Verify assumptions'
      : 'No balances or identity sent',
    tone: 'neutral',
    view: actionViews[ai.insight?.action ?? 'assumptions'],
  };
  const cards = [...base, aiCard],
    motion = usePulseCarousel(cards.map((card) => card.id));
  const drag = useRef<number | null>(null),
    swiped = useRef(false);
  function step(delta: number) {
    motion.setIndex(Math.max(0, Math.min(cards.length - 1, motion.index + delta)));
  }
  function ask() {
    // Held the requested AI slide in place while the model worked and new market cards arrived.
    motion.setPaused(true);
    motion.setIndex(cards.length - 1);
    void ai.suggest();
  }
  return (
    <section
      className="pulse-card"
      style={{ height }}
      aria-label="AI Pulse insights"
      aria-roledescription="carousel"
      data-density={height < 180 ? 'compact' : 'full'}
      data-running={motion.running}
      data-rebasing={motion.rebasing}
      onPointerEnter={() => motion.hover(true)}
      onPointerLeave={() => motion.hover(false)}
      onFocusCapture={() => motion.focused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) motion.focused(false);
      }}
    >
      <header className="pulse-header">
        <span className="pulse-brand">
          <FeatureIcon name="spark" />
          <strong>AI Pulse</strong>
        </span>
        <div className="pulse-tools">
          <button
            type="button"
            aria-label="Generate local AI insight"
            title="Generate a local AI suggestion · No balances or identity sent"
            aria-busy={ai.busy}
            onClick={ask}
            className={ai.busy ? 'pulse-thinking' : ''}
          >
            <FeatureIcon name={ai.busy ? 'clock' : 'spark'} />
          </button>
          <button
            type="button"
            aria-label={
              motion.reduced
                ? 'Automatic rotation disabled by reduced-motion preference'
                : motion.paused
                  ? 'Play insights'
                  : 'Pause insights'
            }
            title={
              motion.reduced
                ? 'Reduced motion enabled'
                : motion.paused
                  ? 'Play insights'
                  : 'Pause insights'
            }
            disabled={motion.reduced}
            onClick={() => motion.setPaused(!motion.paused)}
          >
            <svg
              viewBox="0 0 20 20"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              {motion.paused || motion.reduced ? (
                <path d="m7 4 8 6-8 6V4Z" />
              ) : (
                <path d="M7 4v12M13 4v12" />
              )}
            </svg>
          </button>
        </div>
      </header>
      <div
        className="pulse-stage"
        tabIndex={0}
        role="group"
        aria-label="Insight slides. Use left and right arrow keys."
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            e.currentTarget.focus();
            step(e.key === 'ArrowRight' ? 1 : -1);
          }
        }}
        onPointerDownCapture={(e) => {
          drag.current = e.clientX;
          swiped.current = false;
        }}
        onPointerUpCapture={(e) => {
          if (drag.current !== null && Math.abs(e.clientX - drag.current) > 26) {
            swiped.current = true;
            step(e.clientX < drag.current ? 1 : -1);
          }
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {/* Moved a lightweight SVG track horizontally and reversed automatic travel at its endpoints. */}
        <div
          className="pulse-track"
          style={{ transform: `translate3d(-${motion.index * 100}%,0,0)` }}
        >
          {cards.map((card, index) => (
            <article
              className="pulse-slide"
              key={card.id}
              aria-hidden={index !== motion.index}
              inert={index !== motion.index}
              aria-label={`${index + 1} of ${cards.length}`}
              data-ai={card.id === 'ai'}
              data-card-id={card.id}
              // Identified chart slides so their centering never changed the AI text layout.
              data-chart={Boolean(card.chart)}
            >
              <button
                type="button"
                className="pulse-open"
                tabIndex={index === motion.index ? 0 : -1}
                title={`${card.title}. ${card.value}. ${card.detail}. ${card.footnote}`}
                onClick={() => {
                  if (swiped.current) {
                    swiped.current = false;
                    return;
                  }
                  if (card.id === 'ai' && !ai.insight) {
                    ask();
                    return;
                  }
                  onNavigate(card.view);
                }}
              >
                <span className="pulse-kicker">{card.kicker}</span>
                <span className="pulse-reading">
                  <strong>{card.title}</strong>
                  {card.value && <b data-tone={card.tone}>{card.value}</b>}
                </span>
                {card.chart && (
                  <PulseGraphic
                    chart={card.chart}
                    tone={card.tone}
                    active={index === motion.index && motion.visible}
                  />
                )}
                <span className="pulse-detail">{card.detail}</span>
                <span className="pulse-footnote">{card.footnote}</span>
              </button>
            </article>
          ))}
        </div>
      </div>
      <footer className="pulse-controls">
        <button
          type="button"
          aria-label="Previous insight"
          aria-disabled={motion.index === 0}
          onClick={() => step(-1)}
        >
          ‹
        </button>
        <div className="pulse-dots" aria-label="Choose insight">
          {cards.map((card, index) => (
            <button
              key={card.id}
              aria-label={`Show ${card.title}`}
              aria-pressed={motion.index === index}
              onClick={() => motion.setIndex(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next insight"
          aria-disabled={motion.index === cards.length - 1}
          onClick={() => step(1)}
        >
          ›
        </button>
      </footer>
      <span className="sr-only" role="status">
        {ai.message || (ai.busy ? 'Generating a local AI suggestion.' : '')}
      </span>
    </section>
  );
}
