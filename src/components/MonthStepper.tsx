import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { appFont, colors } from '../ui/theme';

type MonthStepperProps = {
  month: string;
  formatMonthLabel: (month: string) => string;
  shiftMonth: (month: string, offset: number) => string;
  onChange: (month: string) => void;
};

export function MonthStepper({ month, formatMonthLabel, shiftMonth, onChange }: MonthStepperProps) {
  return (
    <View style={styles.monthStepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Предыдущий месяц"
        style={styles.roundButton}
        onPress={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft size={24} color={colors.muted} />
      </Pressable>
      <Text style={styles.monthText} numberOfLines={1}>
        {formatMonthLabel(month)}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Следующий месяц"
        style={styles.roundButton}
        onPress={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight size={24} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  monthStepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  roundButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
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
});
