"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneCall,
  Phone,
  Mic,
  Headset,
  Bell,
  SignalMedium,
  PhoneOff,
  CircleDot,
} from "lucide-react"

type CallState = "incoming" | "outgoing" | "active"
type ConnectionStatus = "connecting" | "good" | "fair" | "poor" | "disconnected"

export interface VoiceCallModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: CallState

  name: string
  username?: string
  avatarUrl?: string

  // Controls
  muted?: boolean
  speaker?: boolean
  onMuteToggle?: (muted: boolean) => void
  onSpeakerToggle?: (enabled: boolean) => void

  // Actions
  onAnswer?: () => void
  onDecline?: () => void
  onHangup?: () => void
  onCancel?: () => void

  // Active call
  startedAt?: number // ms epoch; used to compute call duration
  connectionStatus?: ConnectionStatus

  // A11y
  className?: string
}

function formatDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

function getConnectionMeta(status?: ConnectionStatus) {
  switch (status) {
    case "good":
      return { label: "Good connection", color: "text-green-600 dark:text-green-500" }
    case "fair":
      return { label: "Fair connection", color: "text-yellow-600 dark:text-yellow-500" }
    case "poor":
      return { label: "Poor connection", color: "text-orange-600 dark:text-orange-500" }
    case "disconnected":
      return { label: "Reconnecting…", color: "text-red-600 dark:text-red-500" }
    case "connecting":
    default:
      return { label: "Connecting…", color: "text-muted-foreground" }
  }
}

export default function VoiceCallModal({
  open,
  onOpenChange,
  state,
  name,
  username,
  avatarUrl,
  muted = false,
  speaker = false,
  onMuteToggle,
  onSpeakerToggle,
  onAnswer,
  onDecline,
  onHangup,
  onCancel,
  startedAt,
  connectionStatus = "connecting",
  className,
}: VoiceCallModalProps) {
  const [now, setNow] = React.useState<number>(() => Date.now())

  React.useEffect(() => {
    if (state !== "active" || !startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state, startedAt])

  const duration = state === "active" && startedAt ? formatDuration(now - startedAt) : undefined
  const connection = getConnectionMeta(connectionStatus)

  const Initials = React.useMemo(() => {
    const parts = name.trim().split(" ")
    const first = parts[0]?.[0] ?? ""
    const second = parts.length > 1 ? parts[parts.length - 1][0] : ""
    return (first + second).toUpperCase()
  }, [name])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label="Voice call dialog"
        className={cn(
          "sm:max-w-md w-full gap-0 p-0 overflow-hidden rounded-2xl bg-card text-foreground shadow-xl",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:zoom-out-95",
          className
        )}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Voice call</DialogTitle>
          <DialogDescription>Call controls and status</DialogDescription>
        </DialogHeader>

        <div className="w-full max-w-full">
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <div
                    className={cn(
                      "absolute inset-0 rounded-full",
                      state !== "active" ? "animate-ping opacity-20" : "opacity-0"
                    )}
                    aria-hidden="true"
                  />
                  <Avatar className="h-14 w-14 ring-2 ring-accent/60">
                    {avatarUrl ? (
                      <AvatarImage src={avatarUrl} alt={`${name} avatar`} className="object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-accent text-accent-foreground font-semibold">
                      {Initials || "U"}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0">
                  <p className="text-base sm:text-lg font-semibold truncate">{name}</p>
                  {username ? (
                    <p className="text-sm text-muted-foreground truncate">@{username}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {state === "incoming" ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-accent/70 px-3 py-1 text-xs font-medium text-accent-foreground animate-pulse"
                    aria-live="polite"
                  >
                    <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                    Ringing
                  </span>
                ) : state === "outgoing" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    <PhoneOutgoing className="h-3.5 w-3.5" aria-hidden="true" />
                    Calling…
                  </span>
                ) : (
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", "bg-secondary text-secondary-foreground")}>
                    <CircleDot className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    {duration ?? "00:00"}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 pb-4">
            <div className="relative mt-2 flex items-center justify-center">
              <div
                className={cn(
                  "absolute -inset-2 rounded-3xl blur-2xl",
                  state === "active" ? "bg-primary/10" : "bg-accent/20"
                )}
                aria-hidden="true"
              />
              <div className="relative w-full rounded-xl bg-secondary px-4 py-3 text-center">
                {state === "incoming" && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <PhoneIncoming className="h-4 w-4" aria-hidden="true" />
                    Incoming voice call
                  </div>
                )}
                {state === "outgoing" && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <PhoneCall className="h-4 w-4" aria-hidden="true" />
                    Calling {name}…
                  </div>
                )}
                {state === "active" && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 text-sm">
                      <SignalMedium
                        className={cn("h-4 w-4", connection.color)}
                        aria-hidden="true"
                      />
                      <span className={cn("font-medium", connection.color)}>{connection.label}</span>
                    </div>
                    {duration ? (
                      <p className="text-xs text-muted-foreground">Duration {duration}</p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator className="bg-border" />

          <div className="px-6 py-4">
            {state === "incoming" ? (
              <div className="flex items-center justify-center gap-4">
                <Button
                  aria-label="Decline call"
                  onClick={onDecline}
                  variant="destructive"
                  className="h-12 w-12 rounded-full p-0"
                >
                  <PhoneOff className="h-5 w-5" aria-hidden="true" />
                </Button>
                <Button
                  aria-label="Answer call"
                  onClick={onAnswer}
                  className="h-12 w-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 p-0"
                >
                  <Phone className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
            ) : state === "outgoing" ? (
              <div className="flex items-center justify-center">
                <Button
                  aria-label="Cancel call"
                  onClick={onCancel ?? onDecline}
                  variant="destructive"
                  className="h-12 w-12 rounded-full p-0"
                >
                  <PhoneOff className="h-5 w-5" aria-hidden="true" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-6">
                <ToggleIconButton
                  label={muted ? "Unmute" : "Mute"}
                  active={muted}
                  onClick={() => onMuteToggle?.(!muted)}
                  icon={<Mic className="h-5 w-5" aria-hidden="true" />}
                />
                <Button
                  aria-label="Hang up"
                  onClick={onHangup ?? onDecline}
                  variant="destructive"
                  className="h-14 w-14 rounded-full p-0"
                >
                  <PhoneOff className="h-6 w-6" aria-hidden="true" />
                </Button>
                <ToggleIconButton
                  label={speaker ? "Speaker on" : "Speaker off"}
                  active={speaker}
                  onClick={() => onSpeakerToggle?.(!speaker)}
                  icon={<Headset className="h-5 w-5" aria-hidden="true" />}
                />
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface ToggleIconButtonProps {
  label: string
  active?: boolean
  onClick?: () => void
  icon: React.ReactNode
}

function ToggleIconButton({ label, active = false, onClick, icon }: ToggleIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "h-12 w-12 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "flex items-center justify-center",
        active
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "bg-secondary text-secondary-foreground hover:bg-muted"
      )}
    >
      {icon}
    </button>
  )
}