'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquarePlus, X } from 'lucide-react';
import { Duck } from '@/components/brand/duck';
import { Button } from '@/components/ui/button';
import { useNikoContext } from './niko-provider';
import { NikoMessage } from './niko-message';
import { NikoInput } from './niko-input';
import { NikoMagicChips } from './niko-magic-chips';
import { useProviderHealth } from '@/hooks/use-provider-health';

export function NikoPanel() {
  const { data: authSession } = useSession();
  const firstName = authSession?.user?.name?.split(' ')[0] ?? 'there';
  const {
    isOpen,
    setIsOpen,
    messages,
    isStreaming,
    magicPrompts,
    sendMessage,
    startNewConversation,
    stopStreaming,
  } = useNikoContext();

  const scrollRef = useRef<HTMLDivElement>(null);
  const { niko: nikoHealth } = useProviderHealth();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed bottom-20 right-4 z-50 flex w-[380px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/20"
          style={{ maxHeight: 'min(600px, calc(100vh - 120px))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
                <Duck state="idle" size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Niko</h3>
                <p className="text-[10px] text-muted-foreground">The duck&apos;s assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={startNewConversation}
                title="New conversation"
              >
                <MessageSquarePlus className="size-3.5" />
              </Button>
              <Button size="icon-xs" variant="ghost" onClick={() => setIsOpen(false)}>
                <X className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-4 pt-6">
                <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-primary/5">
                  <Duck state="idle" size={32} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Hey {firstName}! I&apos;m Niko
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                    I can help you manage projects, boards, blueprints, and more. Try one of the
                    actions below or ask me anything.
                  </p>
                </div>
                <NikoMagicChips prompts={magicPrompts} onSelect={sendMessage} />
              </div>
            ) : (
              messages.map((msg, i) => (
                <NikoMessage
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming && msg.role === 'assistant' && i === messages.length - 1}
                />
              ))
            )}
          </div>

          {/* Provider-health gate */}
          {!nikoHealth.available && (
            <div className="border-t border-amber-500/20 bg-amber-950/30 px-4 py-2 text-[12px] text-amber-200/80">
              Niko is paused: {nikoHealth.message || 'the AI provider is unavailable.'}
            </div>
          )}
          {/* Input */}
          <NikoInput
            onSend={sendMessage}
            onStop={stopStreaming}
            isStreaming={isStreaming || !nikoHealth.available}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
