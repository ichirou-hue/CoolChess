export type RewardKind = 'puzzle' | 'theory' | 'game';

export type StudentState = {
  pawns: number;
  totalEarned: number;
  solved: number;
  theoryCompleted: number;
  currentStreak: number;
  bestStreak: number;
  lastActivity: string;
  dailyTaskDate: string;
  dailyTheoryDate: string;
  claimed: string[];
};

const studentStateKey = 'coolchess.studentState';
const defaultStudentState: StudentState = {
  pawns: 0,
  totalEarned: 0,
  solved: 0,
  theoryCompleted: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastActivity: '',
  dailyTaskDate: '',
  dailyTheoryDate: '',
  claimed: [],
};

export function readStudentState(): StudentState {
  if (typeof window === 'undefined') return defaultStudentState;
  try {
    return { ...defaultStudentState, ...JSON.parse(localStorage.getItem(studentStateKey) ?? '{}') };
  } catch {
    return defaultStudentState;
  }
}

function activityDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(date);
}

export function awardPawns(eventId: string, reward: number, kind: RewardKind = 'puzzle') {
  const state = readStudentState();
  if (state.claimed.includes(eventId)) return state;

  const today = activityDate();
  const yesterday = activityDate(new Date(Date.now() - 86400000));
  const dailyTaskDate = kind === 'puzzle' ? today : state.dailyTaskDate;
  const dailyTheoryDate = kind === 'theory' ? today : state.dailyTheoryDate;
  const completedToday = dailyTaskDate === today && dailyTheoryDate === today;
  const completedYesterday = state.dailyTaskDate === yesterday && state.dailyTheoryDate === yesterday;
  const nextStreak = completedToday && state.lastActivity !== today
    ? completedYesterday && state.lastActivity === yesterday ? state.currentStreak + 1 : 1
    : state.currentStreak;

  const next = {
    ...state,
    pawns: state.pawns + reward,
    totalEarned: state.totalEarned + reward,
    solved: state.solved + (kind === 'puzzle' ? 1 : 0),
    theoryCompleted: state.theoryCompleted + (kind === 'theory' ? 1 : 0),
    currentStreak: nextStreak,
    bestStreak: Math.max(state.bestStreak, nextStreak),
    lastActivity: completedToday ? today : state.lastActivity,
    dailyTaskDate,
    dailyTheoryDate,
    claimed: [...state.claimed, eventId],
  };

  localStorage.setItem(studentStateKey, JSON.stringify(next));
  window.dispatchEvent(new Event('coolchess:state'));
  return next;
}
