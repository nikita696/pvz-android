import { ChevronDown, ChevronRight, PencilLine } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getEmployeeMonthShiftCounts,
  getEmployeeWorkedShiftCount,
  hasShift,
} from '../domain/calculations';
import type { AppState, Employee } from '../domain/types';
import { appFont, colors } from '../ui/theme';
import { EmptyState } from './primitives';

type SelectedDayPanelProps = {
  activeEmployees: Employee[];
  expandedEmployees: Record<string, boolean>;
  employeesOpen: boolean;
  selectedDate: string;
  selectedDateLabel: string;
  selectedMonth: string;
  shiftCount: number;
  state: AppState;
  dayNote: string;
  onOpenDayNote: () => void;
  onToggleEmployee: (employeeId: string) => void;
  onToggleEmployeesOpen: () => void;
};

export function SelectedDayPanel({
  activeEmployees,
  expandedEmployees,
  employeesOpen,
  selectedDate,
  selectedDateLabel,
  selectedMonth,
  shiftCount,
  state,
  dayNote,
  onOpenDayNote,
  onToggleEmployee,
  onToggleEmployeesOpen,
}: SelectedDayPanelProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>{selectedDateLabel}</Text>
          <Text style={styles.muted}>
            {shiftCount ? `${shiftCount} смен(ы)` : 'Смен нет'}
          </Text>
        </View>
      </View>

      <Pressable style={styles.dayNoteCard} onPress={onOpenDayNote} testID="open-day-note">
        <Text style={[styles.dayNoteText, !dayNote && styles.dayNotePlaceholder]}>
          {dayNote || 'Добавить комментарий ко дню'}
        </Text>
        <PencilLine size={15} color={colors.accentStrong} />
      </Pressable>

      <View style={styles.selectedEmployeesPanel}>
        <Pressable
          accessibilityRole="button"
          style={styles.selectedEmployeesHeader}
          onPress={onToggleEmployeesOpen}
          testID="toggle-selected-day-employees"
        >
          <View style={styles.selectedEmployeesTitleRow}>
            {employeesOpen ? (
              <ChevronDown size={18} color={colors.accentText} />
            ) : (
              <ChevronRight size={18} color={colors.accentText} />
            )}
            <Text style={styles.selectedEmployeesTitle}>Сотрудники</Text>
          </View>
          <Text style={styles.selectedEmployeesCount}>{activeEmployees.length}</Text>
        </Pressable>

        {employeesOpen ? (
          activeEmployees.length ? (
            <View style={styles.selectedEmployeesList}>
              {activeEmployees.map((employee) => {
                const monthShiftCounts = getEmployeeMonthShiftCounts(state, employee.id, selectedMonth);
                const workedShiftCount = getEmployeeWorkedShiftCount(state, employee.id);
                const assigned = hasShift(state, employee.id, selectedDate);
                const expanded = Boolean(expandedEmployees[employee.id]);

                return (
                  <View
                    key={employee.id}
                    style={[styles.selectedEmployeeItem, { borderLeftColor: employee.color }]}
                  >
                    <Pressable
                      accessibilityRole="button"
                      style={styles.selectedEmployeeHeader}
                      onPress={() => onToggleEmployee(employee.id)}
                      testID={`toggle-selected-day-employee-${employee.name}`}
                    >
                      <View style={styles.employeeTitleRow}>
                        <View style={[styles.employeeDot, { backgroundColor: employee.color }]} />
                        <Text style={[styles.employeeName, { color: employee.color }]}>{employee.name}</Text>
                      </View>
                      <View style={styles.selectedEmployeeMeta}>
                        <Text
                          style={[
                            styles.selectedEmployeeStatus,
                            assigned ? styles.selectedEmployeeStatusActive : styles.selectedEmployeeStatusMuted,
                          ]}
                        >
                          {assigned ? 'на смене' : 'нет смены'}
                        </Text>
                        {expanded ? (
                          <ChevronDown size={16} color={colors.muted} />
                        ) : (
                          <ChevronRight size={16} color={colors.muted} />
                        )}
                      </View>
                    </Pressable>

                    {expanded ? (
                      <View style={styles.selectedEmployeeStats}>
                        <View style={styles.selectedEmployeeStat}>
                          <Text style={styles.selectedEmployeeStatLabel}>Все/отраб. в месяце</Text>
                          <Text style={[styles.selectedEmployeeStatValue, { color: employee.color }]}>
                            {monthShiftCounts.total}/{monthShiftCounts.worked}
                          </Text>
                        </View>
                        <View style={styles.selectedEmployeeStat}>
                          <Text style={styles.selectedEmployeeStatLabel}>Отработано дней всего</Text>
                          <Text style={[styles.selectedEmployeeStatValue, { color: employee.color }]}>
                            {workedShiftCount}
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <EmptyState text="Добавь сотрудников в отдельном окне, потом назначай смены здесь." />
          )
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
  },
  sectionHeader: {
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  sectionHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  muted: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  dayNoteCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dayNoteText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },
  dayNotePlaceholder: {
    color: colors.muted,
  },
  selectedEmployeesPanel: {
    borderRadius: 18,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#111312',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  selectedEmployeesHeader: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#EEF6F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedEmployeesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectedEmployeesTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  selectedEmployeesCount: {
    minWidth: 30,
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: colors.panel,
    color: colors.accentText,
    overflow: 'hidden',
    textAlign: 'center',
    fontFamily: appFont,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
  },
  selectedEmployeesList: {
    padding: 10,
    gap: 10,
  },
  selectedEmployeeItem: {
    borderRadius: 16,
    backgroundColor: '#F2FAF4',
    borderLeftWidth: 4,
    borderLeftColor: colors.accentStrong,
    overflow: 'hidden',
  },
  selectedEmployeeHeader: {
    minHeight: 76,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  employeeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  employeeDot: {
    width: 16,
    height: 16,
    borderRadius: 5,
  },
  employeeName: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  selectedEmployeeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 0,
  },
  selectedEmployeeStatus: {
    fontFamily: appFont,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  selectedEmployeeStatusActive: {
    color: colors.accentStrong,
  },
  selectedEmployeeStatusMuted: {
    color: colors.muted,
  },
  selectedEmployeeStats: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 9,
  },
  selectedEmployeeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedEmployeeStatLabel: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  selectedEmployeeStatValue: {
    fontFamily: appFont,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
});
