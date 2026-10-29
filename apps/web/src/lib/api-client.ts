import axios from "axios";

export const apiClient = axios.create({
  baseURL: "/",
  withCredentials: true,
  headers: {
    Accept: "application/json",
    "Cache-Control": "no-store",
  },
});

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: string; message?: string }>(error)) {
    return (
      error.response?.data?.error ??
      error.response?.data?.message ??
      (error.response ? error.message : fallback)
    );
  }
  return error instanceof Error ? error.message : fallback;
}
