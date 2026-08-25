/**
 * Simple fetch wrapper used to verify MSW interception works.
 * In production, replace with real backend URL.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export async function checkHealth(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}
