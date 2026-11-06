const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const React = require('react');
const { TabRouter, TabActions, CommonActions, StackRouter } = require('@react-navigation/routers');
const { createLoader, root } = require('./helpers.cjs');

const policy = createLoader()('src/navigation/tabNavigation.ts');
const routerOptions = { routeNames: [...policy.MAIN_TABS], routeParamList: {}, routeGetIdList: {} };

function swipeEnvironment() {
  const router = TabRouter(policy.MAIN_TAB_OPTIONS);
  let state = router.getInitialState(routerOptions);
  let focused = true;
  const jumps = [];
  const config = {};
  const gesture = {};
  for (const method of ['runOnJS', 'enabled', 'activeOffsetX', 'failOffsetY', 'maxPointers', 'hitSlop', 'onEnd']) {
    gesture[method] = (value) => { config[method] = value; return gesture; };
  }
  const act = (action) => { state = router.getStateForAction(state, action, routerOptions) ?? state; };
  const navigation = {
    getState: () => state, isFocused: () => focused,
    jumpTo: (name) => { jumps.push(name); act(TabActions.jumpTo(name)); },
  };
  const load = createLoader({
    react: { ...React, useMemo: (fn) => fn() },
    'react-native': { View: 'View', StyleSheet: { create: (styles) => styles }, I18nManager: { isRTL: false } },
    '@react-navigation/native': { useNavigation: () => navigation, useIsFocused: () => focused },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ left: 0, right: 0, top: 24, bottom: 24 }) },
    'react-native-gesture-handler': { Gesture: { Pan: () => gesture }, GestureDetector: 'GestureDetector' },
  });
  load('src/components/TabSwipeRegion.tsx').TabSwipeRegion({ children: null });
  return { config, jumps, state: () => state, current: () => state.routes[state.index].name,
    swipe: (x, y = 0, success = true) => config.onEnd({ translationX: x, translationY: y }, success),
    tap: (name) => act(TabActions.jumpTo(name)), back: () => act(CommonActions.goBack()),
    blur: () => { focused = false; } };
}

test('a cold-launch swipe opens History without any previous tab press', () => {
  const env = swipeEnvironment();
  assert.equal(env.current(), 'Dashboard');
  assert.equal(env.state().routes[0].state, undefined);
  env.swipe(-100);
  assert.equal(env.current(), 'History');
  assert.deepEqual(env.jumps, ['History']);
});

test('swiping and pressing icons stay synchronized in both directions', () => {
  const env = swipeEnvironment();
  env.swipe(-100);
  env.swipe(-100);
  assert.equal(env.current(), 'Analytics');
  env.tap('Dashboard');
  env.swipe(-100);
  assert.equal(env.current(), 'History');
  env.swipe(100);
  assert.equal(env.current(), 'Dashboard');
});

test('first and last pages do not wrap or navigate outside the tabs', () => {
  const env = swipeEnvironment();
  env.swipe(100);
  assert.deepEqual(env.jumps, []);
  env.tap('Analytics');
  env.swipe(-100);
  assert.deepEqual(env.jumps, []);
});

test('vertical scrolling, short drags, and cancelled gestures do not change tabs', () => {
  const env = swipeEnvironment();
  env.swipe(-30);
  env.swipe(-90, 200);
  env.swipe(-100, 0, false);
  assert.equal(env.current(), 'Dashboard');
  assert.deepEqual(env.jumps, []);
});

test('an unfocused page cannot navigate after opening Settings or About', () => {
  const env = swipeEnvironment();
  env.blur();
  env.swipe(-100);
  assert.deepEqual(env.jumps, []);
});

test('swipe recognizer reserves both native back-gesture edges', () => {
  const env = swipeEnvironment();
  assert.ok(env.config.hitSlop.left <= -32);
  assert.ok(env.config.hitSlop.right <= -32);
  assert.equal(env.config.maxPointers, 1);
  assert.deepEqual(policy.getTabSwipeEdgeInsets({ left: 59, right: 0 }), { left: 59, right: 32 });
});

test('RTL page swipes follow the displayed tab direction', () => {
  const state = { index: 0, routes: policy.MAIN_TABS.map((name) => ({ name })) };
  assert.equal(policy.getTabSwipeTarget(state, 100, 0, true), 'History');
  assert.equal(policy.getTabSwipeTarget(state, -100, 0, true), null);
});

test('system Back actions follow visited tabs after swipes and icon presses', () => {
  const env = swipeEnvironment();
  env.swipe(-100);
  env.tap('Analytics');
  env.back();
  assert.equal(env.current(), 'History');
  env.back();
  assert.equal(env.current(), 'Dashboard');
});

test('Back returns from About to Settings and then to the main tabs', () => {
  const router = StackRouter({ initialRouteName: 'MainTabs' });
  const options = { routeNames: ['MainTabs', 'Settings', 'About'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  for (const name of ['Settings', 'About']) state = router.getStateForAction(state, CommonActions.navigate(name), options);
  state = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(state.routes[state.index].name, 'Settings');
  state = router.getStateForAction(state, CommonActions.goBack(), options);
  assert.equal(state.routes[state.index].name, 'MainTabs');
});

test('tab controls retain their content space for gesture and three-button system bars', () => {
  for (const bottom of [0, 24, 48]) {
    const layout = policy.getTabBarLayout(bottom);
    assert.equal(layout.paddingBottom - bottom, 8);
    assert.equal(layout.height - bottom, 60);
  }
  assert.ok(policy.getTabBarLayout(48, 2).height > policy.getTabBarLayout(48, 1).height);
});

function findElement(element, type) {
  if (!React.isValidElement(element)) return null;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

function sheetEnvironment(bottom) {
  const load = createLoader({
    'react-native': { Modal: 'Modal', View: 'View', Text: 'Text', FlatList: 'FlatList', TouchableOpacity: 'TouchableOpacity',
      StyleSheet: { create: (styles) => styles, absoluteFill: {} } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom, left: 0, right: 0 }) },
    [path.join(root, 'src/theme')]: { useTheme: () => ({ colors: {}, shadows: {} }), Typography: { fontFamily: {}, fontSize: {} },
      Spacing: { sm: 8, md: 12, lg: 20, xl: 24, '2xl': 32 }, BorderRadius: {} },
    [path.join(root, 'src/components/ui/Button')]: { Button: 'Button' },
  });
  return load('src/components/ui/Sheet.tsx').Sheet;
}

test('station sheets keep Cancel above both Android navigation bar modes', () => {
  for (const bottom of [24, 48]) {
    const Sheet = sheetEnvironment(bottom);
    const tree = Sheet({ visible: true, title: 'Stations', onClose: () => {}, rows: [] });
    const sheetView = React.Children.toArray(tree.props.children.props.children).find((child) => child.type === 'View');
    const style = Object.assign({}, ...sheetView.props.style);
    assert.ok(style.paddingBottom >= bottom + 32);
  }
});

test('station picker handles duplicate station names and closes on system Back', () => {
  const Sheet = sheetEnvironment(24);
  let closes = 0;
  const tree = Sheet({ visible: true, title: 'Stations', onClose: () => { closes++; }, rows: [
    { id: 'one', title: 'Home', onPress: () => {} }, { id: 'two', title: 'Home', onPress: () => {} },
  ] });
  const list = findElement(tree, 'FlatList');
  const keys = list.props.data.map(list.props.keyExtractor);
  assert.equal(new Set(keys).size, 2);
  tree.props.onRequestClose();
  assert.equal(closes, 1);
});

test('Expo generates the predictive-back manifest flag for the installed Android configuration', () => {
  const config = require('../app.json').expo;
  const { setPredictiveBackGesture } = require('@expo/config-plugins/build/android/PredictiveBackGesture');
  const manifest = { manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] } };
  const generated = setPredictiveBackGesture(config, manifest);
  assert.equal(generated.manifest.application[0].$['android:enableOnBackInvokedCallback'], 'true');
});

test('completed outage cards open and close their previously unreachable details', () => {
  let expanded = false;
  class AnimatedValue { interpolate() { return 0; } }
  const row = { id: 'outage', startTime: 1000, endTime: 5000, startBatterySoc: 80, minBatterySoc: 70 };
  const load = createLoader({
    react: { ...React, useState: (initial) => [expanded, (next) => { expanded = typeof next === 'function' ? next(expanded) : next; }],
      useMemo: (fn) => fn(), useCallback: (fn) => fn, useRef: (value) => ({ current: value }), useEffect: () => {} },
    'react-native': { View: 'View', Text: 'Text', FlatList: 'FlatList', TouchableOpacity: 'TouchableOpacity',
      StyleSheet: { create: (styles) => styles }, Animated: { Value: AnimatedValue }, Easing: {} },
    '@react-navigation/native': { useFocusEffect: () => {} },
    'react-native-svg': { __esModule: true, default: 'Svg', Line: 'Line', Circle: 'Circle', Rect: 'Rect' },
    [path.join(root, 'src/components/TabSwipeRegion')]: { TabSwipeRegion: 'TabSwipeRegion' },
    [path.join(root, 'src/context/AppContext')]: { useApp: () => ({ outageHistory: [row], reloadHistory: () => {}, settings: {} }) },
    [path.join(root, 'src/theme')]: { useTheme: () => ({ colors: {} }), withAlpha: () => '',
      Typography: { fontFamily: {}, fontSize: {} }, Spacing: {}, PAGE_GUTTER: 24 },
    [path.join(root, 'src/components/ui')]: Object.fromEntries(['ScreenHeader', 'HeaderAction', 'Card', 'Badge', 'SectionHeader'].map((name) => [name, name])),
    [path.join(root, 'src/components/icons')]: Object.fromEntries(['TriangleAlert', 'CircleCheckBig', 'BatteryMedium', 'BatteryLow', 'Clock3', 'Timer', 'RefreshCcw', 'ChevronDown'].map((name) => [name, name])),
  });
  const screen = load('src/screens/HistoryScreen.tsx').HistoryScreen();
  const rowElement = findElement(screen, 'FlatList').props.renderItem({ item: row });
  const renderCard = () => rowElement.type.type(rowElement.props);
  let card = renderCard();
  assert.equal(findElement(card, 'TouchableOpacity').props.accessibilityState.expanded, false);
  findElement(card, 'TouchableOpacity').props.onPress();
  card = renderCard();
  assert.equal(findElement(card, 'TouchableOpacity').props.accessibilityState.expanded, true);
  findElement(card, 'TouchableOpacity').props.onPress();
  assert.equal(findElement(renderCard(), 'TouchableOpacity').props.accessibilityState.expanded, false);
});
