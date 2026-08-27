"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import {
  Bold,
  Braces,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Smile,
  Strikethrough,
} from "lucide-react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";

interface Props {
  value: string | null;
  onChange?: (html: string) => void;
  onEditingStart?: () => void;
  onEditingStop?: () => void;
  cardId?: string | null;
  placeholder?: string;
  className?: string;
  /** When true, hides large block tools (headings, divider, blockquote) for
   *  the comment composer where short content is expected. */
  compact?: boolean;
  /** When true, renders a non-editable preview. */
  readOnly?: boolean;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
}

const COMMON_EMOJIS = [
  "😀", "😂", "🥲", "😍", "🤔", "😎", "🙃", "😢", "😡", "👍",
  "👎", "👏", "🙌", "🙏", "💪", "🎉", "🚀", "🔥", "✨", "⭐",
  "✅", "❌", "⚠️", "💡", "📝", "📌", "🐛", "🛠️", "🧪", "📦",
  "❤️", "💔", "💯", "🤝", "👀", "🫡", "🤯", "🥳", "🍕", "☕",
];

export function RichTextEditor({
  value,
  onChange,
  onEditingStart,
  onEditingStop,
  cardId,
  placeholder,
  className,
  compact = false,
  readOnly = false,
  autoFocus = false,
}: Props) {
  const { authFetch } = useAuthFetch();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // StarterKit ships heading/blockquote/horizontalRule/lists/code/etc.
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-2 hover:opacity-80",
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Write something…" }),
      Typography,
    ],
    content: value ?? "",
    editable: !readOnly,
    autofocus: autoFocus,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap-content px-3 py-2 min-h-[140px]",
      },
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getHTML());
    },
    onFocus: () => onEditingStart?.(),
    onBlur: () => onEditingStop?.(),
  });

  // External value changes (WS push from another viewer) — only sync when the
  // value really differs, otherwise every keystroke would trip a setContent.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = value ?? "";
    if (current !== next && !editor.isFocused) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [editor, value]);

  const uploadFile = useCallback(
    async (file: File): Promise<{ url: string; mime: string; filename: string } | null> => {
      if (!cardId) {
        setUploadError("Save the ticket first before adding attachments.");
        return null;
      }
      setUploading(true);
      setUploadError(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const resp = await authFetch(`/api/card-attachments-proxy/${cardId}`, {
          method: "POST",
          body: fd,
        });
        if (!resp.ok) {
          const msg = (await resp.json().catch(() => null))?.error ?? `Upload failed (${resp.status})`;
          setUploadError(String(msg));
          return null;
        }
        const data = await resp.json();
        if (!data?.url) {
          setUploadError("Upload succeeded but server returned no URL.");
          return null;
        }
        return { url: data.url, mime: data.mime_type, filename: data.filename };
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
        return null;
      } finally {
        setUploading(false);
      }
    },
    [authFetch, cardId],
  );

  const insertFile = useCallback(
    async (file: File) => {
      const result = await uploadFile(file);
      if (!editor || !result) return;
      if (result.mime.startsWith("image/")) {
        editor.chain().focus().setImage({ src: result.url, alt: result.filename }).run();
      } else {
        editor
          .chain()
          .focus()
          .insertContent(
            `<p><a href="${result.url}" target="_blank" rel="noopener">📎 ${result.filename}</a></p>`,
          )
          .run();
      }
    },
    [editor, uploadFile],
  );

  // Drag-drop + paste — wire to the editor's DOM once available.
  useEffect(() => {
    if (!editor || readOnly) return;
    const dom = editor.view.dom;
    const onDrop = (e: DragEvent) => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) {
        e.preventDefault();
        files.forEach((f) => void insertFile(f));
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        files.forEach((f) => void insertFile(f));
      }
    };
    dom.addEventListener("drop", onDrop);
    dom.addEventListener("paste", onPaste);
    return () => {
      dom.removeEventListener("drop", onDrop);
      dom.removeEventListener("paste", onPaste);
    };
  }, [editor, insertFile, readOnly]);

  if (!editor) {
    return (
      <div className="rounded-md border border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
        Loading editor…
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className={`tiptap-content ${className ?? ""}`}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  // Read the current selection / link state so the popover can pre-fill its
  // text + URL fields. Defaults: selected text becomes the link label; if a
  // link is already at the cursor we surface its href so the user can edit it.
  const linkInitial = (() => {
    if (!editor) return { text: "", url: "" };
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
    const existingHref = (editor.getAttributes("link").href as string | undefined) ?? "";
    return { text: selectedText, url: existingHref };
  })();

  const applyLink = ({ text, url }: { text: string; url: string }) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkPopoverOpen(false);
      return;
    }
    const safeUrl = /^[a-z][a-z0-9+.-]*:/i.test(trimmedUrl)
      ? trimmedUrl
      : `https://${trimmedUrl}`;
    const { from, to } = editor.state.selection;
    const hadSelection = from !== to;
    const trimmedText = text.trim();

    if (hadSelection && (!trimmedText || trimmedText === editor.state.doc.textBetween(from, to, " ").trim())) {
      // User kept the selected text — just decorate it.
      editor.chain().focus().extendMarkRange("link").setLink({ href: safeUrl }).run();
    } else if (hadSelection && trimmedText) {
      // Replace the selection with the new label text.
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: trimmedText,
          marks: [{ type: "link", attrs: { href: safeUrl } }],
        })
        .run();
    } else {
      // No selection — insert label (or URL) as a link at the cursor.
      const label = trimmedText || trimmedUrl;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: label,
          marks: [{ type: "link", attrs: { href: safeUrl } }],
        })
        .run();
    }
    setLinkPopoverOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkPopoverOpen(false);
  };

  return (
    <div className={`rounded-md border border-border bg-background ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        {!compact && (
          <>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              active={editor.isActive("heading", { level: 1 })}
              label="Heading 1"
            >
              <Heading1 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive("heading", { level: 2 })}
              label="Heading 2"
            >
              <Heading2 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              active={editor.isActive("heading", { level: 3 })}
              label="Heading 3"
            >
              <Heading3 className="h-3.5 w-3.5" />
            </ToolbarButton>
            <Divider />
          </>
        )}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          label="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          label="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          label="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive("code")}
          label="Inline code"
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>
        {!compact && (
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")}
            label="Code block"
          >
            <Braces className="h-3.5 w-3.5" />
          </ToolbarButton>
        )}
        <Divider />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          label="Bullet list"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          label="Ordered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        {!compact && (
          <>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              active={editor.isActive("blockquote")}
              label="Quote"
            >
              <Quote className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              label="Divider"
            >
              <Minus className="h-3.5 w-3.5" />
            </ToolbarButton>
          </>
        )}
        <Divider />
        <div className="relative">
          <ToolbarButton
            onClick={() => setLinkPopoverOpen((v) => !v)}
            active={editor.isActive("link") || linkPopoverOpen}
            label="Link"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          {linkPopoverOpen && (
            <LinkPopover
              initialText={linkInitial.text}
              initialUrl={linkInitial.url}
              hasExistingLink={!!linkInitial.url}
              onConfirm={applyLink}
              onRemove={removeLink}
              onCancel={() => setLinkPopoverOpen(false)}
            />
          )}
        </div>
        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          disabled={!cardId || uploading}
          label="Image"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
        </ToolbarButton>
        <div className="relative">
          <ToolbarButton onClick={() => setEmojiOpen((v) => !v)} active={emojiOpen} label="Emoji">
            <Smile className="h-3.5 w-3.5" />
          </ToolbarButton>
          {emojiOpen && (
            <div className="absolute z-20 mt-1 right-0 w-60 rounded-md border border-border bg-popover p-2 shadow-md grid grid-cols-8 gap-1">
              {COMMON_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    editor.chain().focus().insertContent(e).run();
                    setEmojiOpen(false);
                  }}
                  className="text-base hover:bg-muted rounded p-0.5 transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.txt,.md,.csv,.json,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void insertFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {uploadError && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive flex items-center justify-between gap-2">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-destructive/70 hover:text-destructive"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`rounded p-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />;
}

function LinkPopover({
  initialText,
  initialUrl,
  hasExistingLink,
  onConfirm,
  onCancel,
  onRemove,
}: {
  initialText: string;
  initialUrl: string;
  hasExistingLink: boolean;
  onConfirm: (v: { text: string; url: string }) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState(initialUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Autofocus the URL field on open. The text field defaults to whatever was
  // selected in the editor; URL is the action-driving value so it gets focus.
  useEffect(() => {
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  }, []);

  // Dismiss on outside click and Escape so it behaves like a real popover.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) onCancel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  const submit = () => onConfirm({ text, url });

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Insert link"
      className="absolute z-30 mt-1 right-0 w-72 rounded-md border border-border bg-popover text-popover-foreground p-3 shadow-md"
    >
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-muted-foreground">
          Text
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Display text (optional)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <label className="block text-[11px] font-medium text-muted-foreground">
          URL
          <input
            ref={urlInputRef}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm font-normal text-foreground outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {hasExistingLink ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-destructive hover:underline"
          >
            Remove link
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!url.trim()}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:opacity-90"
          >
            {hasExistingLink ? "Update" : "Insert"}
          </button>
        </div>
      </div>
    </div>
  );
}
