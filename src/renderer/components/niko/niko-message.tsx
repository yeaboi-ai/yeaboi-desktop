"use client";

import { useSession } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import { Bot, User } from "lucide-react";
import { NikoToolCard } from "./niko-tool-card";
import type { NikoMessage as NikoMessageType } from "@/hooks/use-niko";

interface NikoMessageProps {
  message: NikoMessageType;
  isStreaming?: boolean;
}

export function NikoMessage({ message, isStreaming }: NikoMessageProps) {
  const { data: session } = useSession();
  const isUser = message.role === "user";

  const userImage = session?.user?.image;
  const userName = session?.user?.name ?? session?.user?.email ?? "You";

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {isUser ? (
        userImage ? (
          <img
            src={userImage}
            alt={userName}
            className="size-7 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
            {userName.charAt(0).toUpperCase()}
          </div>
        )
      ) : (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
          <Bot className="size-3.5" />
        </div>
      )}

      {/* Content */}
      <div
        className={`flex max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : ""}`}
      >
        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-col gap-1 w-full">
            {message.toolCalls.map((tc, i) => {
              const result = message.toolResults?.[i];
              const status = result
                ? result.success
                  ? "success"
                  : "error"
                : "running";
              return (
                <NikoToolCard
                  key={`${tc.name}-${i}`}
                  name={tc.name}
                  status={status as "running" | "success" | "error"}
                  error={result?.error}
                />
              );
            })}
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <div
            className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-foreground"
            }`}
          >
            {isUser ? (
              <p>{message.content}</p>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                <ReactMarkdown>{message.content}</ReactMarkdown>
              </div>
            )}
            {isStreaming && !isUser && (
              <span className="inline-block h-4 w-1 animate-pulse bg-primary/60 ml-0.5" />
            )}
          </div>
        )}

        {/* Streaming indicator when no content yet */}
        {isStreaming && !isUser && !message.content && !message.toolCalls?.length && (
          <div className="rounded-xl bg-muted/50 px-3 py-2">
            <span className="flex gap-1">
              <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce" />
              <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
