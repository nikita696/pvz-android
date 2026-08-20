import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { appFont, colors } from '../ui/theme';

type MonthStepperProps = {
  month: string;
  formatMonthLabel: (month: string) => string;
  shiftMonth: (month: string, offset: number) => string;
  onChange: (month: string) => void;
  onToday?: () => void;
  showTodayAction?: boolean;
};

export function MonthStepper({
  month,
  formatMonthLabel,
  shiftMonth,
  onChange,
  onToday,
  showTodayAction,
}: MonthStepperProps) {
  const showToday = Boolean(onToday) && (showTodayAction ?? true);

  return (
    <View style={styles.monthStepper}>
      <View style={styles.navigationRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Предыдущий месяц"
          style={({ pressed }) => [styles.roundButton, pressed && styles.buttonPressed]}
          onPress={() => onChange(shiftMonth(month, -1))}
        >
          <ChevronLeft accessible={false} size={24} color={colors.muted} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.monthText} numberOfLines={1}>
          {formatMonthLabel(month)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Следующий месяц"
          style={({ pressed }) => [styles.roundButton, pressed && styles.buttonPressed]}
          onPress={() => onChange(shiftMonth(month, 1))}
        >
          <ChevronRight accessible={false} size={24} color={colors.muted} />
        </Pressable>
      </View>
      {showToday ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Вернуться к сегодняшней дате"
          style={({ pressed }) => [styles.todayButton, pressed && styles.todayButtonPressed]}
          onPress={onToday}
          testID="calendar-today"
        >
          <Text style={styles.todayButtonText}>Сегодня</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  monthStepper: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  navigationRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.panelSoft,
  },
  monthText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 26,
    lineHeight: 32,
    flex: 1,
    textAlign: 'center',
    fontWeight: '900',
  },
  todayButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButtonPressed: {
    backgroundColor: colors.accentSoft,
  },
  todayButtonText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
});
