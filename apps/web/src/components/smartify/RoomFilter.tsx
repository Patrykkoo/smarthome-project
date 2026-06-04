import { cn } from "@/lib/utils";

interface RoomFilterProps {
  rooms: string[];
  active: string;
  onChange: (room: string) => void;
  className?: string;
}

export function RoomFilter({ rooms, active, onChange, className }: RoomFilterProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {rooms.map((room) => {
        const isActive = room === active;
        return (
          <button
            key={room}
            onClick={() => onChange(room)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "glass text-foreground/80 hover:text-foreground",
            )}
          >
            {room}
          </button>
        );
      })}
    </div>
  );
}
