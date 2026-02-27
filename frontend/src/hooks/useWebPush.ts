import { useState, useEffect, useCallback } from "react";
import { notificationsApi } from "@/lib/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function useWebPush(developerId: string | null | undefined) {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check browser support
  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
    }
  }, []);

  // Check existing subscription
  useEffect(() => {
    if (!isSupported || !developerId) return;

    const checkSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw-push.js");
        if (registration) {
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        }
      } catch {
        // Silently fail - SW may not be registered yet
      }
    };
    checkSubscription();
  }, [isSupported, developerId]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !developerId) return false;
    setIsLoading(true);

    try {
      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setIsLoading(false);
        return false;
      }

      // Get VAPID key
      const { public_key } = await notificationsApi.getVapidKey();

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource,
      });

      // Extract keys
      const rawKeys = subscription.toJSON();
      const p256dh = rawKeys.keys?.p256dh || "";
      const auth = rawKeys.keys?.auth || "";

      // Send to backend
      await notificationsApi.subscribePush(developerId, {
        endpoint: subscription.endpoint,
        p256dh_key: p256dh,
        auth_key: auth,
        user_agent: navigator.userAgent,
      });

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("Failed to subscribe to web push:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, developerId]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || !developerId) return false;
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw-push.js");
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await notificationsApi.unsubscribePush(developerId, subscription.endpoint);
          await subscription.unsubscribe();
        }
      }
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error("Failed to unsubscribe from web push:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, developerId]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}
