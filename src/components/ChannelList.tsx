import { Tv, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Channel } from "@/lib/channels";

interface Props {
  channels: Channel[];
  currentId: string;
  onSelect: (id: string) => void;
}

export function ChannelList({ channels, currentId, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
          القنوات المتاحة
        </h3>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-muted-foreground font-num">
          {channels.length}
        </span>
      </div>
      <div className="space-y-2">
        {channels.map((ch, i) => {
          const active = ch.id === currentId;
          return (
            <button
              key={ch.id}
              onClick={() => onSelect(ch.id)}
              style={{ animationDelay: `${i * 40}ms` }}
              className={cn(
                "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-3 text-right transition-all duration-300 animate-fade-in-up",
                active
                  ? "border-primary-glow/40 bg-gradient-primary shadow-glow"
                  : "glass-panel hover:border-primary/40 hover-lift"
              )}
            >
              {active && (
                <div className="absolute inset-0 -z-0 opacity-30">
                  <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/30 blur-2xl" />
                </div>
              )}
              <div
                className={cn(
                  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition",
                  active ? "bg-white/25 ring-1 ring-white/40" : "bg-primary/15 ring-1 ring-primary/20"
                )}
              >
                {active ? (
                  <Radio className="h-5 w-5 text-white" />
                ) : (
                  <Tv className="h-5 w-5 text-primary-glow" />
                )}
              </div>
              <div className="relative flex-1 overflow-hidden text-right">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      "truncate font-bold",
                      active ? "text-white" : "text-foreground"
                    )}
                  >
                    {ch.name}
                  </p>
                  {active && (
                    <span className="flex h-2 w-2 rounded-full bg-live live-pulse" />
                  )}
                </div>
                <p
                  className={cn(
                    "truncate text-xs",
                    active ? "text-white/85" : "text-muted-foreground"
                  )}
                >
                  {active ? "يُبَث الآن" : ch.description || "اضغط للمشاهدة"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
