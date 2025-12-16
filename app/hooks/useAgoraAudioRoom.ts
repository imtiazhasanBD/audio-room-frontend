// src/hooks/useAgoraAudioRoom.ts

import { useEffect, useRef, useState } from "react";
import AgoraRTC, {
  IAgoraRTCClient,
  ILocalAudioTrack,
  IAgoraRTCRemoteUser,
  IRemoteAudioTrack,
} from "agora-rtc-sdk-ng";

type UseAudioRoomConfig = {
  appId: string;
  channel: string;
  rtcUid: string | number;
  subscriberToken: string;
  fetchPublisherToken: () => Promise<string>;
};

export function useAgoraAudioRoom({
  appId,
  channel,
  rtcUid,
  subscriberToken,
  fetchPublisherToken,
}: UseAudioRoomConfig) {
  const [loading, setLoading] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [users, setUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [speakers, setSpeakers] = useState<Record<string, number>>({});

  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const trackRef = useRef<ILocalAudioTrack | null>(null);
  const publishedRef = useRef(false);
  const lockRef = useRef(false);

  // simple race guard
  const safe = async (fn: () => Promise<void>) => {
    while (lockRef.current) await new Promise(r => setTimeout(r, 20));
    lockRef.current = true;
    try {
      await fn();
      await new Promise(r => setTimeout(r, 40));
    } finally {
      lockRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      const client = AgoraRTC.createClient({
        mode: "rtc",
        codec: "vp8",
        role: "audience",
      });

      clientRef.current = client;

      // Join as subscriber
      await client.join(appId, channel, subscriberToken, rtcUid);

      // Create disabled mic
      const mic = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: "speech_standard",
      });
      await mic.setEnabled(false);
      trackRef.current = mic;

      // Remote users
      client.on("user-published", async (u, type) => {
        if (type !== "audio") return;
        await client.subscribe(u, "audio");
        (u.audioTrack as IRemoteAudioTrack)?.play();
        if (mounted) setUsers([...client.remoteUsers]);
      });

      client.on("user-unpublished", () => {
        if (mounted) setUsers([...client.remoteUsers]);
      });

      // Volume levels
      client.enableAudioVolumeIndicator();
      client.on("volume-indicator", (levels) => {
        const next: Record<string, number> = {};
        levels.forEach((v) => {
          if (v.level > 5) next[String(v.uid)] = v.level;
        });
        if (mounted) setSpeakers(next);
      });

      if (mounted) setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // MIC ON
  const turnOnMic = async () => {
    const client = clientRef.current;
    const track = trackRef.current;
    if (!client || !track) return;

    await safe(async () => {
      const pubToken = await fetchPublisherToken();
      await client.renewToken(pubToken);
      await new Promise(r => setTimeout(r, 300));

      await track.setEnabled(true);

      if (!publishedRef.current) {
        await client.publish(track);
        publishedRef.current = true;
      }

      setMicOn(true);
    });
  };

  // MIC OFF
  const turnOffMic = async () => {
    const client = clientRef.current;
    const track = trackRef.current;
    if (!client || !track) return;

    await safe(async () => {
      if (publishedRef.current) {
        await client.unpublish(track);
        publishedRef.current = false;
      }

      await track.setEnabled(false);

      await client.renewToken(subscriberToken);
      await new Promise(r => setTimeout(r, 300));

      setMicOn(false);
    });
  };

  const leave = async () => {
    const client = clientRef.current;
    const track = trackRef.current;
    if (!client) return;

    await safe(async () => {
      try {
        if (track) {
          if (publishedRef.current) {
            await client.unpublish(track);
          }
          track.stop();
          track.close();
        }
      } catch {}
      try {
        await client.leave();
      } catch {}
    });
  };

  return {
    loading,
    micOn,
    users,
    speakers,
    turnOnMic,
    turnOffMic,
    leave,
  };
}
