import {
  Check,
  CircleCheck,
  Download,
  FileText,
  LockKeyhole,
  LogOut,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Share2,
  Upload,
} from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { EMPLOYEE_COLOR_PALETTE, type Employee } from '../domain/types';
import { appFont, colors } from '../ui/theme';
import { Dialog, EmptyState, Notice } from './primitives';
import { EmployeeAvatar } from './EmployeeAvatar';

export type SettingsBackupItem = {
  id: string;
  title: string;
  detail?: string;
  automatic?: boolean;
  restoreDisabled?: boolean;
};

type SettingsDialogProps = {
  visible: boolean;
  employees: Employee[];
  busy: boolean;
  message: string;
  error: string;
  backupStatus?: string;
  backupItems?: readonly SettingsBackupItem[];
  restoringBackupId?: string | null;
  appVersion?: string;
  updateStatus?: string;
  updateAvailable?: boolean;
  checkingForUpdate?: boolean;
  disconnectLabel?: string;
  onClose: () => void;
  onColorChange: (employeeId: string, color: string) => void;
  onExport: () => void;
  onImport: () => void;
  onShareSchedule?: () => void;
  onShareSummary?: () => void;
  onRestoreBackup?: (backupId: string) => void;
  onEditEmployee?: (employeeId: string) => void;
  onRestoreEmployee?: (employeeId: string) => void;
  onCheckForUpdate?: () => void;
  onApplyUpdate?: () => void;
  onDisconnect?: () => void;
};

const COLOR_NAMES: Record<string, string> = {
  '#7c3aed': 'Фиолетовый',
  '#0e7490': 'Бирюзовый',
  '#b45309': 'Янтарный',
  '#2563eb': 'Синий',
  '#dc2626': 'Красный',
  '#db2777': 'Розовый',
  '#65a30d': 'Зелёный',
};

export function SettingsDialog({
  visible,
  employees,
  busy,
  message,
  error,
  backupStatus,
  backupItems,
  restoringBackupId,
  appVersion,
  updateStatus,
  updateAvailable = false,
  checkingForUpdate = false,
  disconnectLabel = 'Отключить ПВЗ на этом устройстве',
  onClose,
  onColorChange,
  onExport,
  onImport,
  onShareSchedule,
  onShareSummary,
  onRestoreBackup,
  onEditEmployee,
  onRestoreEmployee,
  onCheckForUpdate,
  onApplyUpdate,
  onDisconnect,
}: SettingsDialogProps) {
  const showAppSection = Boolean(
    appVersion || updateStatus || onCheckForUpdate || (updateAvailable && onApplyUpdate),
  );

  return (
    <Dialog visible={visible} title="Настройки" closeLabel="Закрыть" onClose={onClose}>
      <View style={styles.content}>
        {error ? <Notice text={error} /> : null}
        {message ? (
          <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.successNotice}>
            <Text style={styles.successText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>Цвета сотрудников</Text>
            <Text style={styles.sectionHint}>Цвет сохраняется и виден на всех устройствах этого ПВЗ.</Text>
          </View>

          {employees.length ? (
            <View style={styles.employeeList}>
              {employees.map((employee) => (
                <View key={employee.id} style={styles.employeeRow}>
                  <View style={styles.employeeHeader}>
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
                    <View style={styles.employeeActions}>
                      {onEditEmployee ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Изменить сотрудника ${employee.name}`}
                          disabled={busy}
                          style={({ pressed }) => [
                            styles.iconButton,
                            pressed && styles.buttonPressed,
                            busy && styles.disabled,
                          ]}
                          onPress={() => onEditEmployee(employee.id)}
                          testID={`edit-employee-${employee.id}`}
                        >
                          <PencilLine accessible={false} size={17} color={colors.text} />
                        </Pressable>
                      ) : null}
                      {!employee.active && onRestoreEmployee ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Вернуть сотрудника ${employee.name} из архива`}
                          disabled={busy}
                          style={({ pressed }) => [
                            styles.restoreEmployeeButton,
                            pressed && styles.buttonPressed,
                            busy && styles.disabled,
                          ]}
                          onPress={() => onRestoreEmployee(employee.id)}
                          testID={`restore-employee-${employee.id}`}
                        >
                          <RotateCcw accessible={false} size={15} color={colors.accentStrong} />
                          <Text style={styles.restoreEmployeeButtonText}>Вернуть</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.palette}>
                    {EMPLOYEE_COLOR_PALETTE.map((color) => {
                      const normalizedColor = color.toLowerCase();
                      const selected = employee.color.toLowerCase() === normalizedColor;
                      const occupiedBy = employees.find(
                        (candidate) =>
                          candidate.id !== employee.id && candidate.color.toLowerCase() === normalizedColor,
                      );
                      const occupied = Boolean(occupiedBy);
                      const disabled = busy || occupied;
                      const colorName = COLOR_NAMES[normalizedColor] ?? 'Цвет';

                      return (
                        <Pressable
                          key={color}
                          accessibilityRole="button"
                          accessibilityLabel={
                            occupiedBy
                              ? `${colorName}, занят сотрудником ${occupiedBy.name}`
                              : `${colorName} для сотрудника ${employee.name}`
                          }
                          accessibilityState={{ selected, disabled }}
                          disabled={disabled}
                          style={({ pressed }) => [
                            styles.colorButton,
                            pressed && !disabled && styles.colorButtonPressed,
                            disabled && styles.colorButtonDisabled,
                          ]}
                          onPress={() => onColorChange(employee.id, color)}
                          testID={`employee-color-${employee.id}-${color}`}
                        >
                          <View
                            style={[
                              styles.colorSwatch,
                              { backgroundColor: color },
                              selected && styles.colorSwatchSelected,
                            ]}
                          >
                            {occupied ? (
                              <LockKeyhole accessible={false} size={13} color="#FFFFFF" />
                            ) : selected ? (
                              <Check accessible={false} size={15} strokeWidth={3} color="#FFFFFF" />
                            ) : null}
                          </View>
                        </Pressable>
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

        {onShareSchedule || onShareSummary ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleGroup}>
              <Text style={styles.sectionTitle}>Поделиться</Text>
              <Text style={styles.sectionHint}>Короткий текст удобно отправить в рабочий чат.</Text>
            </View>
            {onShareSchedule ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={({ pressed }) => [
                  styles.backupButton,
                  pressed && styles.buttonPressed,
                  busy && styles.disabled,
                ]}
                onPress={onShareSchedule}
                testID="share-schedule"
              >
                <Share2 accessible={false} size={18} color={colors.text} />
                <Text style={styles.backupButtonText}>Поделиться графиком</Text>
              </Pressable>
            ) : null}
            {onShareSummary ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                style={({ pressed }) => [
                  styles.backupButton,
                  pressed && styles.buttonPressed,
                  busy && styles.disabled,
                ]}
                onPress={onShareSummary}
                testID="share-month-summary"
              >
                <FileText accessible={false} size={18} color={colors.text} />
                <Text style={styles.backupButtonText}>Сводка месяца</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionTitleGroup}>
            <Text style={styles.sectionTitle}>Резервная копия</Text>
            <Text style={styles.sectionHint}>
              Экспорт сохраняет сотрудников, смены, выплаты и комментарии в JSON-файл на устройстве.
            </Text>
          </View>

          {backupStatus ? (
            <View accessibilityLiveRegion="polite" style={styles.backupStatus}>
              <CircleCheck accessible={false} size={17} color={colors.accentStrong} />
              <Text style={styles.backupStatusText}>{backupStatus}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Скачать резервную копию"
            disabled={busy}
            style={({ pressed }) => [
              styles.backupButton,
              pressed && styles.buttonPressed,
              busy && styles.disabled,
            ]}
            onPress={onExport}
            testID="export-backup"
          >
            <Download accessible={false} size={18} color={colors.text} />
            <Text style={styles.backupButtonText}>Скачать резервную копию</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Загрузить резервную копию с устройства"
            disabled={busy}
            style={({ pressed }) => [
              styles.backupButton,
              pressed && styles.buttonPressed,
              busy && styles.disabled,
            ]}
            onPress={onImport}
            testID="import-backup"
          >
            <Upload accessible={false} size={18} color={colors.text} />
            <Text style={styles.backupButtonText}>Загрузить резервную копию</Text>
          </Pressable>
          <Text style={styles.restoreHint}>
            Перед восстановлением приложение покажет состав файла. Текущие данные будут сохранены как страховочная копия.
          </Text>

          {backupItems ? (
            <View style={styles.serverBackups}>
              <Text style={styles.subsectionTitle}>Доступные копии</Text>
              {backupItems.length ? (
                <View style={styles.backupList}>
                  {backupItems.map((item) => {
                    const restoring = restoringBackupId === item.id;
                    const restoreDisabled = busy || restoring || Boolean(item.restoreDisabled);

                    return (
                      <View key={item.id} style={styles.backupRow}>
                        <View style={styles.backupInfo}>
                          <View style={styles.backupTitleRow}>
                            <Text style={styles.backupTitle}>{item.title}</Text>
                            {item.automatic ? <Text style={styles.automaticBadge}>Авто</Text> : null}
                          </View>
                          {item.detail ? <Text style={styles.backupDetail}>{item.detail}</Text> : null}
                        </View>
                        {onRestoreBackup ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Восстановить копию ${item.title}`}
                            disabled={restoreDisabled}
                            style={({ pressed }) => [
                              styles.restoreBackupButton,
                              pressed && styles.buttonPressed,
                              restoreDisabled && styles.disabled,
                            ]}
                            onPress={() => onRestoreBackup(item.id)}
                            testID={`restore-backup-${item.id}`}
                          >
                            {restoring ? (
                              <ActivityIndicator size="small" color={colors.accentStrong} />
                            ) : (
                              <RotateCcw accessible={false} size={15} color={colors.accentStrong} />
                            )}
                            <Text style={styles.restoreBackupButtonText}>
                              {restoring ? 'Жди…' : 'Восстановить'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyInline}>Серверных копий пока нет.</Text>
              )}
            </View>
          ) : null}
        </View>

        {showAppSection ? (
          <View style={styles.section}>
            <View style={styles.sectionTitleGroup}>
              <Text style={styles.sectionTitle}>Приложение</Text>
              {appVersion ? <Text style={styles.sectionHint}>Версия {appVersion}</Text> : null}
            </View>
            {updateStatus ? (
              <View accessibilityLiveRegion="polite" style={styles.updateStatus}>
                <Text style={styles.updateStatusText}>{updateStatus}</Text>
              </View>
            ) : null}
            {updateAvailable && onApplyUpdate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Установить обновление приложения"
                disabled={busy || checkingForUpdate}
                style={({ pressed }) => [
                  styles.updateButton,
                  pressed && styles.buttonPressed,
                  (busy || checkingForUpdate) && styles.disabled,
                ]}
                onPress={onApplyUpdate}
                testID="apply-app-update"
              >
                <RefreshCw accessible={false} size={17} color={colors.accentStrong} />
                <Text style={styles.updateButtonText}>Обновить приложение</Text>
              </Pressable>
            ) : onCheckForUpdate ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Проверить обновление приложения"
                disabled={busy || checkingForUpdate}
                style={({ pressed }) => [
                  styles.backupButton,
                  pressed && styles.buttonPressed,
                  (busy || checkingForUpdate) && styles.disabled,
                ]}
                onPress={onCheckForUpdate}
                testID="check-app-update"
              >
                {checkingForUpdate ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <RefreshCw accessible={false} size={17} color={colors.text} />
                )}
                <Text style={styles.backupButtonText}>
                  {checkingForUpdate ? 'Проверяю…' : 'Проверить обновление'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {onDisconnect ? (
          <View style={[styles.section, styles.disconnectSection]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={disconnectLabel}
              accessibilityHint="Общие данные ПВЗ не будут удалены"
              disabled={busy}
              style={({ pressed }) => [
                styles.disconnectButton,
                pressed && styles.disconnectButtonPressed,
                busy && styles.disabled,
              ]}
              onPress={onDisconnect}
              testID="disconnect-workspace"
            >
              <LogOut accessible={false} size={17} color={colors.dangerText} />
              <Text style={styles.disconnectButtonText}>{disconnectLabel}</Text>
            </Pressable>
            <Text style={styles.restoreHint}>Общие данные ПВЗ останутся на сервере.</Text>
          </View>
        ) : null}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
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
    fontWeight: '800',
  },
  subsectionTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  sectionHint: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
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
  employeeHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  employeeIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  employeeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    fontWeight: '800',
  },
  archivedLabel: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreEmployeeButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  restoreEmployeeButtonText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
  },
  palette: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorButtonPressed: {
    backgroundColor: colors.border,
  },
  colorButtonDisabled: {
    opacity: 0.48,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatchSelected: {
    borderColor: colors.text,
    borderWidth: 3,
  },
  backupStatus: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backupStatusText: {
    flex: 1,
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
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
    fontWeight: '800',
  },
  restoreHint: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  serverBackups: {
    paddingTop: 4,
    gap: 8,
  },
  backupList: {
    gap: 7,
  },
  backupRow: {
    minHeight: 60,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backupInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  backupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  backupTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  backupDetail: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
  },
  automaticBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    backgroundColor: colors.accentSoft,
    color: colors.accentStrong,
    fontFamily: appFont,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  restoreBackupButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 10,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  restoreBackupButtonText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 10,
    fontWeight: '800',
  },
  emptyInline: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  updateStatus: {
    borderRadius: 12,
    padding: 11,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  updateStatusText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  updateButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  updateButtonText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  disconnectSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
  },
  disconnectButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  disconnectButtonPressed: {
    opacity: 0.78,
  },
  disconnectButtonText: {
    fontFamily: appFont,
    color: colors.dangerText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
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
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.5,
  },
});
