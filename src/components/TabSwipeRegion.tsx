import React, { useMemo } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTabSwipeEdgeInsets, getTabSwipeTarget, MainTabParamList } from '../navigation/tabNavigation';

/** Wrap page content inside the tab navigator; headers and tab buttons stay outside. */
export function TabSwipeRegion({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const focused = useIsFocused();
  const edges = getTabSwipeEdgeInsets(useSafeAreaInsets());
  const swipe = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .enabled(focused)
    .activeOffsetX([-20, 20])
    .failOffsetY([-16, 16])
    .maxPointers(1)
    .hitSlop({ left: -edges.left, right: -edges.right })
    .onEnd((event, success) => {
      if (!success || !navigation.isFocused()) return;
      // This is the initialized TAB state, including on the very first swipe.
      const target = getTabSwipeTarget(navigation.getState(), event.translationX, event.translationY, I18nManager.isRTL);
      if (target) navigation.jumpTo(target);
    }), [navigation, focused, edges.left, edges.right]);

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.content} collapsable={false}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ content: { flex: 1 } });
