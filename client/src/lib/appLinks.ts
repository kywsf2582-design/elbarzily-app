export type AppOpenTarget = {
  webPath: string;
  desktopUri: string;
};

/** Map only known, local deep-link routes. Never accept arbitrary redirect URLs. */
export function resolveAppOpenTarget(pathname: string): AppOpenTarget | null {
  if (pathname === "/open") {
    return { webPath: "/", desktopUri: "elbarzily://app" };
  }

  const bookingMatch = /^\/open\/booking\/([1-9]\d*)$/.exec(pathname);
  if (bookingMatch) {
    const bookingId = bookingMatch[1];
    return {
      webPath: `/profile?booking=${bookingId}`,
      desktopUri: `elbarzily://booking/${bookingId}`,
    };
  }

  return null;
}

export function getAuthAwareOpenPath(target: AppOpenTarget, signedIn: boolean): string {
  return signedIn ? target.webPath : `/login?next=${encodeURIComponent(target.webPath)}`;
}
