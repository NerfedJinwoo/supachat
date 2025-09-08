"use client"

import * as React from "react"
import { MessageCircle, MessageSquare, MessageSquareDot, MessageSquarePlus } from "lucide-react"

type MessageType = "text" | "image" | "file"
type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed"

export interface ChatMessage {
  id: string
  senderId: string
  senderName?: string
  type: MessageType
  content: string // text content or url
  fileName?: string
  fileSize?: number
  imageAlt?: string
  createdAt: string | Date
  status?: MessageStatus
}

export interface Contact {
  id: string
  name: string
  username: string
  avatarUrl?: string
  online?: boolean
  isGroup?: boolean
  membersCount?: number
}

interface TypingUser {
  userId: string
  name?: string
}

export interface ChatInterfaceProps {
  className?: string
  style?: React.CSSProperties
  currentUserId: string
  activeContact?: Contact | null
  messages?: ChatMessage[]
  typing?: TypingUser[]
  isLoadingHistory?: boolean
  onSendMessage?: (text: string) => Promise<void> | void
  onUploadFiles?: (files: File[]) => Promise<void> | void
  onUploadImages?: (files: File[]) => Promise<void> | void
  onStartCall?: () => void
  emptyStateTitle?: string
  emptyStateDescription?: string
}

export default function ChatInterface({
  className,
  style,
  currentUserId,
  activeContact,
  messages = [],
  typing = [],
  isLoadingHistory = false,
  onSendMessage,
  onUploadFiles,
  onUploadImages,
  onStartCall,
  emptyStateTitle = "Welcome to Chat",
  emptyStateDescription = "Select a conversation from the left or start a new one to begin messaging.",
}: ChatInterfaceProps) {
  const [input, setInput] = React.useState("")
  const [isDragging, setIsDragging] = React.useState(false)
  const [imagePreviews, setImagePreviews] = React.useState<{ file: File; url: string }[]>([])
  const [fileQueue, setFileQueue] = React.useState<File[]>([])
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const imageInputRef = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  // Auto-grow textarea
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "0px"
    const next = Math.min(el.scrollHeight, 160) // cap at ~8 lines
    el.style.height = next + "px"
  }, [input])

  // Scroll to bottom when messages or typing changes
  React.useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    // slight delay to ensure layout after images load
    const id = window.setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    }, 50)
    return () => window.clearTimeout(id)
  }, [messages.length, typing.length])

  React.useEffect(() => {
    return () => {
      // revoke object URLs on unmount
      imagePreviews.forEach((p) => URL.revokeObjectURL(p.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isDisabled = sending || (!input.trim() && imagePreviews.length === 0 && fileQueue.length === 0)

  const handleSend = async () => {
    if (isDisabled) return
    setError(null)
    setSending(true)
    try {
      if (imagePreviews.length > 0 && onUploadImages) {
        await onUploadImages(imagePreviews.map((p) => p.file))
      }
      if (fileQueue.length > 0 && onUploadFiles) {
        await onUploadFiles(fileQueue)
      }
      if (input.trim() && onSendMessage) {
        await onSendMessage(input.trim())
      }
      // clear local state on success
      setInput("")
      setFileQueue([])
      imagePreviews.forEach((p) => URL.revokeObjectURL(p.url))
      setImagePreviews([])
    } catch (e: any) {
      setError(e?.message || "Failed to send. Please try again.")
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFiles = (files: FileList | File[]) => {
    const arr = Array.from(files)
    const imgs = arr.filter((f) => f.type.startsWith("image/"))
    const nonImgs = arr.filter((f) => !f.type.startsWith("image/"))
    if (imgs.length > 0) {
      const previews = imgs.map((file) => ({ file, url: URL.createObjectURL(file) }))
      setImagePreviews((prev) => [...prev, ...previews])
    }
    if (nonImgs.length > 0) {
      setFileQueue((prev) => [...prev, ...nonImgs])
    }
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (!activeContact) return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
      e.dataTransfer.clearData()
    }
  }

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!isDragging) setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const removeImage = (url: string) => {
    setImagePreviews((prev) => {
      const next = prev.filter((p) => p.url !== url)
      URL.revokeObjectURL(url)
      return next
    })
  }

  const removeFile = (name: string, size: number) => {
    setFileQueue((prev) => prev.filter((f) => !(f.name === name && f.size === size)))
  }

  // Utility formatters
  const formatTime = (date: string | Date) => {
    const d = typeof date === "string" ? new Date(date) : date
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const formatBytes = (bytes?: number) => {
    if (!bytes && bytes !== 0) return ""
    const sizes = ["B", "KB", "MB", "GB", "TB"]
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const val = bytes / Math.pow(1024, i)
    return `${val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 2)} ${sizes[i]}`
  }

  const renderStatus = (status?: MessageStatus) => {
    if (!status) return null
    const map: Record<MessageStatus, string> = {
      sending: "text-muted-foreground",
      sent: "text-muted-foreground",
      delivered: "text-foreground",
      read: "text-primary",
      failed: "text-destructive",
    }
    const label =
      status === "sending"
        ? "Sending"
        : status === "sent"
        ? "Sent"
        : status === "delivered"
        ? "Delivered"
        : status === "read"
        ? "Read"
        : "Failed"
    return (
      <span className={`ml-2 text-[11px] ${map[status]}`}>{label}</span>
    )
  }

  const EmptyState = (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-card px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
          <MessageSquare className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold">{emptyStateTitle}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{emptyStateDescription}</p>
      </div>
    </div>
  )

  const Header = activeContact ? (
    <div className="flex w-full items-center gap-3 border-b bg-card px-4 py-3">
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
        {/* Avatar image if provided */}
        {activeContact.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeContact.avatarUrl}
            alt={`${activeContact.name} avatar`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-foreground/80">
            {activeContact.name?.charAt(0)?.toUpperCase() || "U"}
          </div>
        )}
        {activeContact.online && (
          <span
            aria-label="Online"
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 truncate text-sm font-semibold">{activeContact.name}</p>
          {activeContact.isGroup && activeContact.membersCount ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {activeContact.membersCount}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-muted-foreground">@{activeContact.username}</span>
          <span className="text-xs text-muted-foreground">•</span>
          <span className={`text-xs ${activeContact.online ? "text-primary" : "text-muted-foreground"}`}>
            {activeContact.online ? "Online" : "Offline"}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onStartCall}
        className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Start voice call"
      >
        <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
        Voice
      </button>
    </div>
  ) : null

  const TypingIndicator = typing.length ? (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center">
        <span className="mr-1">Typing</span>
        <span className="flex items-end gap-0.5">
          <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]"></span>
          <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:120ms]"></span>
          <span className="h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:240ms]"></span>
        </span>
      </span>
      {typing.length > 0 && (
        <span aria-live="polite" className="truncate">
          {typing.map((t) => t.name || "Someone").join(", ")}
        </span>
      )}
    </div>
  ) : null

  const DropOverlay = isDragging ? (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-foreground/5 ring-1 ring-inset ring-ring">
      <div className="pointer-events-none flex items-center gap-2 rounded-full bg-card/90 px-4 py-2 text-sm font-medium text-foreground shadow-sm">
        <MessageSquareDot className="h-4 w-4 text-primary" aria-hidden="true" />
        Drop files to upload
      </div>
    </div>
  ) : null

  const MessageBubble = ({ msg, showName }: { msg: ChatMessage; showName: boolean }) => {
    const isOwn = msg.senderId === currentUserId
    const align = isOwn ? "justify-end" : "justify-start"
    const bubble =
      isOwn
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-foreground"
    const bubbleMuted = isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
    const radius = isOwn ? "rounded-l-xl rounded-tr-xl" : "rounded-r-xl rounded-tl-xl"

    return (
      <div className={`flex w-full ${align}`}>
        <div className="max-w-[85%] min-w-0">
          {showName && !isOwn ? (
            <div className="mb-1 ml-1 text-xs font-semibold text-foreground">{msg.senderName || "Unknown"}</div>
          ) : null}
          <div className={`group relative w-full overflow-hidden ${bubble} ${radius} px-3 py-2 shadow-sm`}>
            {msg.type === "text" && (
              <p className="break-words text-sm leading-relaxed">{msg.content}</p>
            )}

            {msg.type === "image" && (
              <div className="relative overflow-hidden rounded-md bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={msg.content}
                  alt={msg.imageAlt || "Shared image"}
                  className="max-h-80 w-full max-w-full cursor-pointer object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  onLoad={() => bottomRef.current?.scrollIntoView({ behavior: "auto" })}
                  onClick={() => {
                    if (typeof window !== "undefined") window.open(msg.content, "_blank", "noopener,noreferrer")
                  }}
                />
              </div>
            )}

            {msg.type === "file" && (
              <a
                href={msg.content}
                download={msg.fileName || true}
                target="_blank"
                rel="noopener noreferrer"
                className={`block rounded-md bg-card px-3 py-2 text-sm no-underline transition-colors hover:bg-accent ${isOwn ? "text-foreground" : "text-foreground"}`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquarePlus className="h-4 w-4 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{msg.fileName || "Download file"}</div>
                    {typeof msg.fileSize === "number" ? (
                      <div className="text-xs text-muted-foreground">{formatBytes(msg.fileSize)}</div>
                    ) : null}
                  </div>
                </div>
              </a>
            )}

            <div className={`mt-1 flex items-center justify-end text-[11px] ${bubbleMuted}`}>
              <span>{formatTime(msg.createdAt)}</span>
              {isOwn && renderStatus(msg.status)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderMessages = () => {
    if (!activeContact) return null
    const items: React.ReactNode[] = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      const prev = messages[i - 1]
      const next = messages[i + 1]
      const showName =
        Boolean(activeContact.isGroup) &&
        (!prev || prev.senderId !== m.senderId)
      const addGapTop = prev && prev.senderId !== m.senderId
      const addGapBottom = next && next.senderId !== m.senderId

      items.push(
        <div
          key={m.id}
          className={`${addGapTop ? "mt-3" : "mt-1"} ${addGapBottom ? "mb-2" : "mb-1"}`}
        >
          <MessageBubble msg={m} showName={!!showName} />
        </div>
      )
    }
    return items
  }

  // Main render
  if (!activeContact) {
    return (
      <section
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-lg bg-background ${className || ""}`}
        style={style}
        aria-label="Chat interface"
        role="region"
      >
        {EmptyState}
      </section>
    )
  }

  return (
    <section
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-lg bg-background ${className || ""}`}
      style={style}
      aria-label={`Chat with ${activeContact.name}`}
      role="region"
    >
      {Header}

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto bg-[color:var(--background)] px-3 py-4"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        aria-live="polite"
      >
        {DropOverlay}

        {isLoadingHistory && (
          <div className="mb-3 flex items-center justify-center">
            <span className="rounded-full bg-card px-3 py-1 text-xs text-muted-foreground">Loading messages…</span>
          </div>
        )}

        <div className="mx-auto w-full max-w-3xl">
          {renderMessages()}
          {typing.length ? (
            <div className="mt-2 flex justify-start">
              <div className="rounded-xl bg-secondary px-3 py-2 text-xs text-muted-foreground">
                {TypingIndicator}
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {/* Compose */}
      <div className="border-t bg-card">
        {/* Previews */}
        {(imagePreviews.length > 0 || fileQueue.length > 0) && (
          <div className="mx-auto w-full max-w-3xl px-3 pt-3">
            {/* Image previews */}
            {imagePreviews.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {imagePreviews.map(({ url, file }) => (
                  <div key={url} className="group relative overflow-hidden rounded-lg border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={file.name} className="h-28 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(url)}
                      className="absolute right-2 top-2 rounded-md bg-card/90 px-2 py-1 text-xs text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Remove
                    </button>
                    <div className="absolute inset-x-0 bottom-0 line-clamp-2 bg-card/80 p-2 text-[11px] text-foreground">
                      {file.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* File queue */}
            {fileQueue.length > 0 && (
              <div className="mb-3 space-y-2">
                {fileQueue.map((f, idx) => (
                  <div key={`${f.name}-${f.size}-${idx}`} className="flex items-center justify-between rounded-lg border bg-secondary px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{formatBytes(f.size)}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(f.name, f.size)}
                      className="rounded-md bg-card px-2 py-1 text-xs text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mx-auto w-full max-w-3xl px-3 pb-3">
          <div className={`relative rounded-lg border bg-card ${isDragging ? "ring-2 ring-ring" : ""}`}>
            <div className="flex items-end gap-2 p-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files)
                    e.currentTarget.value = ""
                  }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach files"
                  aria-label="Attach files"
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                </button>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files) handleFiles(e.target.files)
                    e.currentTarget.value = ""
                  }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => imageInputRef.current?.click()}
                  title="Upload images"
                  aria-label="Upload images"
                >
                  <MessageSquareDot className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <label htmlFor="chat-input" className="sr-only">
                  Message input
                </label>
                <textarea
                  id="chat-input"
                  ref={textareaRef}
                  placeholder="Type a message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  className="w-full resize-none border-0 bg-transparent px-1 pb-1 text-sm outline-none placeholder:text-muted-foreground"
                  aria-multiline="true"
                />
              </div>

              <div className="flex items-center">
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={handleSend}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isDisabled ? "cursor-not-allowed bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                  aria-label="Send message"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </div>
            {error && (
              <div className="border-t px-3 py-2 text-xs text-destructive" role="alert">
                {error}
              </div>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {sending ? "Sending message" : "Ready to send"}
          </p>
        </div>
      </div>
    </section>
  )
}