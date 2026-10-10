import { getToken } from '../../auth/api/authApi';
import { fetchApi, readApiError } from '../../../shared/api/apiBase';

export type CourseProgress = {
  theory_completed: boolean;
  quiz_completed: boolean;
  practice_completed: boolean;
};

export type CourseProgressMap = Record<string, CourseProgress>;
export type CourseMilestone = keyof CourseProgress;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetchApi(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<T>;
}

export function getCourseProgress() {
  return request<CourseProgressMap>('/api/learning/progress');
}

export function markCourseProgress(topicId: string, milestone: CourseMilestone) {
  return syncCourseProgress(topicId, { [milestone]: true });
}

export function syncCourseProgress(topicId: string, progress: Partial<CourseProgress>) {
  return request<CourseProgress>(`/api/learning/progress/${encodeURIComponent(topicId)}`, {
    method: 'PATCH',
    body: JSON.stringify(progress),
  });
}
