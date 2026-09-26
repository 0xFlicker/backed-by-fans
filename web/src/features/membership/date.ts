const maxDateMilliseconds = 8_640_000_000_000_000n;
const millisecondsPerSecond = 1_000n;

export function formatMembershipDate(timestamp: bigint, timeZone?: string) {
  if (timestamp === 0n) return "Not yet created";
  if (timestamp > maxDateMilliseconds / millisecondsPerSecond) {
    return `Unix timestamp ${timestamp.toString()} (outside calendar display range)`;
  }
  const formatted = new Intl.DateTimeFormat(timeZone ? "en-US" : undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(Number(timestamp * millisecondsPerSecond)));
  return timeZone ? `${formatted} ${timeZone}` : formatted;
}
