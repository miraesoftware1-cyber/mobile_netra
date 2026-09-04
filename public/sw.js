self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();

  const notifOptions = {
    body:    data.body ?? "",
    icon:    "/icon-192.png",
    badge:   "/icon-192.png",
    tag:     data.tag ?? "netra-push",
    data: {
      url:            data.url ?? "/",
      approvalAction: data.approvalAction ?? null,
    },
  };

  // 승인 요청 알림이면 액션 버튼 추가 (Android·데스크탑 Chrome 지원)
  if (data.approvalAction) {
    notifOptions.actions = [
      { action: "approve", title: "✅ 승인" },
      { action: "reject",  title: "❌ 반려" },
    ];
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? "Netra 알림", notifOptions)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notifData      = event.notification.data ?? {};
  const approvalAction = notifData.approvalAction;
  const url            = notifData.url ?? "/";

  // 승인 또는 반려 버튼 클릭
  if ((event.action === "approve" || event.action === "reject") && approvalAction) {
    const action = event.action === "approve" ? "APPROVED" : "REJECTED";
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
          action,
          comment:     "",
        }),
      }).catch(() => null)
    );
    return;
  }

  // 일반 클릭 → 앱 열기
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
