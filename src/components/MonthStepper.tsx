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
      <Pressable style={styles.roundButton} onPress={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={26} color={colors.muted} />
      </Pressable>
      <Text style={styles.monthText}>{formatMonthLabel(month)}</Text>
      <Pressable style={styles.roundButton} onPress={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={26} color={colors.muted} />
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
    gap: 12,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    flex: 1,
    textAlign: 'center',
    fontWeight: '900',
  },
});
