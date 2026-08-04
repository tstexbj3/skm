"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { saveRoom, type RoomFormState } from "@/app/(app)/rooms/actions";
import {
  ROOM_KINDS,
  ROOM_STATUSES,
  WATER_MODES,
  STATUS_DOT,
  STATUS_RING,
  formatMoney,
  type Room,
  type WaterMode,
} from "@/lib/rooms";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Editing = Room | "new" | null;

export function RoomsBoard({
  rooms,
  isOwner,
  waterPersonRate,
}: {
  rooms: Room[];
  isOwner: boolean;
  waterPersonRate: number;
}) {
  const t = useTranslations("rooms");
  const [editing, setEditing] = useState<Editing>(null);

  const floors = useMemo(() => {
    const map = new Map<number, Room[]>();
    for (const r of rooms) {
      const list = map.get(r.floor) ?? [];
      list.push(r);
      map.set(r.floor, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rooms]);

  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            {t("addRoom")}
          </Button>
        </div>
      )}

      {floors.map(([floor, floorRooms]) => (
        <section key={floor} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("floor", { n: floor })}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {floorRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                waterPersonRate={waterPersonRate}
                onEdit={isOwner ? () => setEditing(room) : undefined}
              />
            ))}
          </div>
        </section>
      ))}

      {isOwner && editing !== null && (
        <RoomDialog
          editing={editing}
          waterPersonRate={waterPersonRate}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RoomCard({
  room,
  waterPersonRate,
  onEdit,
}: {
  room: Room;
  waterPersonRate: number;
  onEdit?: () => void;
}) {
  const t = useTranslations("rooms");

  const waterLine =
    room.water_billing_mode === "PER_PERSON"
      ? `${room.occupant_count} ${t("occupantsShort")} · ฿${formatMoney(
          waterPersonRate
        )}${t("perPersonUnit")}`
      : room.water_billing_mode === "FLAT"
        ? `฿${formatMoney(room.water_rate)} ${t("flatSuffix")}`
        : `฿${formatMoney(room.water_rate)}${t("perUnitUnit")}`;

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="font-semibold">{room.room_number}</span>
        <span
          className={cn("size-2.5 rounded-full", STATUS_DOT[room.status])}
          title={t(`statuses.${room.status}`)}
        />
      </div>
      <div className="text-xs text-muted-foreground">
        {t(`kinds.${room.room_kind}`)}
      </div>
      <div className="mt-1 font-medium">฿{formatMoney(room.rent_rate)}</div>
      <div className="text-xs text-muted-foreground">{waterLine}</div>
    </>
  );

  const base = cn(
    "rounded-lg border border-l-4 bg-card p-3 text-left",
    STATUS_RING[room.status]
  );

  if (!onEdit) return <div className={base}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(base, "transition-colors hover:bg-accent")}
    >
      {inner}
    </button>
  );
}

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function RoomDialog({
  editing,
  waterPersonRate,
  onClose,
}: {
  editing: Room | "new";
  waterPersonRate: number;
  onClose: () => void;
}) {
  const t = useTranslations("rooms");
  const isNew = editing === "new";
  const room = isNew ? null : editing;
  const [waterMode, setWaterMode] = useState<WaterMode>(
    room?.water_billing_mode ?? "PER_PERSON"
  );
  const [state, formAction, pending] = useActionState<RoomFormState, FormData>(
    saveRoom,
    {}
  );

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  const errorMsg = state.error
    ? t.has(`errors.${state.error}`)
      ? t(`errors.${state.error}`)
      : state.error
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? t("addRoom") : t("editRoom")}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {room && <input type="hidden" name="id" value={room.id} />}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="room_number">{t("roomNumber")}</Label>
              <Input
                id="room_number"
                name="room_number"
                defaultValue={room?.room_number ?? ""}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floor">{t("floorLabel")}</Label>
              <Input
                id="floor"
                name="floor"
                type="number"
                min={0}
                defaultValue={room?.floor ?? 1}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="room_kind">{t("kind")}</Label>
            <select
              id="room_kind"
              name="room_kind"
              defaultValue={room?.room_kind ?? "RESIDENTIAL"}
              className={selectClass}
            >
              {ROOM_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rent_rate">
              {t("rent")} ({t("baht")})
            </Label>
            <Input
              id="rent_rate"
              name="rent_rate"
              type="number"
              min={0}
              step="any"
              defaultValue={room?.rent_rate ?? "0"}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="water_billing_mode">{t("waterMode")}</Label>
              <select
                id="water_billing_mode"
                name="water_billing_mode"
                value={waterMode}
                onChange={(e) => setWaterMode(e.target.value as WaterMode)}
                className={selectClass}
              >
                {WATER_MODES.map((m) => (
                  <option key={m} value={m}>
                    {t(`waterModes.${m}`)}
                  </option>
                ))}
              </select>
            </div>
            {waterMode === "PER_PERSON" ? (
              <div className="space-y-2">
                <Label htmlFor="occupant_count">{t("occupants")}</Label>
                <Input
                  id="occupant_count"
                  name="occupant_count"
                  type="number"
                  min={0}
                  step="1"
                  defaultValue={room?.occupant_count ?? 0}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="water_rate">
                  {waterMode === "FLAT" ? t("flatAmount") : t("waterRate")} (
                  {t("baht")})
                </Label>
                <Input
                  id="water_rate"
                  name="water_rate"
                  type="number"
                  min={0}
                  step="any"
                  defaultValue={room?.water_rate ?? "0"}
                />
              </div>
            )}
          </div>
          {waterMode === "PER_PERSON" && (
            <p className="text-xs text-muted-foreground">
              {t("waterPersonHint", { rate: waterPersonRate })}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="status">{t("status")}</Label>
            <select
              id="status"
              name="status"
              defaultValue={room?.status ?? "VACANT"}
              className={selectClass}
            >
              {ROOM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">{t("note")}</Label>
            <Input id="note" name="note" defaultValue={room?.note ?? ""} />
          </div>

          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
