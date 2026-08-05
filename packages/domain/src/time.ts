export const APP_LOCALE = "pt-BR";
export const APP_TIMEZONE = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat(APP_LOCALE, {
  timeZone: APP_TIMEZONE,
  dateStyle: "short",
  timeStyle: "medium",
});

const isoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatDateTimePt(date: Date): string {
  return dateFormatter.format(date);
}

export function usageDateKey(date: Date): string {
  return isoDateFormatter.format(date);
}
