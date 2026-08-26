const maxDateMilliseconds = 8_640_000_000_000_000n;
const millisecondsPerSecond = 1_000n;

export function formatMembershipDate(timestamp: bigint) {
  if (timestamp === 0n) return "Not yet created";
  if (timestamp > maxDateMilliseconds / millisecondsPerSecond) {
    return `Unix timestamp ${timestamp.toString()} (outside calendar display range)`;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(Number(timestamp * millisecondsPerSecond)));
}
