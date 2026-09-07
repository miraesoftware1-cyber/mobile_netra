import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const POLL_MS = 60 * 1000; // 1분 (백그라운드 폴링)
const VISIBILITY_DEBOUNCE_MS = 2 * 1000; // 2초 (포그라운드 전환 시 최소 간격)
const NAV_DEBOUNCE_MS = 30 * 1000; // 30초 (라우트 이동 시 최소 간격)

const SESSION_KEY = "app-initial-build-id";

export function useUpdateChecker() {
  const pathname = usePathname();
  const initialId = useRef<string | null>(
    typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SESSION_KEY) : null,
  );
  const lastCheck = useRef(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  async function check() {
    try {
      const res = await fetch(`/api/build-id?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const { buildId } = await res.json() as { buildId: string };
      lastCheck.current = Date.now();
      if (!initialId.current) {
        initialId.current = buildId;
        try { sessionStorage.setItem(SESSION_KEY, buildId); } catch { /* 무시 */ }
      } else if (buildId !== initialId.current) {
        setUpdateAvailable(true);
      }
    } catch {
      // 무시
    }
  }

  // 폴링 + visibilitychange
  useEffect(() => {
    check();
    const interval = setInterval(check, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > VISIBILITY_DEBOUNCE_MS) {
        check();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 라우트 이동 시 체크 (30초 이상 지난 경우)
  useEffect(() => {
    if (Date.now() - lastCheck.current > NAV_DEBOUNCE_MS) {
      check();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return updateAvailable;
}
