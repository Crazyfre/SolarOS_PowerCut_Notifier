export type MainTabParamList = {
  Dashboard: undefined;
  History: undefined;
  Analytics: undefined;
};

export const MAIN_TABS = ['Dashboard', 'History', 'Analytics'] as const;
export const MAIN_TAB_OPTIONS = { initialRouteName: MAIN_TABS[0], backBehavior: 'history' as const };
type MainTabName = typeof MAIN_TABS[number];
type TabState = { index?: number; routes?: readonly { name: string }[] };

export function getTabSwipeTarget(
  state: TabState | undefined,
  translationX: number,
  translationY: number,
  isRTL = false,
): MainTabName | null {
  if (!Number.isFinite(translationX) || !Number.isFinite(translationY) ||
      Math.abs(translationX) < 60 || Math.abs(translationX) < Math.abs(translationY) * 1.25) return null;

  const routeName = state?.routes?.[state.index ?? 0]?.name;
  const currentIndex = MAIN_TABS.findIndex((name) => name === routeName);
  const index = currentIndex < 0 ? 0 : currentIndex;
  const direction = (translationX < 0 ? 1 : -1) * (isRTL ? -1 : 1);
  return MAIN_TABS[index + direction] ?? null;
}

export function getTabBarLayout(bottomInset: number, fontScale = 1) {
  const bottom = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  return {
    height: 60 + bottom + Math.ceil(14 * (scale - 1)),
    paddingBottom: 8 + bottom,
  };
}

export function getTabSwipeEdgeInsets(insets: { left: number; right: number }) {
  // Leave edge-origin swipes to Android/iOS system back navigation.
  return { left: Math.max(32, insets.left), right: Math.max(32, insets.right) };
}
