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
  selectedDate?: string;
  today?: string;
  onSelect: (date: string) => void;
};

export function CalendarGrid({ month, state, selectedDate, today: todayDate = TODAY, onSelect }: CalendarGridProps) {
  const days = getCalendarDays(month);
  const weeks = chunkWeeks(days);
  const [hoveredDay, setHoveredDay] = useState<{ date: string; label: string } | null>(null);

  return (
    <View style={styles.calendar} testID="calendar-grid">
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
              const today = date === todayDate;
              const selected = date === selectedDate;
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
                  accessibilityRole="button"
                  accessibilityLabel={createDayAccessibilityLabel({
                    date,
                    today,
                    selected,
                    employeeNames: employeesOnShift.map((employee) => employee.name),
                    dayOffLabel: dayOff?.label,
                    comment: dayNote?.comment,
                  })}
                  accessibilityHint="Открывает смены и комментарий этого дня"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.dayCell,
                    dayOff && styles.dayCellOff,
                    dayOff?.holiday && styles.dayCellHoliday,
                    selected && styles.dayCellSelected,
                    hoveredDay?.date === date && styles.dayCellTooltipOpen,
                    pressed && styles.dayCellPressed,
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
                    {dayNote ? <View style={styles.dayNoteDot} testID={`day-note-${day}`} /> : null}
                  </View>
                  {employeesOnShift.length > 0 ? (
                    <View style={styles.dayDots} testID={`day-employees-${day}`}>
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
                    <View
                      style={[
                        styles.dayTooltip,
                        dayIndex <= 1
                          ? styles.dayTooltipLeft
                          : dayIndex >= 5
                            ? styles.dayTooltipRight
                            : styles.dayTooltipCenter,
                      ]}
                      pointerEvents="none"
                      testID={`day-tooltip-${day}`}
                    >
                      <Text style={styles.dayTooltipText} numberOfLines={5}>
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
    gap: 10,
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
    gap: 6,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 3,
  },
  dayCell: {
    flex: 1,
    minWidth: 0,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
    paddingHorizontal: 2,
    paddingTop: 2,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayCellSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  dayCellPressed: {
    opacity: 0.72,
  },
  dayCellTooltipOpen: {
    overflow: 'visible',
    zIndex: 20,
  },
  dayNoteDot: {
    position: 'absolute',
    bottom: 1,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accentStrong,
  },
  dayCellEmpty: {
    backgroundColor: 'transparent',
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
    gap: 1,
  },
  dayTooltip: {
    position: 'absolute',
    bottom: 42,
    width: 180,
    zIndex: 30,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  dayTooltipLeft: {
    left: 0,
  },
  dayTooltipCenter: {
    left: '50%',
    transform: [{ translateX: -90 }],
  },
  dayTooltipRight: {
    right: 0,
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

function createDayAccessibilityLabel({
  date,
  today,
  selected,
  employeeNames,
  dayOffLabel,
  comment,
}: {
  date: string;
  today: boolean;
  selected: boolean;
  employeeNames: string[];
  dayOffLabel?: string;
  comment?: string;
}) {
  const [year, month, day] = date.split('-').map(Number);
  const dateLabel = new Date(year, month - 1, day).toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const parts = [
    dateLabel,
    today ? 'сегодня' : '',
    selected ? 'выбрано' : '',
    employeeNames.length ? `на смене: ${employeeNames.join(', ')}` : 'смен нет',
    dayOffLabel ?? '',
    comment ? `комментарий: ${comment}` : '',
  ].filter(Boolean);

  return parts.join('. ');
}
