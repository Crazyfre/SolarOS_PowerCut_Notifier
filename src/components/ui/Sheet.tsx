// Sheet — bottom sheet for the station picker.
// surface3 background, top-corner radius, drag handle, scrim overlay.

import React from 'react';
import { Modal, View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useTheme, Typography, Spacing, BorderRadius } from '../../theme';
import { Button } from './Button';

export interface SheetRowProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  selected?: boolean;
  onPress: () => void;
}

function SheetRow({ title, subtitle, icon, selected, onPress }: SheetRowProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`Select ${title}`}
      accessibilityRole="button"
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.infoFill : 'transparent',
          borderColor: selected ? colors.infoBorder : colors.border,
        },
      ]}
    >
      {icon}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: colors.textPrimary }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
        ) : null}
      </View>
      {selected ? <View style={[styles.checkDot, { backgroundColor: colors.info }]} /> : null}
    </TouchableOpacity>
  );
}

interface SheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children?: React.ReactNode;
  rows?: SheetRowProps[];
}

export function Sheet({ visible, title, subtitle, onClose, children, rows }: SheetProps) {
  const { colors, shadows } = useTheme();

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.surface3, borderColor: colors.border },
            shadows.sheet as object,
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.borderStrong }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          ) : null}
          {rows ? (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.title}
              renderItem={({ item }) => <SheetRow {...item} />}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
              style={styles.list}
            />
          ) : (
            children
          )}
          <Button label="Cancel" onPress={onClose} variant="secondary" full style={{ marginTop: Spacing.lg }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: Spacing.xl,
    paddingBottom: Spacing['2xl'],
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: Spacing.lg,
  },
  title: {
    fontFamily: Typography.fontFamily.displayBold,
    fontSize: Typography.fontSize.xl,
  },
  subtitle: {
    fontFamily: Typography.fontFamily.regular,
    fontSize: Typography.fontSize.sm,
    marginTop: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    minHeight: 56,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: Typography.fontFamily.semiBold,
    fontSize: Typography.fontSize.base,
  },
  rowSubtitle: {
    fontFamily: Typography.fontFamily.mono,
    fontSize: Typography.fontSize.xs,
    marginTop: 2,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
