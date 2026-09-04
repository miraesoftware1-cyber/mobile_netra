import webpush from "web-push";

export interface PushApprovalAction {
  reqId:       number;
  companyCode: string;
  corpCode:    string;
  empCode:     string;
  empName:     string;
}

export interface PushPayload {
  title:          string;
  body:           string;
  url?:           string;
  tag?:           string;
  approvalAction?: PushApprovalAction;  // 있으면 알림에 승인/반려 버튼 추가
}

export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: PushPayload,
): Promise<void> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? "mailto:kms@miraesoftware.com",
    vapidPublicKey,
    process.env.VAPID_PRIVATE_KEY ?? "",
  );
  await webpush.sendNotification(subscription, JSON.stringify(payload), {
    urgency: 'high',
    TTL: 60,
  });
}
