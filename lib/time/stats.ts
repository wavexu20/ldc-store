const DEFAULT_STATS_TIMEZONE = "Asia/Shanghai";

function isSafeTimeZoneValue(timeZone: string): boolean {
  return /^[A-Za-z0-9_+/.-]+$/.test(timeZone);
}

export function getStatsTimeZone(): string {
  const raw = process.env.STATS_TIMEZONE?.trim();
  if (!raw || !isSafeTimeZoneValue(raw)) return DEFAULT_STATS_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return DEFAULT_STATS_TIMEZONE;
  }
}

function partsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function localDateTimeToUtc(
  local: { year: number; month: number; day: number; hour?: number },
  timeZone: string
): Date {
  const target = Date.UTC(local.year, local.month - 1, local.day, local.hour ?? 0);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = partsAt(new Date(guess), timeZone);
    const representedAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    guess -= representedAsUtc - target;
  }
  return new Date(guess);
}

export function getTodayRangeSql(
  timeZone: string,
  now = new Date()
): { start: Date; end: Date } {
  const tz = isSafeTimeZoneValue(timeZone) ? timeZone : DEFAULT_STATS_TIMEZONE;
  const local = partsAt(now, tz);
  const nextDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return {
    start: localDateTimeToUtc(local, tz),
    end: localDateTimeToUtc(
      {
        year: nextDay.getUTCFullYear(),
        month: nextDay.getUTCMonth() + 1,
        day: nextDay.getUTCDate(),
      },
      tz
    ),
  };
}
