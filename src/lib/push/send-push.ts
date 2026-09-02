import webpush from "web-push";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export async function sendPushNotification(
  subscription: webpush.PushSubscription,
  payload: PushPayload,
): Promise<void> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  console.log('[push] VAPID_PUBLIC_KEY 길이:', vapidPublicKey.length, '앞4자:', vapidPublicKey.slice(0, 4));
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? "mailto:kms@miraesoftware.com",
    vapidPublicKey,
    process.env.VAPID_PRIVATE_KEY ?? "",
  );
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
