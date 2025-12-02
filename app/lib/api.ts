"use client";



import axios from "axios";
import { getToken } from "./auth";

const api = axios.create({
  baseURL: "https://kotkoti.stallforest.com",
});

api.interceptors.request.use((config) => {
  const token = getToken();
   console.log("AXIOS TOKEN =>", token);  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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
};

export type Participant = {
  id: string;
  roomId: string;
  userId: string;
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

// ---- Auth ----
// ADJUST to match your real login endpoint & payload
export async function loginApi(data: { email: string; password: string }) {
  const res = await api.post("/auth/login", data);
  // expected response: { accessToken: "...", user: {...} }
  return res.data as { token: string; user: any };
}

// ---- Rooms ----
// You must implement GET /rooms in backend or adjust here
export async function fetchRooms(): Promise<Room[]> {
  const res = await api.get("/rooms");
  return res.data;
}

export async function createRoomApi(name: string, provider?: string) {
  const res = await api.post("/rooms", { name, provider });
  return res.data.room as Room;
}

export async function getRoomDetail(roomId: string): Promise<RoomDetail> {
  const res = await api.get(`/rooms/${roomId}`);
  return res.data as RoomDetail;
}

export async function joinRoomApi(roomId: string) {
  const res = await api.post(`/rooms/${roomId}/join`);
  return res.data as {
    room: RoomDetail;
    token: { provider: string; token: string; expiresAt: string, uid: number};
  };
}

export async function leaveRoomApi(roomId: string) {
  await api.post(`/rooms/${roomId}/leave`);
}

// ---- Seats ----
export async function requestSeatApi(roomId: string, seatIndex?: number) {
  await api.post(`/rooms/${roomId}/seat/request`, { seatIndex });
}

export async function approveSeatApi(roomId: string, requestId: string, accept: boolean) {
  await api.post(`/rooms/${roomId}/seat/approve`, { requestId, accept });
}

export async function leaveSeatApi(roomId: string) {
  await api.post(`/rooms/${roomId}/seat/leave`);
}

// ---- Ban ----
export async function banUserApi(roomId: string, userId: string, reason?: string) {
  const res = await api.post(`/rooms/${roomId}/ban`, { userId, reason });
  return res.data as Ban;
}

export async function unbanUserApi(roomId: string, userId: string) {
  await api.delete(`/rooms/${roomId}/ban/${userId}`);
}
