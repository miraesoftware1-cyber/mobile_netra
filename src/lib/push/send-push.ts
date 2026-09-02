import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";

webpush.setVapidDetails(
  "mailto:kms@miraesoftware.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
);

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
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
