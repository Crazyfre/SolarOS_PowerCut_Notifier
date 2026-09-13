// AppSwitch — themed Switch wrapper. One place for track/thumb colors so
// every toggle in Settings looks identical.

import React from 'react';
import { Switch } from 'react-native';
import { useTheme } from '../../theme';

interface AppSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function AppSwitch({ value, onValueChange, accessibilityLabel, testID }: AppSwitchProps) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      trackColor={{ false: colors.glassFill, true: colors.brand }}
      thumbColor={value ? colors.textInverse : colors.textDisabled}
      ios_backgroundColor={colors.glassFill}
    />
  );
}
