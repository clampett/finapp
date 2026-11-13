import { useEffect, useRef } from 'react';
import type { useCoachChat } from './useCoachChat';

type Props = { chat: ReturnType<typeof useCoachChat> };
const button =
  'rounded-lg border border-border bg-raised px-3 py-2 text-xs text-text hover:bg-hover-bg cursor-pointer disabled:opacity-40';

export function CoachConversation({ chat }: Props) {
  const thread = useRef<HTMLDivElement>(null);
  // Kept the mutable scroll ref inside this view and scrolled only after conversation updates.
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [chat.chat]);
  // Exposed common prompts for experiment planning, result interpretation, and model explanations.
  const prompts = [
    'Help me understand my results',
    'What should I try next?',
    'What are the recent market trends?',
    'I’m new to this. Where do I start?',
  ];
  return (
    <aside className="min-w-0 rounded-2xl border border-border bg-surface xl:sticky xl:top-5">
      <header className="flex items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="m-0 text-lg font-semibold text-text">Ask FinApp</h3>
          <p className="mb-0 mt-1 text-xs text-muted">
            <span className={chat.localState === 'ready' ? 'text-mint' : 'text-muted'}>● </span>
            {chat.localState === 'ready' ? 'Local AI ready' : 'FinApp guide available'}
          </p>
        </div>
        {!!chat.chat.length && (
          <button className={button} onClick={chat.resetChat}>
            Clear chat
          </button>
        )}
      </header>
      <div
        ref={thread}
        role="log"
        aria-label="Conversation"
        className="h-96 overflow-y-auto p-5 space-y-5 scroll-smooth"
      >
        {!chat.chat.length && (
          <div className="flex h-full flex-col justify-center">
            <p className="mb-2 text-xl font-semibold text-text">What would you like to explore?</p>
            <p className="m-0 text-sm leading-relaxed text-muted">
              Bring an idea, a confusing result, or a market headline. We can work through it one
              step at a time.
            </p>
          </div>
        )}
        {chat.chat.map((entry) => (
          <article key={entry.id} className="space-y-3">
            <p className="ml-5 rounded-2xl rounded-tr-sm bg-active-bg px-4 py-3 text-sm text-active-text break-words">
              {entry.question}
            </p>
            <div className="space-y-2 text-sm leading-relaxed text-text break-words">
              <p className="m-0 text-[11px] font-semibold text-muted">{entry.source}</p>
              {entry.answer.split('\n\n').map((paragraph, index) => {
                // Rendered text safely without interpreting model output as HTML or executable Markdown.
                const heading = paragraph.match(/^\*\*(.+?)\*\* (.+)$/);
                return (
                  <p key={index} className="m-0 whitespace-pre-line">
                    {heading ? (
                      <>
                        <strong>{heading[1]}</strong> {heading[2]}
                      </>
                    ) : (
                      paragraph
                    )}
                  </p>
                );
              })}
              {!!entry.sources?.length && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">Sources available for this reply</summary>
                  <ul className="space-y-2 pl-4">
                    {entry.sources.map((item) => (
                      <li key={item.url}>
                        <a
                          className="text-active-text underline"
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {item.title}
                        </a>
                        <time className="block" dateTime={item.published_at}>
                          {new Date(item.published_at).toLocaleDateString()}
                        </time>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </article>
        ))}
      </div>
      <div className="border-t border-border p-5">
        <div className="mb-3 flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <button
              key={prompt}
              className={button}
              disabled={chat.asking || chat.cooldown}
              onClick={() => void chat.ask(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void chat.ask(chat.question);
          }}
          className="flex gap-2"
        >
          <input
            aria-label="Ask FinApp a question"
            maxLength={400}
            value={chat.question}
            placeholder="Ask in your own words…"
            onChange={(event) => chat.setQuestion(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border bg-raised px-3 py-3 text-sm text-text"
          />
          {chat.asking ? (
            <button type="button" className={button} onClick={chat.stop}>
              Stop
            </button>
          ) : (
            <button className={button} disabled={!chat.question.trim() || chat.cooldown}>
              Send
            </button>
          )}
        </form>
        {/* Placed the AI disclosure beside the message input so it remained visible during conversations. */}
        <p className="mb-0 mt-3 text-[11px] leading-relaxed text-muted">
          AI can make mistakes and provide inaccurate or outdated information. Verify important
          details independently. Responses are for educational purposes only and are not financial,
          investment, tax, or legal advice.
        </p>
        {chat.error && (
          <p role="alert" className="text-xs text-coral">
            {chat.error}
          </p>
        )}
        <details className="mt-4 text-xs text-muted">
          <summary className="cursor-pointer">Conversation & privacy options</summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chat.liveEnabled}
                onChange={(event) => chat.setLiveEnabled(event.target.checked)}
              />
              Use local AI explanations
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chat.useMarket}
                onChange={(event) => chat.setUseMarket(event.target.checked)}
              />
              Use the public market briefing when relevant
            </label>
            {chat.localState !== 'ready' && (
              <button className={button} onClick={chat.retry}>
                {chat.localState === 'outdated'
                  ? 'Restart FinApp to update the assistant'
                  : 'Check local AI again'}
              </button>
            )}
            <p>
              Your messages and recent AI replies are processed by this FinApp installation. Account
              balances and exact forecast results are never attached automatically. Chat clears when
              you leave this tab.
            </p>
          </div>
        </details>
        <details className="mt-3 text-xs text-muted">
          <summary className="cursor-pointer">How to read coach replies</summary>
          <p>
            <strong>Try this</strong> suggests a setup to explore. <strong>Already set</strong>{' '}
            means your requested setup is already selected. <strong>Watch this metric</strong>{' '}
            points to an outcome to compare.
          </p>
        </details>
      </div>
    </aside>
  );
}
