"use client";

import axios, { AxiosError } from "axios";
import { getToken } from "./auth";

// ---- Base API ----
const API_BASE =
  process.env.NEXT_PUBLIC_API ?? "http://localhost:8000";

console.log("API BASE =>", API_BASE);

const api = axios.create({
  baseURL: API_BASE,
});

// ---- Request interceptor: attach JWT ----
api.interceptors.request.use((config) => {
  const token = getToken();
  console.log("AXIOS TOKEN =>", token);
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Response interceptor: error handling / 401 ----
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<any>) => {
    const status = error.response?.status;
    const data = error.response?.data;

console.error("API ERROR RAW:", error.response);


    if (status === 401 && typeof window !== "undefined") {
      // Token invalid/expired → force logout to login page
      try {
        localStorage.removeItem("token");
      } catch {}
      window.location.href = "/login";
    }

    // Throw a more readable error
    const message =
      (data && (data.message || data.error)) ||
      error.message ||
      "Unknown API error";

    return Promise.reject(new Error(message));
  }
);

// ---- Types ----
export type Room = {
  id: string;
  name: string;
  hostId: string;
  isLive: boolean;
  createdAt: string;
};

export type Seat = {
  id: string;
  roomId: string;
  index: number;
  userId: string | null;
  micOn: boolean;
  locked: boolean;
  mode: string
};

export type Participant = {
  id: string;
  roomId: string;
  userId: string;
  rtcUid: string,
  isHost: boolean;
  muted: boolean;
};

export type RoomDetail = {
  id: string;
  name: string;
  hostId: string;
  isLive: boolean;
  seats: Seat[];
  participants: Participant[];
};

export type Ban = {
  id: string;
  roomId: string;
  userId: string;
  bannedBy: string;
  reason?: string;
};

type JoinRoomResult = {
  room: RoomDetail;
  token: {
    provider: string;
    token: string;
    expiresAt: string;
    uid: number;
  };
};

// ---- Auth ----
export async function loginApi(data: { email: string; password: string }) {
  const res = await api.post("/auth/login", data);
  const d = res.data;

  // Backend might return accessToken / token / access_token
  const token: string =
    d.token || d.accessToken || d.access_token;

  if (!token) {
    throw new Error("Login response missing token");
  }

  return { token, user: d.user };
}

// ---- Rooms ----
export async function fetchRooms(): Promise<Room[]> {
  const res = await api.get("/rooms");
  // controller: { success: true, rooms }
  return res.data.rooms as Room[];
}

export async function createRoomApi(
  name: string,
  provider?: string
): Promise<Room> {
  // controller: { success: true, room }
  const res = await api.post("/rooms", { name, provider });
  return res.data.room as Room;
}

export async function getRoomDetail(roomId: string): Promise<RoomDetail> {
  const res = await api.get(`/rooms/${roomId}`);
  return res.data.room ?? res.data.data?.room;
}


export async function getPublisherTokenApi(roomId: string) {
  const res = await api.post(`/rooms/${roomId}/rtc/publisher`);
  // backend returns: { token: { provider, token, expiresAt, uid } }
  return res.data.token as {
    provider: string;
    token: string;
    expiresAt: string;
    uid: number;
  };
}


export async function joinRoomApi(
  roomId: string
): Promise<JoinRoomResult> {
  // controller: { success: true, data: { room, token } }
  const res = await api.post(`/rooms/${roomId}/join`);
  return res.data.data as JoinRoomResult;
}

export async function leaveRoomApi(roomId: string) {
  // controller: { success: true, data: ... }
  await api.post(`/rooms/${roomId}/leave`);
}


export async function hostTakeSeatApi(roomId: string, seatIndex: number) {
  const res = await api.post(`/rooms/${roomId}/seat/host`, { seatIndex });
  return res.data as { ok: boolean; seats: any[] };
}

export async function takeSeatApi(roomId: string, seatIndex: number) {
  const res = await api.post(`/rooms/${roomId}/seat/take`, { seatIndex });
  return res.data;
}


// ---- Seats ----
export async function requestSeatApi(
  roomId: string,
  seatIndex?: number
) {

  
  // controller: { success: true, request }
  const res = await api.post(`/rooms/${roomId}/seat/request`, {
    seatIndex,
  });
  return res.data.request;
}

export async function approveSeatApi(
  roomId: string,
  requestId: string,
  accept: boolean
) {
  const res = await api.post(`/rooms/${roomId}/seat/approve`, {
    requestId,
    accept,
  });

  return {
    ok: res.data.ok,
    seats: res.data.seats,
    seatIndex: res.data.seatIndex,
  };
}


export async function changeSeatModeApi(roomId: string, seatIndex: number, mode: string) {
  const res = await api.post(`/rooms/${roomId}/seat/mode`, { seatIndex, mode });
  return res.data;
}

export async function leaveSeatApi(roomId: string) {
  // controller: { success: true, data: ... }
  const res = await api.post(`/rooms/${roomId}/seat/leave`);
  return res.data;
}

// ---- Ban ----
export async function banUserApi(
  roomId: string,
  userId: string,
  reason?: string
) {
  // controller: { success: true, data: Ban }
  const res = await api.post(`/rooms/${roomId}/ban`, {
    userId,
    reason,
  });
  return res.data.data as Ban;
}

export async function unbanUserApi(roomId: string, userId: string) {
  // controller: { success: true, data: ... }
  await api.delete(`/rooms/${roomId}/ban/${userId}`);
}
