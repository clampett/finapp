import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';

export function NumberField(props: InputHTMLAttributes<HTMLInputElement>) {
  // Preserved the user's unfinished text while focused, allowing an empty
  // field instead of immediately replacing a deleted value with a forced zero.
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="number"
      value={editing ?? props.value ?? ''}
      onFocus={(event) => {
        setEditing(String(props.value ?? ''));
        if (props.value === 0) event.currentTarget.select();
        props.onFocus?.(event);
      }}
      onChange={(event) => {
        setEditing(event.target.value);
        props.onChange?.(event);
      }}
      onBlur={(event) => {
        setEditing(null);
        props.onBlur?.(event);
      }}
    />
  );
}
