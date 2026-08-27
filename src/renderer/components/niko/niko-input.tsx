'use client';

import { useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NikoInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function NikoInput({ onSend, onStop, isStreaming, disabled }: NikoInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (isStreaming) {
      onStop?.();
      return;
    }
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
    // Reset height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  };

  return (
    <div className="flex items-end gap-1.5 border-t border-border/50 bg-background px-3 py-2.5">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Ask Niko anything..."
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none disabled:opacity-50"
      />
      <Button
        size="icon-xs"
        variant={isStreaming ? 'destructive' : 'default'}
        onClick={handleSubmit}
        disabled={disabled || (!isStreaming && !value.trim())}
      >
        {isStreaming ? <Square className="size-3" /> : <ArrowUp className="size-3" />}
      </Button>
    </div>
  );
}
