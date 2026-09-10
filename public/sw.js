// 새 SW 설치 즉시 활성화 (대기 없이)
self.addEventListener("install", (event) => { self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(clients.claim()); });

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();

  const apvBtnAction = data.apvBtnAction ?? "open_app";
  const rejBtnAction = data.rejBtnAction ?? "require_reason";

  const notifOptions = {
    body:    data.body ?? "",
    icon:    "/icon-192.png",
    badge:   "/icon-192.png",
    tag:     data.tag ?? "netra-push",
    silent:  data.silent === true,
    vibrate: data.silent === true ? [] : [200, 100, 200],
    data: {
      url:            data.url ?? "/",
      approvalAction: data.approvalAction ?? null,
      apvBtnAction,
      rejBtnAction,
    },
  };

  // 승인 요청 알림이면 액션 버튼 추가 (Android·데스크탑 Chrome 지원)
  if (data.approvalAction) {
    const apvLabel = data.apvBtnLabel ?? "✔ 승인";
    const rejLabel = data.rejBtnLabel ?? "✖ 반려";
    notifOptions.actions = [
      { action: "reject",  title: rejLabel },
      { action: "approve", title: apvLabel },
    ];
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? "Netra 알림", notifOptions)
  );
});

function openApp(url) {
  return clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const appClient = list.find((c) => c.url.startsWith(self.location.origin));
    if (appClient) {
      return appClient.focus()
        .then(() => appClient.navigate(url))
        .catch(() => clients.openWindow(url));
    }
    return clients.openWindow(url);
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData      = event.notification.data ?? {};
  const approvalAction = notifData.approvalAction;
  const url            = notifData.url ?? "/";
  const apvBtnAction   = notifData.apvBtnAction ?? "open_app";
  const rejBtnAction   = notifData.rejBtnAction ?? "require_reason";

  // 승인 버튼 클릭
  if (event.action === "approve" && approvalAction) {
    if (apvBtnAction === "silent_approve") {
      // 바로 승인: 앱 열지 않고 API 직접 호출
      event.waitUntil(
        fetch("/api/approval/action", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyCode: approvalAction.companyCode,
            corpCode:    approvalAction.corpCode,
            reqId:       approvalAction.reqId,
            empCode:     approvalAction.empCode,
            empName:     approvalAction.empName,
            action:      "APPROVED",
            comment:     "",
          }),
        }).catch(() => null)
      );
    } else {
      // 앱 열고 확인 (기본)
      event.waitUntil(openApp(url));
    }
    return;
  }

  // 반려 버튼 클릭
  if (event.action === "reject" && approvalAction) {
    if (rejBtnAction === "silent_reject") {
      // 바로 반려: API 직접 호출
      event.waitUntil(
        fetch("/api/approval/action", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyCode: approvalAction.companyCode,
            corpCode:    approvalAction.corpCode,
            reqId:       approvalAction.reqId,
            empCode:     approvalAction.empCode,
            empName:     approvalAction.empName,
            action:      "REJECTED",
            comment:     "",
          }),
        }).catch(() => null)
      );
    } else {
      // 사유 입력 필수: 앱 열어서 반려 화면으로
      const rejectUrl = url + (url.includes("?") ? "&" : "?") + "reject=1";
      event.waitUntil(openApp(rejectUrl));
    }
    return;
  }

  // 일반 클릭 → 앱 열기
  event.waitUntil(openApp(url));
});
