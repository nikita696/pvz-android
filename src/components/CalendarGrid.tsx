import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  chunkWeeks,
  getCalendarDays,
  getDayOffInfo,
  getShiftEmployeesByDate,
  shortEmployeeName,
} from '../domain/calendar';
import { TODAY } from '../domain/seed';
import type { AppState } from '../domain/types';
import { appFont, colors } from '../ui/theme';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type CalendarGridProps = {
  month: string;
  selectedDate: string;
  state: AppState;
  onSelect: (date: string) => void;
};

export function CalendarGrid({ month, selectedDate, state, onSelect }: CalendarGridProps) {
  const days = getCalendarDays(month);
  const weeks = chunkWeeks(days);
  const [hoveredDayOff, setHoveredDayOff] = useState<{ date: string; label: string } | null>(null);

  return (
    <View style={styles.calendar}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((day, dayIndex) => (
          <Text key={day} style={[styles.weekday, dayIndex >= 5 && styles.weekdayWeekend]}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.weeks}>
        {weeks.map((week, weekIndex) => (
          <View key={`week-${weekIndex}`} style={styles.daysRow}>
            {week.map((day, dayIndex) => {
              if (!day) {
                return <View key={`empty-${weekIndex}-${dayIndex}`} style={styles.dayCell} />;
              }

              const date = `${month}-${String(day).padStart(2, '0')}`;
              const selected = selectedDate === date;
              const today = date === TODAY;
              const employeesOnShift = getShiftEmployeesByDate(state, date);
              const dayOff = getDayOffInfo(date);

              return (
                <Pressable
                  key={date}
                  style={[
                    styles.dayCell,
                    dayOff && styles.dayCellOff,
                    dayOff?.holiday && styles.dayCellHoliday,
                    employeesOnShift.length > 0 && styles.dayCellFilled,
                    employeesOnShift.length > 0 && { borderColor: employeesOnShift[0].color },
                    selected && styles.dayCellSelected,
                  ]}
                  onPress={() => onSelect(date)}
                  onHoverIn={() => {
                    if (dayOff) {
                      setHoveredDayOff({ date, label: dayOff.label });
                    }
                  }}
                  onHoverOut={() => setHoveredDayOff(null)}
                  testID={`day-${day}`}
                >
                  <View style={[styles.dayNumberBadge, today && styles.dayNumberBadgeToday]}>
                    <Text
                      style={[
                        styles.dayText,
                        selected && styles.dayTextSelected,
                        dayOff && styles.dayTextOff,
                        dayOff?.holiday && styles.dayTextHoliday,
                        today && styles.dayTextToday,
                      ]}
                    >
                      {day}
                    </Text>
                  </View>
                  {employeesOnShift.length > 0 ? (
                    <View style={styles.dayNames}>
                      {employeesOnShift.slice(0, 3).map((employee) => (
                        <Text
                          key={employee.id}
                          style={[styles.dayName, { color: employee.color }]}
                          numberOfLines={1}
                          ellipsizeMode="clip"
                        >
                          {shortEmployeeName(employee.name)}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {hoveredDayOff?.date === date ? (
                    <View style={styles.dayTooltip} pointerEvents="none">
                      <Text style={styles.dayTooltipText} numberOfLines={2}>
                        {hoveredDayOff.label}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: {
    gap: 8,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    fontFamily: appFont,
    flex: 1,
    color: colors.muted,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
  },
  weekdayWeekend: {
    color: colors.weekendText,
  },
  weeks: {
    gap: 6,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 9,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingHorizontal: 2,
    paddingTop: 5,
    position: 'relative',
  },
  dayCellOff: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
  },
  dayCellHoliday: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.border,
  },
  dayCellFilled: {
    borderWidth: 2,
    borderColor: colors.accentStrong,
    backgroundColor: '#ffffff',
  },
  dayCellSelected: {
    borderWidth: 2,
    borderColor: colors.accentWarm,
  },
  dayNumberBadge: {
    minWidth: 22,
    minHeight: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumberBadgeToday: {
    backgroundColor: colors.accentText,
  },
  dayText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: colors.text,
  },
  dayTextOff: {
    color: colors.weekendText,
  },
  dayTextHoliday: {
    color: colors.holidayText,
  },
  dayTextToday: {
    color: '#ffffff',
  },
  dayNames: {
    width: '100%',
    maxHeight: 32,
    alignItems: 'center',
    overflow: 'hidden',
    gap: 0,
  },
  dayName: {
    fontFamily: appFont,
    fontSize: 10,
    lineHeight: 11,
    fontWeight: '900',
    maxWidth: '100%',
    textAlign: 'center',
  },
  dayTooltip: {
    position: 'absolute',
    left: -22,
    right: -22,
    bottom: 42,
    zIndex: 20,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  dayTooltipText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    fontWeight: '700',
  },
});
