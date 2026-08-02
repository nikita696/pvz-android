import { Download, Upload } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EMPLOYEE_COLOR_PALETTE, type Employee } from '../domain/types';
import { appFont, colors } from '../ui/theme';
import { Dialog, EmptyState, Notice } from './primitives';
import { EmployeeAvatar } from './EmployeeAvatar';

type SettingsDialogProps = {
  visible: boolean;
  employees: Employee[];
  busy: boolean;
  message: string;
  error: string;
  onClose: () => void;
  onColorChange: (employeeId: string, color: string) => void;
  onExport: () => void;
  onImport: () => void;
};

export function SettingsDialog({
  visible,
  employees,
  busy,
  message,
  error,
  onClose,
  onColorChange,
  onExport,
  onImport,
}: SettingsDialogProps) {
  return (
    <Dialog visible={visible} title="Настройки" onClose={onClose}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {error ? <Notice text={error} /> : null}
        {message ? (
          <View style={styles.successNotice}>
            <Text style={styles.successText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>Цвета сотрудников</Text>
            <Text style={styles.sectionHint}>Цвет сохраняется в Neon и виден на всех устройствах этого ПВЗ.</Text>
          </View>

          {employees.length ? (
            <View style={styles.employeeList}>
              {employees.map((employee) => (
                <View key={employee.id} style={styles.employeeRow}>
                  <View style={styles.employeeIdentity}>
                    <EmployeeAvatar
                      name={employee.name}
                      color={employee.color}
                      size="medium"
                      muted={!employee.active}
                    />
                    <View style={styles.employeeText}>
                      <Text style={styles.employeeName} numberOfLines={1}>{employee.name}</Text>
                      {!employee.active ? <Text style={styles.archivedLabel}>В архиве</Text> : null}
                    </View>
                  </View>
                  <View style={styles.palette}>
                    {EMPLOYEE_COLOR_PALETTE.map((color) => {
                      const selected = employee.color.toLowerCase() === color.toLowerCase();

                      return (
                        <Pressable
                          key={color}
                          accessibilityRole="button"
                          accessibilityLabel={`Цвет ${color} для ${employee.name}`}
                          disabled={busy}
                          hitSlop={7}
                          style={[
                            styles.colorButton,
                            { backgroundColor: color },
                            selected && styles.colorButtonSelected,
                          ]}
                          onPress={() => onColorChange(employee.id, color)}
                          testID={`employee-color-${employee.id}-${color}`}
                        />
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState text="Добавь сотрудника, чтобы настроить его цвет." />
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>Резервная копия</Text>
            <Text style={styles.sectionHint}>
              Экспорт сохраняет сотрудников, смены, выплаты и комментарии в JSON-файл на устройстве.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={[styles.backupButton, busy && styles.disabled]}
            onPress={onExport}
            testID="export-backup"
          >
            <Download size={18} color={colors.text} />
            <Text style={styles.backupButtonText}>Скачать резервную копию</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            style={[styles.backupButton, busy && styles.disabled]}
            onPress={onImport}
            testID="import-backup"
          >
            <Upload size={18} color={colors.text} />
            <Text style={styles.backupButtonText}>Загрузить резервную копию</Text>
          </Pressable>
          <Text style={styles.restoreHint}>
            Перед восстановлением приложение покажет состав файла. Текущая база будет сохранена в Neon как страховочная копия.
          </Text>
        </View>
      </ScrollView>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 560,
  },
  content: {
    gap: 18,
    paddingBottom: 4,
  },
  section: {
    gap: 10,
  },
  sectionTitleGroup: {
    gap: 3,
  },
  sectionTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
  sectionHint: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  employeeList: {
    gap: 9,
  },
  employeeRow: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  employeeIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  employeeText: {
    flex: 1,
    minWidth: 0,
  },
  employeeName: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '900',
  },
  archivedLabel: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
  },
  palette: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  colorButton: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorButtonSelected: {
    borderColor: colors.text,
    borderWidth: 3,
  },
  backupButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  backupButtonText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  restoreHint: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  successNotice: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  successText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },
  disabled: {
    opacity: 0.55,
  },
});
