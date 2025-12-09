"use client";

import axios, { AxiosError } from "axios";
import { getToken } from "./auth";

// ---- Base API ----
export const API_BASE =
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
  mode: string;
  user?: {
    id: string;
    nickName?: string;
    profilePicture?: string;
  } | null;
};


export type Participant = {
  id: string;
  userId: string;
  rtcUid: string;
  isHost: boolean;
  muted: boolean;
  user: {
    id: string;
    nickName: string;
    profilePicture: string | null;
    email?: string;
  };
};

export type RoomDetail = {
  id: string;
  name: string;
  hostId: string;
  imageUrl?: string;
  seatCount: number;
  tags: string[];
  host: {
    id: string;
    nickName: string;
    profilePicture: string | null;
    email: string;
  };
  seats: Seat[];
  participants: Participant[];
  participantCount: number;
};


export type RoomListItem = {
  id: string;
  name: string;
  imageUrl?: string;
  seatCount: number;
  tags: string[];
    hostId: string;
  //isLive: boolean;
  seats: Seat[];
  host: {
    id: string;
    nickName: string;
    profilePicture: string | null;
    email: string;
  };
  participantCount: number;
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
export async function fetchRooms(): Promise<RoomListItem[]> {
  const res = await api.get("/audio-room/all");

  return res.data.rooms.map((room: any) => ({
    id: room.id,
    name: room.name,
    imageUrl: room.imageUrl,
    seatCount: room.seatCount,
    tags: room.tags,
    host: room.host,
    participantCount: room._count.participants
  }));
}


export async function createRoomApi(form: {
  name: string;
  seatCount: number;
  tags: string[];
  image?: File | null;
}) {
  const fd = new FormData();
  fd.append("name", form.name);
  fd.append("seatCount", String(form.seatCount));

  form.tags.forEach((t) => fd.append("tags", t));

  if (form.image) {
    fd.append("image", form.image);
  }

  const res = await api.post("/audio-room", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return res.data.room;
}


export async function getRoomDetail(roomId: string): Promise<RoomDetail> {
  const res = await api.get(`/audio-room/${roomId}/details`);
  const room = res.data.room;

  return room
}


export async function getPublisherTokenApi(roomId: string) {
  const res = await api.post(`/audio-room/${roomId}/rtc/publisher`);
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
  const res = await api.post(`/audio-room/${roomId}/join`);
  return res.data.data as JoinRoomResult;
}

export async function leaveRoomApi(roomId: string) {
  // controller: { success: true, data: ... }
  await api.post(`/audio-room/${roomId}/leave`);
}


export async function hostTakeSeatApi(roomId: string, seatIndex: number) {
  const res = await api.post(`/audio-room/${roomId}/seat/host`, { seatIndex });
  return res.data as { ok: boolean; seats: any[] };
}

export async function takeSeatApi(roomId: string, seatIndex: number) {
  const res = await api.post(`/audio-room/${roomId}/seat/take`, { seatIndex });
  return res.data;
}


// ---- Seats ----
export async function requestSeatApi(
  roomId: string,
  seatIndex?: number
) {

  
  // controller: { success: true, request }
  const res = await api.post(`/audio-room/${roomId}/seat/request`, {
    seatIndex,
  });
  return res.data.request;
}

export async function approveSeatApi(
  roomId: string,
  requestId: string,
  accept: boolean
) {
  const res = await api.post(`/audio-room/${roomId}/seat/approve`, {
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
  const res = await api.post(`/audio-room/${roomId}/seat/mode`, { seatIndex, mode });
  return res.data;
}

export async function updateSeatCountApi(roomId: string, seatCount: number) {
  const res = await api.patch(`/audio-room/${roomId}/seat-count`, {
    seatCount,
  });
  return res.data;
}


export async function hostMuteSeatApi(
  roomId: string,
  seatIndex: number,
  mute: boolean
) {
  const res = await api.post(`/audio-room/${roomId}/seat/mute`, { seatIndex, mute });
  return res.data;
}



export async function muteSeatApi(roomId: string, seatIndex: number) {
  const res = await api.post(`/audio-room/${roomId}/seat/${seatIndex}/mute`);
  return res.data;
}

export async function unmuteSeatApi(roomId: string, seatIndex: number) {
  const res = await api.post(`/audio-room/${roomId}/seat/${seatIndex}/unmute`);
  return res.data;
}


export async function leaveSeatApi(roomId: string) {
  // controller: { success: true, data: ... }
  const res = await api.post(`/audio-room/${roomId}/seat/leave`);
  return res.data;
}
export async function kickUserApi(roomId: string, userId: string) {
  console.log("roooommmiddddd", roomId)
  return api.post(`/audio-room/${roomId}/kick`, { userId });
}
// ---- Ban ----

// ---- Kick list / unkick ----
export async function getKickListApi(roomId: string) {
  console.log("🔵 HostKickList component mounted");

  const res = await api.get(`/audio-room/${roomId}/kick/all`);
  console.log("ressssssssssssssssssssssssssssssssssssssssssssssssssssssssssssssss",res)
  // response: { success: true, kicks }
  return res.data as Array<{
    id: string;
    roomId: string;
    userId: string;
    bannedBy: string;
    expiresAt: string;
    user?: { id: string; name?: string; email?: string };
  }>;
}

export async function unkickApi(roomId: string, userId: string) {
  const res = await api.delete(`/audio-room/${roomId}/unkick/${userId}`);
  return res.data;
}

export async function banUserApi(
  roomId: string,
  userId: string,
  reason?: string
) {
  // controller: { success: true, data: Ban }
  const res = await api.post(`/audio-room/${roomId}/ban`, {
    userId,
    reason,
  });
  return res.data.data as Ban;
}

export async function unbanUserApi(roomId: string, userId: string) {
  // controller: { success: true, data: ... }
  await api.delete(`/audio-room/${roomId}/ban/${userId}`);
}
