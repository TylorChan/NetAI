"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL, REALTIME_MODEL } from "@/lib/config";

function parseEphemeralToken(payload) {
  if (payload?.client_secret?.value) return payload.client_secret.value;
  if (payload?.value) return payload.value;
  return null;
}

export function useRealtimeSession() {
  const [status, setStatus] = useState("DISCONNECTED");
  const [events, setEvents] = useState([]);
  const pcRef = useRef(null);
  const audioRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);

  const pushEvent = useCallback((message) => {
    setEvents((prev) => [
      {
        ts: new Date().toISOString(),
        message
      },
      ...prev
    ].slice(0, 50));
  }, []);

  const disconnect = useCallback(() => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }

    setStatus("DISCONNECTED");
    pushEvent("Realtime disconnected");
  }, [pushEvent]);

  const connect = useCallback(async () => {
    if (pcRef.current) return;

    setStatus("CONNECTING");
    pushEvent("Requesting realtime session token");

    try {
      const sessionResponse = await fetch(`${API_BASE_URL}/v1/realtime/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: REALTIME_MODEL })
      });

      const sessionPayload = await sessionResponse.json();
      const ephemeralToken = parseEphemeralToken(sessionPayload);

      if (!ephemeralToken) {
        throw new Error("No ephemeral token returned by API");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      if (!audioRef.current) {
        const audioEl = document.createElement("audio");
        audioEl.autoplay = true;
        audioEl.style.display = "none";
        document.body.appendChild(audioEl);
        audioRef.current = audioEl;
      }

      pc.ontrack = (event) => {
        audioRef.current.srcObject = event.streams[0];
      };

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;
      dc.onopen = () => pushEvent("Data channel connected");
      dc.onclose = () => pushEvent("Data channel closed");
      dc.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type) {
            pushEvent(`Event: ${data.type}`);
          }
        } catch {
          pushEvent("Realtime message received");
        }
      };

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(REALTIME_MODEL)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ephemeralToken}`,
            "Content-Type": "application/sdp"
          },
          body: offer.sdp
        }
      );

      if (!sdpResponse.ok) {
        const text = await sdpResponse.text();
        throw new Error(`SDP exchange failed (${sdpResponse.status}): ${text}`);
      }

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text()
      };

      await pc.setRemoteDescription(answer);
      setStatus("CONNECTED");
      pushEvent("Realtime connected");
    } catch (error) {
      pushEvent(`Connect failed: ${error.message}`);
      disconnect();
    }
  }, [disconnect, pushEvent]);

  useEffect(() => {
    return () => {
      disconnect();
      if (audioRef.current && document.body.contains(audioRef.current)) {
        document.body.removeChild(audioRef.current);
        audioRef.current = null;
      }
    };
  }, [disconnect]);

  return {
    status,
    events,
    connect,
    disconnect
  };
}
