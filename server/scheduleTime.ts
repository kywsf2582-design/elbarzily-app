const cairoOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Africa/Cairo",
  timeZoneName: "longOffset",
});

/**
 * Treat model timestamps as Cairo wall-clock times, even if the model adds Z or
 * another offset. This keeps generated schedules aligned with the user's local
 * football venue times and accounts for Egypt's seasonal UTC offset.
 */
export function normalizeCairoWallTime(value: string): string {
  const match = value.trim().match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i
  );
  if (!match) return value;

  const [, date, hours, minutes, seconds] = match;
  const wallTime = `${date}T${hours}:${minutes}:${seconds ?? "00"}`;
  const reference = new Date(`${wallTime}Z`);
  if (Number.isNaN(reference.getTime())) return value;

  const zoneName = cairoOffsetFormatter
    .formatToParts(reference)
    .find(part => part.type === "timeZoneName")?.value;
  const offset = zoneName === "GMT" ? "+00:00" : zoneName?.replace(/^GMT/, "");
  if (!offset || !/^[+-]\d{2}:\d{2}$/.test(offset)) return value;
  return `${wallTime}${offset}`;
}


/** Return the half-open UTC interval for a Cairo calendar day. */
export function cairoDayBounds(date: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const utcMidnight = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(utcMidnight.getTime()) || utcMidnight.toISOString().slice(0, 10) !== date)
    return null;
  const nextDate = new Date(utcMidnight.getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10);
  const start = new Date(normalizeCairoWallTime(`${date}T00:00:00`));
  const end = new Date(normalizeCairoWallTime(`${nextDate}T00:00:00`));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start)
    return null;
  return { start, end };
}
