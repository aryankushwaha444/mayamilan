// src/api/user.ts
import { api } from "./client";
import { AuthUser } from "./auth";

export interface BiodataPayload {
  name?: string;
  bio?: string;
  occupation?: string;
  education?: string;
  relationshipGoal?: string;
  interests?: string[];
  city?: string;
  country?: string;
  rashi?: string;
  gotra?: string;
  caste?: string;
  religion?: string;
  height?: string;
  maritalStatus?: string;
  familyType?: string;
  diet?: string;
}

export async function getMyProfile(): Promise<{ user: AuthUser }> {
  const { data } = await api.get("/api/users/me");
  return data;
}

export async function getUserProfile(userId: string): Promise<{ user: AuthUser }> {
  const { data } = await api.get(`/api/users/${userId}`);
  return data;
}

export async function updateMyBiodata(payload: BiodataPayload): Promise<{ user: AuthUser; message: string }> {
  const { data } = await api.put("/api/users/me", payload);
  return data;
}

export async function uploadPhoto(photoUri: string) {
  const formData = new FormData();
  const filename = photoUri.split("/").pop() || "upload.jpg";
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : `image/jpeg`;

  // @ts-ignore
  formData.append("photo", { uri: photoUri, name: filename, type });

  const { data } = await api.post("/api/users/me/photos", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function deletePhoto(photoId: string) {
  const { data } = await api.delete(`/api/users/me/photos/${encodeURIComponent(photoId)}`);
  return data;
}

export async function setPrimaryPhoto(photoId: string) {
  const { data } = await api.put(`/api/users/me/photos/${encodeURIComponent(photoId)}/primary`);
  return data;
}

export async function reportUser(userId: string, message: string) {
  const { data } = await api.post(`/api/users/${userId}/report`, { message });
  return data;
}

export async function blockUser(userId: string) {
  const { data } = await api.post(`/api/users/${userId}/block`);
  return data;
}
