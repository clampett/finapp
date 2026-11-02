import { useEffect, useState } from 'react';
import { money } from '../finance';

type GoalKind = 'netWorth' | 'income';

interface Goal {
  target: number;
  deadline: string;
  startValue: number;
}

interface FinancialGoalsProps {
  netWorth: number;
  income: number;
  storageKey: string;
}

type GoalState = Partial<Record<GoalKind, Goal>>;

export function FinancialGoals({
  netWorth,
  income,
  storageKey,
}: FinancialGoalsProps) {
  const [goals, setGoals] = useState<GoalState>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setGoals(JSON.parse(saved));
    } catch {
      setGoals({});
    }
  }, [storageKey]);

  const saveGoal = (
    kind: GoalKind,
    target: number,
    deadline: string,
    currentValue: number,
  ) => {
    if (!Number.isFinite(target) || target <= currentValue) return;

    const next = {
      ...goals,
      [kind]: {
        target,
        deadline,
        startValue: currentValue,
      },
    };

    setGoals(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const removeGoal = (kind: GoalKind) => {
    const next = { ...goals };
    delete next[kind];

    setGoals(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  return (
    <section className="mt-7">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-[-0.35px] text-text m-0">
          Financial Goals
        </h2>
        <p className="text-xs text-[color:var(--ui-text-8998b0)] mt-1.5">
          Set targets and track your progress over time.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-[760px]:grid-cols-1">
        <GoalCard
          title="Net Worth Goal"
          description="Build toward your target net worth."
          currentValue={netWorth}
          goal={goals.netWorth}
          onSave={(target, deadline) =>
            saveGoal('netWorth', target, deadline, netWorth)
          }
          onRemove={() => removeGoal('netWorth')}
        />

        <GoalCard
          title="Income Goal"
          description="Grow your monthly take-home income."
          currentValue={income}
          goal={goals.income}
          onSave={(target, deadline) =>
            saveGoal('income', target, deadline, income)
          }
          onRemove={() => removeGoal('income')}
        />
      </div>
    </section>
  );
}

function GoalCard({
  title,
  description,
  currentValue,
  goal,
  onSave,
  onRemove,
}: {
  title: string;
  description: string;
  currentValue: number;
  goal?: Goal;
  onSave: (target: number, deadline: string) => void;
  onRemove: () => void;
}) {
  const [target, setTarget] = useState('');
  const [deadline, setDeadline] = useState('');

  const reached = goal ? currentValue >= goal.target : false;

  const progress = goal
    ? Math.max(
        0,
        Math.min(
          100,
          ((currentValue - goal.startValue) /
            (goal.target - goal.startValue)) *
            100,
        ),
      )
    : 0;

  const daysRemaining = goal?.deadline
    ? Math.ceil(
        (new Date(`${goal.deadline}T23:59:59`).getTime() - Date.now()) /
          86400000,
      )
    : null;

  return (
    <div className="bg-surface border border-[color:var(--ui-border-283145)] rounded-[11px] p-5">
      <div className="flex justify-between gap-3 items-start">
        <div>
          <h3 className="text-sm font-semibold text-text m-0">{title}</h3>
          <p className="text-[11px] text-[color:var(--ui-text-8998b0)] mt-1">{description}</p>
        </div>

        {reached && (
          <span className="text-[10px] font-semibold text-mint">
            GOAL REACHED 🎉
          </span>
        )}
      </div>

      {goal ? (
        <>
          <div className="mt-5 flex justify-between text-xs">
            <span className="text-[color:var(--ui-text-8fa0b8)]">
              Current: {money(currentValue)}
            </span>
            <span className="text-text font-medium">
              Target: {money(goal.target)}
            </span>
          </div>

          <div className="h-2 bg-[var(--ui-surface-1b2535)] rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${reached ? 100 : progress}%` }}
            />
          </div>

          <div className="flex justify-between mt-2 text-[10px] text-[color:var(--ui-text-73839a)]">
            <span>{Math.round(reached ? 100 : progress)}% complete</span>

            {daysRemaining != null && (
              <span>
                {reached
                  ? 'Completed'
                  : daysRemaining < 0
                    ? 'Deadline passed'
                    : `${daysRemaining} days remaining`}
              </span>
            )}
          </div>

          <button
            className="mt-4 text-[11px] text-[color:var(--ui-text-9aa9bd)] hover:text-text cursor-pointer bg-transparent border-0 p-0"
            onClick={onRemove}
          >
            Remove goal
          </button>
        </>
      ) : (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();

            const value = Number(target);
            if (value <= currentValue) return;

            onSave(value, deadline);
            setTarget('');
            setDeadline('');
          }}
        >
          <label className="grid gap-1.5 text-[11px] text-[color:var(--ui-text-9cacbf)]">
            Target amount
            <input
              className="bg-[var(--ui-surface-151c29)] border border-[color:var(--ui-border-303c54)] rounded-[7px] px-3 py-2 text-xs text-text outline-none focus:border-primary"
              type="number"
              min={Math.floor(currentValue) + 1}
              step="1"
              required
              placeholder={`${Math.max(0, Math.round(currentValue + 1000))}`}
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>

          <label className="grid gap-1.5 text-[11px] text-[color:var(--ui-text-9cacbf)]">
            Target date
            <input
              className="bg-[var(--ui-surface-151c29)] border border-[color:var(--ui-border-303c54)] rounded-[7px] px-3 py-2 text-xs text-text outline-none focus:border-primary"
              type="date"
              required
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
            />
          </label>

          <button
            className="inline-flex justify-center rounded-[7px] px-3 py-2 text-xs font-medium cursor-pointer bg-primary text-primary-fg hover:brightness-110 transition-colors border-0"
            type="submit"
          >
            Set goal
          </button>
        </form>
      )}
    </div>
  );
}
