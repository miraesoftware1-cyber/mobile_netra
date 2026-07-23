import { useEffect, useRef, useState } from "react";

const POLL_MS = 5 * 60 * 1000; // 5분 (백그라운드 폴링)
const VISIBILITY_DEBOUNCE_MS = 5 * 1000; // 5초 (포그라운드 전환 시 최소 간격)

export function useUpdateChecker() {
  const initialId = useRef<string | null>(null);
  const lastCheck = useRef(0);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/build-id", { cache: "no-store" });
        if (!res.ok) return;
        const { buildId } = await res.json() as { buildId: string };
        lastCheck.current = Date.now();
        if (!initialId.current) {
          initialId.current = buildId;
        } else if (buildId !== initialId.current) {
          setUpdateAvailable(true);
        }
      } catch {
        // 무시
      }
    }

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
  }, []);

  return updateAvailable;
}
