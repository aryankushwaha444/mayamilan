import { api } from "./client";
import type { AuthUser } from "./auth";

export interface BiodataPayload {
  name?: string;
  bio?: string;
  occupation?: string;
  education?: string;

  relationshipGoal?:
    | "serious"
    | "marriage"
    | "casual"
    | "friendship"
    | "not-sure";

  interests?: string[];

  location?: {
    city?: string;
    country?: string;
    coordinates?: {
      type: "Point";
      coordinates: [number, number];
    };
  };

  preferences?: {
    minAge?: number;
    maxAge?: number;
    preferredGender?: "male" | "female" | "non-binary" | "other" | "all";
    maxDistance?: number;
  };
}

export interface UserProfileResponse {
  user: AuthUser;
}

export interface UpdateBiodataResponse {
  user: AuthUser;
  message: string;
}

export interface PhotoUploadResponse {
  user?: AuthUser;
  message?: string;
  photo?: unknown;
  photos?: unknown[];
  [key: string]: unknown;
}

function validateUserId(userId: string): string {
  const id = userId.trim();

  if (!id || id.length > 200) {
    throw new Error("Invalid user ID.");
  }

  return encodeURIComponent(id);
}

export async function getMyProfile(): Promise<UserProfileResponse> {
  const { data } = await api.get<UserProfileResponse>("/api/users/me");
  return data;
}

export async function getUserProfile(
  userId: string
): Promise<UserProfileResponse> {
  const id = validateUserId(userId);
  const { data } = await api.get<UserProfileResponse>(`/api/users/${id}`);
  return data;
}

export async function updateMyBiodata(
  payload: BiodataPayload
): Promise<UpdateBiodataResponse> {
  const { data } = await api.put<UpdateBiodataResponse>(
    "/api/users/me",
    payload
  );
  return data;
}

export async function uploadPhoto(
  photoUri: string
): Promise<PhotoUploadResponse> {
  if (!photoUri?.trim()) {
    throw new Error("Photo URI is required.");
  }

  const filename = photoUri.split("/").pop()?.split("?")[0] || "upload.jpg";

  const extension = filename.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
  };

  const type = extension ? mimeTypes[extension] : undefined;

  if (!type) {
    throw new Error(
      "Unsupported photo format. Please choose a JPG, PNG, WebP, or HEIC image."
    );
  }

  const formData = new FormData();

  // React Native accepts a local-file descriptor for multipart uploads.
  formData.append("photo", {
    uri: photoUri,
    name: filename,
    type,
  } as unknown as Blob);

  const { data } = await api.post<PhotoUploadResponse>(
    "/api/users/me/photos",
    formData
  );

  return data;
}

export async function deletePhoto(photoId: string) {
  const id = validateUserId(photoId);
  const { data } = await api.delete(`/api/users/me/photos/${id}`);
  return data;
}

export async function setPrimaryPhoto(photoId: string) {
  const id = validateUserId(photoId);
  const { data } = await api.put(`/api/users/me/photos/${id}/primary`);
  return data;
}

export async function reportUser(userId: string, message: string) {
  const id = validateUserId(userId);
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    throw new Error("Please provide a report message.");
  }

  const { data } = await api.post(`/api/users/${id}/report`, {
    message: trimmedMessage,
  });

  return data;
}

export async function toggleBlockUser(userId: string) {
  const id = validateUserId(userId);
  const { data } = await api.post(`/api/users/${id}/block`);
  return data;
}
