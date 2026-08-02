import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  chunkWeeks,
  getCalendarDays,
  getDayOffInfo,
  getShiftEmployeesByDate,
} from '../domain/calendar';
import { TODAY } from '../domain/seed';
import type { AppState } from '../domain/types';
import { appFont, colors } from '../ui/theme';
import { EmployeeAvatar } from './EmployeeAvatar';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

type CalendarGridProps = {
  month: string;
  state: AppState;
  onSelect: (date: string) => void;
};

export function CalendarGrid({ month, state, onSelect }: CalendarGridProps) {
  const days = getCalendarDays(month);
  const weeks = chunkWeeks(days);
  const [hoveredDay, setHoveredDay] = useState<{ date: string; label: string } | null>(null);

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
                return <View key={`empty-${weekIndex}-${dayIndex}`} style={[styles.dayCell, styles.dayCellEmpty]} />;
              }

              const date = `${month}-${String(day).padStart(2, '0')}`;
              const today = date === TODAY;
              const employeesOnShift = getShiftEmployeesByDate(state, date);
              const dayOff = getDayOffInfo(date);
              const dayNote = state.dayNotes.find((note) => note.date === date && note.comment.trim());
              const tooltipParts = [
                employeesOnShift.length
                  ? `На смене: ${employeesOnShift.map((employee) => employee.name).join(', ')}`
                  : '',
                dayOff?.label ?? '',
                dayNote ? `Комментарий: ${dayNote.comment}` : '',
              ].filter(Boolean);

              return (
                <Pressable
                  key={date}
                  style={[
                    styles.dayCell,
                    dayOff && styles.dayCellOff,
                    dayOff?.holiday && styles.dayCellHoliday,
                  ]}
                  onPress={() => onSelect(date)}
                  onHoverIn={() => {
                    if (tooltipParts.length) {
                      setHoveredDay({ date, label: tooltipParts.join('\n') });
                    }
                  }}
                  onHoverOut={() => setHoveredDay(null)}
                  testID={`day-${day}`}
                >
                  <View
                    style={[
                      styles.dayNumberBadge,
                      today && styles.dayNumberBadgeToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        dayOff && styles.dayTextOff,
                        dayOff?.holiday && styles.dayTextHoliday,
                        today && styles.dayTextToday,
                      ]}
                    >
                      {day}
                    </Text>
                    {dayNote ? <View style={styles.dayNoteUnderline} testID={`day-note-${day}`} /> : null}
                  </View>
                  {employeesOnShift.length > 0 ? (
                    <View style={styles.dayDots}>
                      {employeesOnShift.slice(0, 3).map((employee) => (
                        <EmployeeAvatar
                          key={employee.id}
                          name={employee.name}
                          color={employee.color}
                          size="tiny"
                        />
                      ))}
                    </View>
                  ) : null}
                  {hoveredDay?.date === date ? (
                    <View style={styles.dayTooltip} pointerEvents="none">
                      <Text style={styles.dayTooltipText} numberOfLines={3}>
                        {hoveredDay.label}
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
    gap: 14,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    fontFamily: appFont,
    flex: 1,
    color: colors.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
  },
  weekdayWeekend: {
    color: colors.weekendText,
  },
  weeks: {
    gap: 12,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dayCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
    paddingHorizontal: 2,
    paddingTop: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  dayNoteUnderline: {
    position: 'absolute',
    bottom: 2,
    width: 15,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#dc2626',
  },
  dayCellEmpty: {
    backgroundColor: '#F0EFEC',
    opacity: 0.76,
  },
  dayCellOff: {
    backgroundColor: 'transparent',
  },
  dayCellHoliday: {
    backgroundColor: 'transparent',
  },
  dayNumberBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayNumberBadgeToday: {
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: 'transparent',
  },
  dayText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
  },
  dayTextOff: {
    color: colors.weekendText,
  },
  dayTextHoliday: {
    color: colors.holidayText,
  },
  dayTextToday: {
    color: colors.text,
  },
  dayDots: {
    width: '100%',
    minHeight: 16,
    alignItems: 'flex-start',
    justifyContent: 'center',
    flexDirection: 'row',
    overflow: 'hidden',
    gap: 4,
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
