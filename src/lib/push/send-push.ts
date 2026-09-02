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
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL ?? "mailto:kms@miraesoftware.com",
    vapidPublicKey,
    process.env.VAPID_PRIVATE_KEY ?? "",
  );
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
