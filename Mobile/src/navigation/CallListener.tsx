// src/navigation/CallListener.tsx
//
// Global call navigation listener.
// Uses navigationRef so it can be rendered safely outside individual navigators.

import { useEffect, useRef } from "react";
import { navigationRef } from "./navigationRef";
import { useCallContext } from "../context/CallContext";

export default function CallListener() {
  const { phase, callId, peer, mediaType } = useCallContext();
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${phase}:${callId || ""}`;

    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    if (!navigationRef.isReady()) return;

    const currentRoute = navigationRef.getCurrentRoute()?.name;

    if (
      (phase === "incoming" || phase === "outgoing") &&
      currentRoute !== "Call"
    ) {
      navigationRef.navigate(
        "Call" as any,
        {
          partner: peer
            ? {
                _id: peer._id,
                name: peer.name,
                photos: peer.photo
                  ? [{ url: peer.photo, isPrimary: true }]
                  : [],
              }
            : undefined,
          isVideo: mediaType === "video",
        } as any
      );

      return;
    }

    if (phase === "idle" && currentRoute === "Call") {
      if (navigationRef.canGoBack()) {
        navigationRef.goBack();
      }
    }
  }, [callId, mediaType, peer, phase]);

  return null;
}
