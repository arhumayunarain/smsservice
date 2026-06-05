"use client";

import { useState, useRef, useEffect } from "react";

interface EditableCellProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  placeholder?: string;
  className?: string;
}

export function EditableCell({
  value,
  onSave,
  placeholder = "empty",
  className = "",
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<"success" | "error" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (!editing) {
      setInputValue(value);
    }
  }, [value, editing]);

  function handleClick() {
    if (saving) return;
    setInputValue(value);
    setEditing(true);
  }

  async function handleBlur() {
    if (inputValue === value) {
      setEditing(false);
      return;
    }
    await commitSave();
  }

  async function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (inputValue === value) {
        setEditing(false);
        return;
      }
      await commitSave();
    } else if (e.key === "Escape") {
      setInputValue(value);
      setEditing(false);
    }
  }

  async function commitSave() {
    setSaving(true);
    try {
      await onSave(inputValue);
      setFlash("success");
      setTimeout(() => setFlash(null), 1000);
      setEditing(false);
    } catch {
      setFlash("error");
      setTimeout(() => setFlash(null), 1500);
      setInputValue(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-full px-1 py-0.5 rounded border border-ring bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring ${className}`}
      />
    );
  }

  return (
    <span
      onClick={handleClick}
      className={`block cursor-pointer rounded px-1 py-0.5 text-sm transition-colors ${
        flash === "success"
          ? "bg-green-500/20 text-green-400"
          : flash === "error"
          ? "bg-destructive/20 text-destructive"
          : "hover:bg-accent/30"
      } ${saving ? "opacity-50" : ""} ${!value ? "italic text-muted-foreground/50" : ""} ${className}`}
    >
      {value || placeholder}
    </span>
  );
}
