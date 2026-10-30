export type DownloadDeviceType = "mobile" | "tablet" | "desktop" | "other";
export type DownloadClientInfo = {
  deviceType: DownloadDeviceType;
  osName: string;
  browserName: string;
};

export function classifyDownloadAgent(userAgent: string | undefined): DownloadClientInfo {
  const agent = (userAgent ?? "").slice(0, 512);
  const lower = agent.toLowerCase();

  let osName = "Other";
  if (/android/i.test(agent)) osName = "Android";
  else if (/ipad|iphone|ipod/i.test(agent)) osName = "iOS";
  else if (/windows/i.test(agent)) osName = "Windows";
  else if (/cros/i.test(agent)) osName = "ChromeOS";
  else if (/macintosh|mac os x/i.test(agent)) osName = "macOS";
  else if (/linux/i.test(agent)) osName = "Linux";

  let deviceType: DownloadDeviceType = "other";
  const androidTablet = /android/i.test(agent) && !/mobile/i.test(agent);
  if (/ipad|tablet/i.test(agent) || androidTablet || (/macintosh/i.test(agent) && /touch/i.test(agent))) deviceType = "tablet";
  else if (/mobile|iphone|ipod|android/i.test(agent)) deviceType = "mobile";
  else if (/windows|macintosh|mac os x|linux|cros/i.test(agent)) deviceType = "desktop";

  let browserName = "Other";
  if (/samsungbrowser\//i.test(agent)) browserName = "Samsung Internet";
  else if (/edg(?:a|ios)?\//i.test(agent)) browserName = "Edge";
  else if (/opr\//i.test(agent)) browserName = "Opera";
  else if (/firefox\//i.test(agent) || /fxios\//i.test(agent)) browserName = "Firefox";
  else if (/crios\//i.test(agent) || /chrome\//i.test(agent)) browserName = "Chrome";
  else if (/safari\//i.test(agent)) browserName = "Safari";

  if (lower.includes("wv)") && osName === "Android") browserName = "Android WebView";
  return { deviceType, osName, browserName };
}

export function cairoIsoDate(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: "year" | "month" | "day") => parts.find(item => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftIsoDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}
