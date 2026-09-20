import { Archive, ChevronDown, ChevronRight, RefreshCw, Trash2 } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  getEmployeeFirstShiftDate,
  getEmployeeMonthShiftCounts,
  getEmployeeWorkedShiftCount,
  hasShift,
} from '../domain/calculations';
import type { AppState, Employee } from '../domain/types';
import { appFont, colors } from '../ui/theme';
import { EmptyState } from './primitives';
import { EmployeeAvatar } from './EmployeeAvatar';

type SelectedDayPanelProps = {
  activeEmployees: Employee[];
  archivedEmployees: Employee[];
  expandedEmployees: Record<string, boolean>;
  employeesOpen: boolean;
  selectedDate: string;
  selectedDateLabel: string;
  selectedMonth: string;
  shiftCount: number;
  state: AppState;
  onDeleteArchivedEmployee: (employeeId: string) => void;
  onRestoreArchivedEmployee: (employeeId: string) => void;
  onToggleEmployee: (employeeId: string) => void;
  onToggleEmployeesOpen: () => void;
};

export function SelectedDayPanel({
  activeEmployees,
  archivedEmployees,
  expandedEmployees,
  employeesOpen,
  selectedDate,
  selectedDateLabel,
  selectedMonth,
  shiftCount,
  state,
  onDeleteArchivedEmployee,
  onRestoreArchivedEmployee,
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
                const firstShiftDate = getEmployeeFirstShiftDate(state, employee.id);
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
                        <EmployeeAvatar name={employee.name} color={employee.color} size="medium" />
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
                          <View style={styles.selectedEmployeeStatLabelGroup}>
                            <Text style={styles.selectedEmployeeStatLabel}>Смен</Text>
                            <Text style={styles.selectedEmployeeStatSubLabel}>В этом месяце</Text>
                          </View>
                          <Text style={[styles.selectedEmployeeStatValue, { color: employee.color }]}>
                            {monthShiftCounts.worked} из {monthShiftCounts.total}
                          </Text>
                        </View>
                        <View style={styles.selectedEmployeeStat}>
                          <View style={styles.selectedEmployeeStatLabelGroup}>
                            <Text style={styles.selectedEmployeeStatLabel}>За всё время</Text>
                          </View>
                          <Text style={[styles.selectedEmployeeStatValue, { color: employee.color }]}>
                            {formatShiftCount(workedShiftCount)}
                          </Text>
                        </View>
                        <View style={styles.selectedEmployeeStat}>
                          <View style={styles.selectedEmployeeStatLabelGroup}>
                            <Text style={styles.selectedEmployeeStatLabel}>Трудоустройство</Text>
                          </View>
                          <Text style={[styles.selectedEmployeeStatValue, { color: employee.color }]}>
                            {firstShiftDate ? formatDate(firstShiftDate) : 'нет смен'}
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

        {archivedEmployees.length ? (
          <View style={styles.archiveManagement}>
            <View style={styles.archiveManagementHeader}>
              <View style={styles.archiveManagementTitleRow}>
                <Archive size={17} color={colors.muted} />
                <View style={styles.archiveManagementTitleText}>
                  <Text style={styles.archiveManagementTitle}>Архив</Text>
                  <Text style={styles.archiveManagementSubtitle}>
                    {archivedEmployees.length} {formatEmployeeCount(archivedEmployees.length)}
                  </Text>
                </View>
              </View>
              <Text style={styles.archiveManagementHint}>Редко используемое</Text>
            </View>

            <View style={styles.archiveManagementList}>
              {archivedEmployees.map((employee) => (
                <View key={employee.id} style={styles.archiveEmployeeRow}>
                  <View style={styles.archiveEmployeeInfo}>
                    <EmployeeAvatar name={employee.name} color={employee.color} muted />
                    <Text style={styles.archiveEmployeeName}>{employee.name}</Text>
                  </View>
                  <View style={styles.archiveEmployeeActions}>
                    <Pressable
                      style={styles.archiveRestoreButton}
                      onPress={() => onRestoreArchivedEmployee(employee.id)}
                      hitSlop={8}
                      testID={`restore-archived-employee-${employee.name}`}
                    >
                      <RefreshCw size={14} color={colors.accentText} />
                      <Text style={styles.archiveRestoreText}>Вернуть</Text>
                    </Pressable>
                    <Pressable
                      style={styles.archiveDeleteButton}
                      onPress={() => onDeleteArchivedEmployee(employee.id)}
                      hitSlop={8}
                      testID={`delete-archived-employee-${employee.name}`}
                    >
                      <Trash2 size={14} color={colors.dangerText} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>
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
  archiveManagement: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 2,
    padding: 12,
    gap: 10,
    backgroundColor: colors.panelSoft,
  },
  archiveManagementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  archiveManagementTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  archiveManagementTitleText: {
    gap: 1,
  },
  archiveManagementTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  archiveManagementSubtitle: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  archiveManagementHint: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  archiveManagementList: {
    gap: 6,
  },
  archiveEmployeeRow: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  archiveEmployeeInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  archiveEmployeeName: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  archiveEmployeeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  archiveRestoreButton: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  archiveRestoreText: {
    fontFamily: appFont,
    color: colors.accentText,
    fontSize: 10,
    fontWeight: '900',
  },
  archiveDeleteButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 14,
    gap: 10,
  },
  selectedEmployeeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  selectedEmployeeStatLabelGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 5,
  },
  selectedEmployeeStatLabel: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  selectedEmployeeStatSubLabel: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  selectedEmployeeStatValue: {
    fontFamily: appFont,
    minWidth: 86,
    textAlign: 'right',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
});

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

function formatEmployeeCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'сотрудник';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'сотрудника';
  return 'сотрудников';
}

function formatShiftCount(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const noun = mod10 === 1 && mod100 !== 11 ? 'смена' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'смены' : 'смен';

  return `${count} ${noun}`;
}
