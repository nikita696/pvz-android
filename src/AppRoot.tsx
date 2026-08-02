import { useNetworkState } from 'expo-network';
import { StatusBar } from 'expo-status-bar';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Cog,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  UserPlus,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiRequestError, claimInvite, fetchState, sendAction } from './api';
import { exportWorkspaceBackup, pickWorkspaceBackup } from './backupFile';
import { CalendarGrid } from './components/CalendarGrid';
import { EmployeeAvatar } from './components/EmployeeAvatar';
import { MonthStepper } from './components/MonthStepper';
import { SelectedDayPanel } from './components/SelectedDayPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { Dialog, EmptyState, Field, Notice } from './components/primitives';
import type { WorkspaceBackup } from './domain/backup';
import { getDayOffInfo } from './domain/calendar';
import {
  calculateSalary,
  calculateTotalDue,
  formatMoney,
  getDayNoteByDate,
  hasShift,
} from './domain/calculations';
import { CURRENT_MONTH, TODAY, emptyAppState } from './domain/seed';
import type { ApiAction, AppState, Employee, PaymentKind, SalaryPayment } from './domain/types';
import { clearSessionToken, getStoredSessionToken, saveSessionToken } from './sessionToken';
import { appFont, colors } from './ui/theme';

const MONTH_NAMES = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
const ONBOARDING_TEXT = {
  title: 'Подключите ПВЗ',
  subtitle: 'Введите код команды, чтобы открыть общий график смен и выплат.',
  codeLabel: 'Код команды',
  codePlaceholder: 'Введите код',
  codeHint: 'Код можно получить у руководителя ПВЗ.',
  claim: 'Подключиться',
  missingCode: 'Введите код команды.',
  connected: '\u041f\u0412\u0417 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d.',
  loading: '\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0430\u0435\u043c \u041f\u0412\u0417',
  saveFailed: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0442\u043e\u043a\u0435\u043d \u041f\u0412\u0417.',
};

type DialogName =
  | 'assign'
  | 'deleteEmployee'
  | 'deletePayment'
  | 'editPayment'
  | 'employeePayments'
  | 'employees'
  | 'dayNote'
  | 'location'
  | 'payment'
  | 'settings'
  | 'importBackup'
  | null;
type PaymentMonthGroup = {
  month: string;
  payments: SalaryPayment[];
  total: number;
};
type EmployeeUndoNotice =
  | {
      status: 'pending';
      token: string;
      employeeName: string;
      expiresAt: number;
    }
  | {
      status: 'restored';
      employeeName: string;
      expiresAt: number;
    };

const EMPLOYEE_UNDO_WINDOW_MS = 30_000;
const UNDO_SUCCESS_VISIBLE_MS = 3_500;

export default function AppRoot() {
  const networkState = useNetworkState();
  const [state, setState] = useState<AppState>(emptyAppState);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [locationName, setLocationName] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeToDeleteId, setEmployeeToDeleteId] = useState('');
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [historyEmployeeId, setHistoryEmployeeId] = useState('');
  const [expandedPaymentMonths, setExpandedPaymentMonths] = useState<Record<string, boolean>>({});
  const [paymentToEditId, setPaymentToEditId] = useState('');
  const [paymentToDeleteId, setPaymentToDeleteId] = useState('');
  const [dailyRate, setDailyRate] = useState('2500');
  const [paymentEmployeeId, setPaymentEmployeeId] = useState('');
  const [paymentKind, setPaymentKind] = useState<PaymentKind>('payment');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentComment, setPaymentComment] = useState('');
  const [paymentDateText, setPaymentDateText] = useState(formatDate(TODAY));
  const [paymentError, setPaymentError] = useState('');
  const [dayNoteText, setDayNoteText] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [selectedDayEmployeesOpen, setSelectedDayEmployeesOpen] = useState(false);
  const [expandedSelectedDayEmployees, setExpandedSelectedDayEmployees] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [pendingBackup, setPendingBackup] = useState<WorkspaceBackup | null>(null);
  const [employeeUndoNotice, setEmployeeUndoNotice] = useState<EmployeeUndoNotice | null>(null);
  const [employeeUndoSeconds, setEmployeeUndoSeconds] = useState(0);

  const activeEmployees = useMemo(
    () => state.employees.filter((employee) => employee.active),
    [state.employees],
  );
  const archivedEmployees = useMemo(
    () => state.employees.filter((employee) => !employee.active),
    [state.employees],
  );
  const selectedDayShifts = useMemo(
    () =>
      state.shifts.filter(
        (shift) =>
          shift.date === selectedDate &&
          activeEmployees.some((employee) => employee.id === shift.employeeId),
      ),
    [activeEmployees, state.shifts, selectedDate],
  );
  const selectedDayOff = useMemo(() => getDayOffInfo(selectedDate), [selectedDate]);
  const selectedDayNote = useMemo(() => getDayNoteByDate(state, selectedDate), [state, selectedDate]);
  const historyEmployee = useMemo(
    () => state.employees.find((employee) => employee.id === historyEmployeeId),
    [historyEmployeeId, state.employees],
  );
  const paymentToEdit = useMemo(
    () => state.payments.find((payment) => payment.id === paymentToEditId),
    [paymentToEditId, state.payments],
  );
  const paymentToDelete = useMemo(
    () => state.payments.find((payment) => payment.id === paymentToDeleteId),
    [paymentToDeleteId, state.payments],
  );
  const employeeToDelete = useMemo(
    () => state.employees.find((employee) => employee.id === employeeToDeleteId),
    [employeeToDeleteId, state.employees],
  );
  const employeeDeletionShiftCount = useMemo(
    () => state.shifts.filter((shift) => shift.employeeId === employeeToDeleteId).length,
    [employeeToDeleteId, state.shifts],
  );
  const employeeDeletionPaymentCount = useMemo(
    () => state.payments.filter((payment) => payment.employeeId === employeeToDeleteId).length,
    [employeeToDeleteId, state.payments],
  );
  const totalDue = useMemo(() => calculateTotalDue(state, selectedMonth), [state, selectedMonth]);
  const offline = networkState.isConnected === false || networkState.isInternetReachable === false;
  const syncLabel = offline
    ? 'Нет сети'
    : syncing
      ? 'Синхронизация…'
      : syncFailed
        ? 'Ошибка синхронизации'
        : 'Данные синхронизированы';
  const deleteConfirmationMatches = Boolean(
    employeeToDelete &&
    deleteConfirmationText.trim().toLocaleLowerCase('ru-RU') === employeeToDelete.name.trim().toLocaleLowerCase('ru-RU'),
  );

  useEffect(() => {
    void bootstrapSession();
  }, []);

  useEffect(() => {
    setSelectedDayEmployeesOpen(false);
    setExpandedSelectedDayEmployees({});
  }, [selectedDate]);

  useEffect(() => {
    if (!employeeUndoNotice) {
      setEmployeeUndoSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = employeeUndoNotice.expiresAt - Date.now();

      if (remainingMs <= 0) {
        setEmployeeUndoNotice(null);
        setEmployeeUndoSeconds(0);
        return;
      }

      if (employeeUndoNotice.status === 'pending') {
        setEmployeeUndoSeconds(Math.ceil(remainingMs / 1000));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 250);
    return () => clearInterval(interval);
  }, [employeeUndoNotice]);

  async function bootstrapSession() {
    setLoading(true);
    setSyncing(true);
    setError('');

    try {
      const storedToken = await getStoredSessionToken();

      if (!storedToken) {
        setSessionToken(null);
        setState(emptyAppState);
        setOnboarding(true);
        setSyncFailed(false);
        return;
      }

      setState(await fetchState(storedToken));
      setSessionToken(storedToken);
      setOnboarding(false);
      setSyncFailed(false);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        await clearSessionToken();
        setSessionToken(null);
        setState(emptyAppState);
        setOnboarding(true);
        return;
      }

      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить данные из Neon.');
      setSyncFailed(true);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  async function loadState() {
    if (!sessionToken) {
      setOnboarding(true);
      return;
    }

    setLoading(true);
    setSyncing(true);
    setError('');

    try {
      setState(await fetchState(sessionToken));
      setSyncFailed(false);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        await clearSessionToken();
        setSessionToken(null);
        setState(emptyAppState);
        setOnboarding(true);
        return;
      }

      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить данные из Neon.');
      setSyncFailed(true);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  async function mutate(action: ApiAction): Promise<boolean> {
    if (!sessionToken) {
      setOnboarding(true);
      return false;
    }

    setSaving(true);
    setSyncing(true);
    setError('');

    try {
      setState(await sendAction(sessionToken, action));
      setSyncFailed(false);
      return true;
    } catch (caught) {
      if (isUnauthorized(caught)) {
        await clearSessionToken();
        setSessionToken(null);
        setState(emptyAppState);
        setOnboarding(true);
        return false;
      }

      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить в Neon.');
      setSyncFailed(true);
      return false;
    } finally {
      setSaving(false);
      setSyncing(false);
    }
  }

  async function openWorkspace(token: string, nextState: AppState) {
    try {
      await saveSessionToken(token);
      setSessionToken(token);
      setState(nextState);
      setOnboarding(false);
      setInviteCode('');
      setError('');
    } catch {
      setError(ONBOARDING_TEXT.saveFailed);
    }
  }

  async function submitInviteCode() {
    const code = inviteCode.trim();

    if (!code) {
      setError(ONBOARDING_TEXT.missingCode);
      return;
    }

    setSaving(true);
    setSyncing(true);
    setError('');

    try {
      const payload = await claimInvite(code);
      await openWorkspace(payload.token, payload.state);
      setSyncFailed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : ONBOARDING_TEXT.missingCode);
      setSyncFailed(true);
    } finally {
      setSaving(false);
      setSyncing(false);
    }
  }

  async function addEmployee() {
    const normalizedRate = dailyRate.trim();
    const rate = Number(normalizedRate);

    if (!employeeName.trim() || !normalizedRate || !Number.isFinite(rate) || rate < 0) {
      setError('Укажи имя и ставку от 0 ₽ в день.');
      return;
    }

    const saved = await mutate({ action: 'addEmployee', name: employeeName.trim(), dailyRate: rate });
    if (!saved) {
      return;
    }

    setEmployeeName('');
    setDailyRate('2500');
    setDialog(null);
  }

  function openLocationDialog() {
    setLocationName(state.location.name);
    setDialog('location');
  }

  async function saveLocationName() {
    if (!locationName.trim()) {
      setError('Укажи название ПВЗ.');
      return;
    }

    const saved = await mutate({ action: 'updateLocation', name: locationName.trim() });
    if (!saved) {
      return;
    }

    setDialog(null);
  }

  async function addPayment() {
    const amount = Number(paymentAmount);
    const paidAt = parseDateInput(paymentDateText);

    if (!paymentEmployeeId) {
      setPaymentError('Выберите сотрудника.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentError('Укажите сумму выплаты.');
      return;
    }

    if (!paidAt) {
      setPaymentError('Укажите дату в формате ДД.ММ.ГГГГ.');
      return;
    }

    const saved = await mutate({
      action: 'addPayment',
      employeeId: paymentEmployeeId,
      amount,
      paidAt,
      kind: paymentKind,
      comment: paymentComment.trim(),
    });
    if (!saved) {
      return;
    }

    resetPaymentForm();
    setDialog(null);
  }

  function openPaymentDialog() {
    resetPaymentForm();
    setPaymentDateText(formatDate(selectedDate));
    setPaymentError('');
    setDialog('payment');
  }

  function openDayNoteDialog() {
    setDayNoteText(selectedDayNote);
    setDialog('dayNote');
  }

  async function saveDayNote() {
    const comment = dayNoteText.trim();

    if (comment.length > 160) {
      setError('Комментарий не длиннее 160 символов.');
      return;
    }

    const saved = await mutate({ action: 'saveDayNote', date: selectedDate, comment });
    if (!saved) {
      return;
    }

    setDialog(null);
  }

  function openEmployeePayments(employeeId: string) {
    setHistoryEmployeeId(employeeId);
    setExpandedPaymentMonths({});
    setDialog('employeePayments');
  }

  function togglePaymentMonth(month: string, defaultExpanded: boolean) {
    setExpandedPaymentMonths((current) => ({
      ...current,
      [month]: !(current[month] ?? defaultExpanded),
    }));
  }

  function toggleSelectedDayEmployee(employeeId: string) {
    setExpandedSelectedDayEmployees((current) => ({
      ...current,
      [employeeId]: !current[employeeId],
    }));
  }

  function openEditPayment(payment: SalaryPayment) {
    setPaymentToEditId(payment.id);
    setPaymentKind(payment.kind);
    setPaymentAmount(String(payment.amount));
    setPaymentComment(payment.comment);
    setPaymentDateText(formatDate(payment.paidAt));
    setDialog('editPayment');
  }

  function openDeletePayment(payment: SalaryPayment) {
    setPaymentToDeleteId(payment.id);
    setDialog('deletePayment');
  }

  async function updateSelectedPayment() {
    const amount = Number(paymentAmount);
    const paidAt = parseDateInput(paymentDateText);

    if (!paymentToEdit || !Number.isFinite(amount) || amount <= 0) {
      setError('Укажи сумму выплаты.');
      return;
    }

    if (!paidAt) {
      setError('Укажи дату в формате ДД.ММ.ГГГГ.');
      return;
    }

    const saved = await mutate({
      action: 'updatePayment',
      id: paymentToEdit.id,
      employeeId: paymentToEdit.employeeId,
      amount,
      paidAt,
      kind: paymentKind,
      comment: paymentComment.trim(),
    });
    if (!saved) {
      return;
    }

    resetPaymentForm();
    setDialog('employeePayments');
  }

  async function deleteSelectedPayment() {
    if (!paymentToDelete) {
      return;
    }

    const deleted = await mutate({
      action: 'deletePayment',
      id: paymentToDelete.id,
      employeeId: paymentToDelete.employeeId,
    });
    if (!deleted) {
      return;
    }

    setPaymentToDeleteId('');
    setDialog('employeePayments');
  }

  function resetPaymentForm() {
    setPaymentAmount('');
    setPaymentComment('');
    setPaymentEmployeeId('');
    setPaymentKind('payment');
    setPaymentDateText(formatDate(selectedDate));
    setPaymentToEditId('');
    setPaymentError('');
  }

  function openSettings() {
    setSettingsError('');
    setSettingsMessage('');
    setDialog('settings');
  }

  async function changeEmployeeColor(employeeId: string, color: string) {
    setSettingsError('');
    setSettingsMessage('');
    const saved = await mutate({ action: 'updateEmployeeColor', employeeId, color });

    if (!saved) {
      setSettingsError('Не удалось сохранить цвет сотрудника.');
    }
  }

  async function exportBackup() {
    setSettingsError('');
    setSettingsMessage('');
    setSaving(true);

    try {
      const fileName = await exportWorkspaceBackup(state);
      setSettingsMessage(`Резервная копия ${fileName} подготовлена.`);
    } catch (caught) {
      setSettingsError(caught instanceof Error ? caught.message : 'Не удалось сохранить резервную копию.');
    } finally {
      setSaving(false);
    }
  }

  async function selectBackupForImport() {
    setSettingsError('');
    setSettingsMessage('');

    try {
      const backup = await pickWorkspaceBackup();
      if (!backup) {
        return;
      }

      setPendingBackup(backup);
      setDialog('importBackup');
    } catch (caught) {
      setSettingsError(caught instanceof Error ? caught.message : 'Не удалось прочитать резервную копию.');
    }
  }

  async function importSelectedBackup() {
    if (!pendingBackup) {
      return;
    }

    const restored = await mutate({ action: 'importState', state: pendingBackup.state });
    if (!restored) {
      setSettingsError('Не удалось восстановить резервную копию. Текущие данные не изменены.');
      setDialog('settings');
      return;
    }

    setPendingBackup(null);
    setSettingsError('');
    setSettingsMessage('Резервная копия восстановлена. Предыдущее состояние сохранено в Neon.');
    setDialog('settings');
  }

  function openAssignment(date: string) {
    setSelectedDate(date);
    setDialog('assign');
  }

  async function toggleShiftAndClose(employeeId: string) {
    const saved = await mutate({ action: 'toggleShift', employeeId, date: selectedDate });
    if (saved) {
      setDialog(null);
    }
  }

  async function archiveEmployee(employeeId: string) {
    await mutate({ action: 'archiveEmployee', employeeId });
  }

  function openDeleteEmployeeDialog(employeeId: string) {
    setEmployeeToDeleteId(employeeId);
    setDeleteConfirmationText('');
    setDialog('deleteEmployee');
  }

  async function deleteArchivedEmployee() {
    if (!employeeToDelete || !deleteConfirmationMatches) {
      return;
    }

    const undoToken = createEmployeeUndoToken();
    const deleted = await mutate({
      action: 'deleteEmployee',
      employeeId: employeeToDelete.id,
      undoToken,
    });
    if (!deleted) {
      return;
    }

    setEmployeeUndoNotice({
      status: 'pending',
      token: undoToken,
      employeeName: employeeToDelete.name,
      expiresAt: Date.now() + EMPLOYEE_UNDO_WINDOW_MS,
    });
    setEmployeeToDeleteId('');
    setDeleteConfirmationText('');
    setDialog(null);
  }

  async function undoDeletedEmployee() {
    if (employeeUndoNotice?.status !== 'pending' || employeeUndoNotice.expiresAt <= Date.now()) {
      return;
    }

    const { employeeName, token } = employeeUndoNotice;
    const restored = await mutate({ action: 'restoreDeletedEmployee', undoToken: token });
    if (!restored) {
      return;
    }

    setEmployeeUndoNotice({
      status: 'restored',
      employeeName,
      expiresAt: Date.now() + UNDO_SUCCESS_VISIBLE_MS,
    });
  }

  const selectedDateLabel = formatDate(selectedDate);

  if (onboarding) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.onboardingContent}>
          <View style={styles.onboardingPanel}>
            <View style={styles.onboardingHeader}>
              <Text style={styles.onboardingTitle}>{ONBOARDING_TEXT.title}</Text>
              <Text style={styles.onboardingSubtitle}>{ONBOARDING_TEXT.subtitle}</Text>
            </View>

            {error ? <Notice text={error} /> : null}

            <View style={styles.onboardingField}>
              <Text style={styles.fieldLabel}>{ONBOARDING_TEXT.codeLabel}</Text>
              <TextInput
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={ONBOARDING_TEXT.codePlaceholder}
                placeholderTextColor="#9CA3AF"
                style={styles.input}
                value={inviteCode}
                onChangeText={setInviteCode}
                testID="invite-code-input"
              />
              <Text style={styles.onboardingHint}>{ONBOARDING_TEXT.codeHint}</Text>
            </View>

            <Pressable
              disabled={saving}
              style={[styles.primaryButton, saving && styles.disabledButton]}
              onPress={() => void submitInviteCode()}
              testID="claim-invite-code"
            >
              <Text style={styles.primaryButtonText}>{ONBOARDING_TEXT.claim}</Text>
            </Pressable>

          </View>
        </ScrollView>

        {saving ? (
          <View style={styles.saving}>
            <ActivityIndicator color={colors.accentText} />
            <Text style={styles.savingText}>Сохраняю</Text>
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Изменить название ПВЗ"
              style={styles.locationButton}
              onPress={openLocationDialog}
              testID="open-location-editor"
            >
              <Text style={styles.locationName} numberOfLines={1} ellipsizeMode="tail">
                {state.location.name}
              </Text>
              <View style={styles.editBadge}>
                <PencilLine size={14} color={colors.accentText} />
              </View>
            </Pressable>
            <View
              style={[
                styles.syncStatus,
                offline && styles.syncStatusOffline,
                syncFailed && !offline && styles.syncStatusError,
              ]}
              testID="sync-status"
            >
              <View
                style={[
                  styles.syncDot,
                  offline && styles.syncDotOffline,
                  syncFailed && !offline && styles.syncDotError,
                ]}
              />
              <Text
                style={[
                  styles.syncStatusText,
                  offline && styles.syncStatusTextOffline,
                  syncFailed && !offline && styles.syncStatusTextError,
                ]}
              >
                {syncLabel}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сотрудники"
              style={styles.iconButton}
              onPress={() => setDialog('employees')}
              testID="open-employees"
            >
              <UserPlus size={21} color={colors.accentText} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Обновить данные"
              style={styles.iconButton}
              onPress={loadState}
              testID="refresh"
            >
              <RefreshCw size={20} color={colors.accentText} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Настройки"
              style={styles.iconButton}
              onPress={openSettings}
              testID="open-settings"
            >
              <Cog size={20} color={colors.accentText} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Загружаю данные из Neon</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {error ? <Notice text={error} /> : null}

            <View style={styles.calendarCard}>
              <View style={styles.cardHeader}>
                <MonthStepper
                  month={selectedMonth}
                  formatMonthLabel={formatMonthLabel}
                  shiftMonth={shiftMonth}
                  onChange={setSelectedMonth}
                />
              </View>
              <CalendarGrid
                month={selectedMonth}
                state={state}
                onSelect={openAssignment}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Зарплата</Text>
                  <Text style={styles.muted}>Отработано по сегодня × ставка − выплаты и штрафы</Text>
                </View>
                <Pressable
                  style={[styles.smallButton, styles.paymentButton]}
                  disabled={!activeEmployees.length}
                  onPress={openPaymentDialog}
                  testID="open-payment"
                >
                  <Plus size={19} color={colors.accentText} />
                  <Text style={[styles.smallButtonText, styles.paymentButtonText]}>Выплата</Text>
                </Pressable>
              </View>
              <View style={styles.totalCard}>
                <Text style={styles.muted}>Остаток к выплате</Text>
                <Text style={styles.totalMoney}>{formatMoney(totalDue)}</Text>
              </View>

              {activeEmployees.map((employee) => (
                <SalaryCard
                  key={employee.id}
                  state={state}
                  employee={employee}
                  month={selectedMonth}
                  onOpen={() => openEmployeePayments(employee.id)}
                />
              ))}
            </View>

            <SelectedDayPanel
              activeEmployees={activeEmployees}
              expandedEmployees={expandedSelectedDayEmployees}
              employeesOpen={selectedDayEmployeesOpen}
              selectedDate={selectedDate}
              selectedDateLabel={selectedDateLabel}
              selectedMonth={selectedMonth}
              shiftCount={selectedDayShifts.length}
              state={state}
              onToggleEmployee={toggleSelectedDayEmployee}
              onToggleEmployeesOpen={() => setSelectedDayEmployeesOpen((current) => !current)}
            />
          </ScrollView>
        )}

        {saving ? (
          <View style={styles.saving}>
            <ActivityIndicator color={colors.accentText} />
            <Text style={styles.savingText}>Сохраняю</Text>
          </View>
        ) : null}

        {employeeUndoNotice ? (
          <View style={styles.undoBanner} testID="employee-undo-banner">
            <View style={styles.undoTextContainer}>
              <Text style={styles.undoTitle}>
                {employeeUndoNotice.status === 'pending'
                  ? `${employeeUndoNotice.employeeName} удалён · ${employeeUndoSeconds} с`
                  : `${employeeUndoNotice.employeeName} возвращён`}
              </Text>
              <Text style={styles.undoBody}>
                {employeeUndoNotice.status === 'pending'
                  ? 'Смены и выплаты можно вернуть.'
                  : 'Сотрудник снова находится в архиве.'}
              </Text>
            </View>
            {employeeUndoNotice.status === 'pending' ? (
              <Pressable
                disabled={saving}
                style={[styles.undoButton, saving && styles.disabledButton]}
                onPress={() => void undoDeletedEmployee()}
                testID="undo-delete-employee"
              >
                <Text style={styles.undoButtonText}>Отменить</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Dialog
          visible={dialog === 'assign'}
          title={selectedDateLabel}
          closeTestID="close-assignment"
          onClose={() => setDialog(null)}
        >
          {selectedDayOff ? (
            <View style={styles.assignmentDayOffNote}>
              <Text style={styles.assignmentDayOffText}>{selectedDayOff.label}</Text>
            </View>
          ) : null}
          <Pressable style={styles.assignmentNoteButton} onPress={openDayNoteDialog} testID="open-day-note">
            <View style={styles.assignmentNoteText}>
              <Text style={styles.assignmentNoteTitle}>
                {selectedDayNote || 'Добавить комментарий'}
              </Text>
              <Text style={styles.assignmentNoteExamples}>замена · опоздание · прогул · больничный</Text>
            </View>
            <PencilLine size={15} color={colors.accentStrong} />
          </Pressable>
          <View style={styles.assignmentList}>
            {activeEmployees.length ? (
              activeEmployees.map((employee) => {
                const active = hasShift(state, employee.id, selectedDate);

                return (
                  <Pressable
                    key={employee.id}
                    style={[
                      styles.assignmentRow,
                      active && styles.assignmentRowActive,
                      active && { borderColor: employee.color },
                    ]}
                    onPress={() => void toggleShiftAndClose(employee.id)}
                    testID={`assign-employee-${employee.name}`}
                  >
                    <View style={styles.employeeTitleRow}>
                      <EmployeeAvatar name={employee.name} color={employee.color} />
                      <Text style={[styles.employeeName, { color: employee.color }]}>{employee.name}</Text>
                    </View>
                    <Text style={[styles.shiftStatus, active && { color: employee.color }]}>
                      {active ? 'На смене' : 'Добавить'}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.muted}>Сначала добавь сотрудника.</Text>
            )}
          </View>
        </Dialog>

        <Dialog visible={dialog === 'dayNote'} title="Комментарий ко дню" onClose={() => setDialog(null)}>
          <TextInput
            style={[styles.input, styles.dayNoteInput]}
            value={dayNoteText}
            onChangeText={setDayNoteText}
            placeholder="Например: замена, опоздание, прогул, больничный"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={160}
            testID="day-note-comment"
          />
          <Pressable style={styles.primaryButton} onPress={saveDayNote} testID="save-day-note">
            <Text style={styles.primaryButtonText}>Сохранить комментарий</Text>
          </Pressable>
        </Dialog>

        <Dialog visible={dialog === 'location'} title="Название ПВЗ" onClose={() => setDialog(null)}>
          <Field label="Название" value={locationName} onChangeText={setLocationName} testID="location-name" />
          <Pressable style={styles.primaryButton} onPress={saveLocationName} testID="save-location">
            <Text style={styles.primaryButtonText}>Сохранить</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'employees'}
          title="Сотрудники"
          closeTestID="close-employees"
          onClose={() => setDialog(null)}
        >
          <View style={styles.employeeManagerList}>
            {activeEmployees.length ? (
              activeEmployees.map((employee) => (
                <View key={employee.id} style={styles.employeeManagerRow}>
                  <View style={styles.employeeTitleRow}>
                    <EmployeeAvatar name={employee.name} color={employee.color} />
                    <View>
                      <Text style={[styles.employeeName, { color: employee.color }]}>{employee.name}</Text>
                      <Text style={styles.muted}>{formatMoney(employee.dailyRate)} в день</Text>
                    </View>
                  </View>
                  <Pressable
                    style={styles.archiveButton}
                    onPress={() => void archiveEmployee(employee.id)}
                    hitSlop={8}
                    testID={`archive-employee-${employee.name}`}
                  >
                    <Archive size={16} color={colors.accentText} />
                    <Text style={styles.archiveButtonText}>В архив</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>Пока никого нет.</Text>
            )}
          </View>
          {archivedEmployees.length ? (
            <View style={styles.archiveSection}>
              <Text style={styles.fieldLabel}>Архив</Text>
              {archivedEmployees.map((employee) => (
                <View key={employee.id} style={styles.employeeManagerRow}>
                  <View style={styles.employeeTitleRow}>
                    <EmployeeAvatar name={employee.name} color={employee.color} muted />
                    <View>
                      <Text style={styles.employeeName}>{employee.name}</Text>
                      <Text style={styles.muted}>Архивирован</Text>
                    </View>
                  </View>
                  <Pressable
                    style={styles.deleteTextButton}
                    onPress={() => openDeleteEmployeeDialog(employee.id)}
                    hitSlop={8}
                    testID={`delete-archived-employee-${employee.name}`}
                  >
                    <Trash2 size={16} color={colors.dangerText} />
                    <Text style={styles.deleteTextButtonText}>Удалить</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <Field label="Имя" value={employeeName} onChangeText={setEmployeeName} testID="employee-name" />
          <View style={styles.employeeRateField}>
            <Field
              label="Ставка в день, ₽"
              value={dailyRate}
              onChangeText={setDailyRate}
              keyboardType="numeric"
              testID="employee-rate"
            />
            <Text style={styles.employeeRateHint}>Для владельца ПВЗ можно указать 0 ₽.</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={addEmployee} testID="save-employee">
            <Text style={styles.primaryButtonText}>Добавить</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'deleteEmployee'}
          title="Удалить из базы?"
          onClose={() => {
            setEmployeeToDeleteId('');
            setDeleteConfirmationText('');
            setDialog('employees');
          }}
        >
          <Text style={styles.warningText}>
            Это удалит {employeeToDelete?.name ?? 'сотрудника'} из базы вместе со связанными данными.
          </Text>
          <View style={styles.deleteImpact}>
            <Text style={styles.deleteImpactText}>Смен: {employeeDeletionShiftCount}</Text>
            <Text style={styles.deleteImpactText}>Выплат и удержаний: {employeeDeletionPaymentCount}</Text>
          </View>
          <Field
            label={`Для подтверждения введи имя «${employeeToDelete?.name ?? ''}»`}
            value={deleteConfirmationText}
            onChangeText={setDeleteConfirmationText}
            testID="delete-employee-confirmation"
          />
          <Pressable
            disabled={!deleteConfirmationMatches || saving}
            style={[
              styles.dangerButton,
              (!deleteConfirmationMatches || saving) && styles.disabledButton,
            ]}
            onPress={() => void deleteArchivedEmployee()}
            testID="confirm-delete-employee"
          >
            <Text style={styles.dangerButtonText}>Удалить навсегда</Text>
          </Pressable>
        </Dialog>

        <Dialog visible={dialog === 'payment'} title="Выплата" onClose={() => setDialog(null)}>
          <Text style={styles.fieldLabel}>Сотрудник</Text>
          <View style={styles.chips}>
            {activeEmployees.map((employee) => (
              <Pressable
                key={employee.id}
                style={[
                  styles.chip,
                  { borderColor: employee.color },
                  paymentEmployeeId === employee.id && styles.chipActive,
                  paymentEmployeeId === employee.id && {
                    backgroundColor: employee.color,
                    borderColor: employee.color,
                  },
                ]}
                onPress={() => {
                  setPaymentEmployeeId(employee.id);
                  setPaymentError('');
                }}
                testID={`payment-employee-${employee.name}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: employee.color },
                    paymentEmployeeId === employee.id && styles.chipTextActive,
                  ]}
                >
                  {employee.name}
                </Text>
              </Pressable>
            ))}
          </View>
          {paymentError ? <Notice text={paymentError} /> : null}
          <View style={styles.paymentTypeRow}>
            <Pressable
              style={[styles.paymentTypeButton, paymentKind === 'payment' && styles.paymentTypeButtonActive]}
              onPress={() => setPaymentKind('payment')}
              testID="payment-kind-payment"
            >
              <Text
                style={[
                  styles.paymentTypeText,
                  paymentKind === 'payment' && styles.paymentTypeTextActive,
                ]}
              >
                Выплата
              </Text>
            </Pressable>
            <Pressable
              style={[styles.paymentTypeButton, paymentKind === 'deduction' && styles.paymentTypeButtonDanger]}
              onPress={() => setPaymentKind('deduction')}
              testID="payment-kind-deduction"
            >
              <Text
                style={[
                  styles.paymentTypeText,
                  paymentKind === 'deduction' && styles.paymentTypeTextDanger,
                ]}
              >
                Удержание
              </Text>
            </Pressable>
          </View>
          <Field
            label="Дата, ДД.ММ.ГГГГ"
            value={paymentDateText}
            onChangeText={setPaymentDateText}
            placeholder="26.05.2026"
            testID="payment-date"
          />
          <Field
            label="Сумма, ₽"
            value={paymentAmount}
            onChangeText={setPaymentAmount}
            keyboardType="numeric"
            testID="payment-amount"
          />
          <Field
            label="Комментарий"
            value={paymentComment}
            onChangeText={setPaymentComment}
            placeholder={paymentKind === 'deduction' ? 'штраф, удержание' : 'нал, СБП, аванс, зарплата'}
            maxLength={80}
            testID="payment-comment"
          />
          <Pressable style={styles.primaryButton} onPress={addPayment} testID="save-payment">
            <Text style={styles.primaryButtonText}>
              {paymentKind === 'deduction' ? 'Сохранить удержание' : 'Сохранить выплату'}
            </Text>
          </Pressable>
        </Dialog>

        <SettingsDialog
          visible={dialog === 'settings'}
          employees={state.employees}
          busy={saving}
          message={settingsMessage}
          error={settingsError}
          onClose={() => setDialog(null)}
          onColorChange={(employeeId, color) => void changeEmployeeColor(employeeId, color)}
          onExport={() => void exportBackup()}
          onImport={() => void selectBackupForImport()}
        />

        <Dialog
          visible={dialog === 'importBackup' && Boolean(pendingBackup)}
          title="Восстановить копию?"
          onClose={() => {
            setPendingBackup(null);
            setDialog('settings');
          }}
        >
          {pendingBackup ? (
            <View style={styles.importSummary}>
              <Text style={styles.warningText}>
                Текущие данные этого ПВЗ будут заменены. Перед заменой сервер автоматически сохранит их в Neon.
              </Text>
              <Text style={styles.importSummaryText}>
                Сотрудников: {pendingBackup.state.employees.length} · смен: {pendingBackup.state.shifts.length}
              </Text>
              <Text style={styles.importSummaryText}>
                Выплат: {pendingBackup.state.payments.length} · комментариев: {pendingBackup.state.dayNotes.length}
              </Text>
              <Text style={styles.importSummaryText}>
                Копия от {formatDateTime(pendingBackup.exportedAt)}
              </Text>
            </View>
          ) : null}
          <Pressable
            style={styles.dangerButton}
            disabled={saving}
            onPress={() => void importSelectedBackup()}
            testID="confirm-import-backup"
          >
            <Text style={styles.dangerButtonText}>Восстановить данные</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'employeePayments' && Boolean(historyEmployee)}
          title={historyEmployee ? `Выплаты: ${historyEmployee.name}` : 'Выплаты'}
          closeTestID="close-payment-history"
          onClose={() => {
            setHistoryEmployeeId('');
            setDialog(null);
          }}
        >
          {historyEmployee ? (
            <PaymentHistory
              state={state}
              employee={historyEmployee}
              expandedMonths={expandedPaymentMonths}
              onToggleMonth={togglePaymentMonth}
              onEditPayment={openEditPayment}
              onDeletePayment={openDeletePayment}
            />
          ) : null}
        </Dialog>

        <Dialog
          visible={dialog === 'editPayment' && Boolean(paymentToEdit)}
          title="Изменить запись"
          closeTestID="close-edit-payment"
          onClose={() => {
            resetPaymentForm();
            setDialog('employeePayments');
          }}
        >
          <View style={styles.paymentEditEmployee}>
            <Text style={styles.fieldLabel}>Сотрудник</Text>
            <Text style={styles.employeeName}>{historyEmployee?.name ?? 'Сотрудник'}</Text>
          </View>
          <View style={styles.paymentTypeRow}>
            <Pressable
              style={[styles.paymentTypeButton, paymentKind === 'payment' && styles.paymentTypeButtonActive]}
              onPress={() => setPaymentKind('payment')}
              testID="edit-payment-kind-payment"
            >
              <Text
                style={[
                  styles.paymentTypeText,
                  paymentKind === 'payment' && styles.paymentTypeTextActive,
                ]}
              >
                Выплата
              </Text>
            </Pressable>
            <Pressable
              style={[styles.paymentTypeButton, paymentKind === 'deduction' && styles.paymentTypeButtonDanger]}
              onPress={() => setPaymentKind('deduction')}
              testID="edit-payment-kind-deduction"
            >
              <Text
                style={[
                  styles.paymentTypeText,
                  paymentKind === 'deduction' && styles.paymentTypeTextDanger,
                ]}
              >
                Удержание
              </Text>
            </Pressable>
          </View>
          <Field
            label="Дата, ДД.ММ.ГГГГ"
            value={paymentDateText}
            onChangeText={setPaymentDateText}
            placeholder="26.05.2026"
            testID="edit-payment-date"
          />
          <Field
            label="Сумма, ₽"
            value={paymentAmount}
            onChangeText={setPaymentAmount}
            keyboardType="numeric"
            testID="edit-payment-amount"
          />
          <Field
            label="Комментарий"
            value={paymentComment}
            onChangeText={setPaymentComment}
            placeholder={paymentKind === 'deduction' ? 'штраф, удержание' : 'нал, СБП, аванс, зарплата'}
            maxLength={80}
            testID="edit-payment-comment"
          />
          <Pressable style={styles.primaryButton} onPress={updateSelectedPayment} testID="save-edit-payment">
            <Text style={styles.primaryButtonText}>Сохранить изменения</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'deletePayment' && Boolean(paymentToDelete)}
          title="Удалить запись?"
          closeTestID="close-delete-payment"
          onClose={() => {
            setPaymentToDeleteId('');
            setDialog('employeePayments');
          }}
        >
          <Text style={styles.warningText}>
            Это удалит только выбранную выплату или удержание. Смены и сотрудники останутся на месте.
          </Text>
          {paymentToDelete ? (
            <View style={styles.deletePaymentPreview}>
              <Text style={styles.historyDate}>{formatDate(paymentToDelete.paidAt)}</Text>
              <Text
                style={[
                  styles.historyAmount,
                  paymentToDelete.kind === 'deduction' && styles.historyAmountDeduction,
                ]}
              >
                {paymentToDelete.kind === 'deduction'
                  ? `− ${formatMoney(paymentToDelete.amount)}`
                  : formatMoney(paymentToDelete.amount)}
              </Text>
              {paymentToDelete.comment ? (
                <Text style={styles.historyComment}>{paymentToDelete.comment}</Text>
              ) : null}
            </View>
          ) : null}
          <Pressable style={styles.dangerButton} onPress={deleteSelectedPayment} testID="confirm-delete-payment">
            <Text style={styles.dangerButtonText}>Удалить запись</Text>
          </Pressable>
        </Dialog>
      </View>
    </SafeAreaView>
  );
}

function SalaryCard({
  state,
  employee,
  month,
  onOpen,
}: {
  state: AppState;
  employee: Employee;
  month: string;
  onOpen: () => void;
}) {
  const salary = calculateSalary(state, employee, month);

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.salaryCard,
        { borderLeftColor: employee.color },
        pressed && styles.salaryCardPressed,
      ]}
      onPress={onOpen}
      testID={`open-payment-history-${employee.name}`}
    >
      <View style={styles.salaryCardInfo}>
        <View style={styles.employeeTitleRow}>
          <EmployeeAvatar name={employee.name} color={employee.color} />
          <Text style={[styles.employeeName, { color: employee.color }]}>{employee.name}</Text>
        </View>
        <Text style={styles.muted}>
          {salary.workedShifts} смен × {formatMoney(salary.dailyRate)} − {formatMoney(salary.paidAndDeductions)}
        </Text>
        {salary.deductions > 0 ? (
          <Text style={styles.deductionLine}>Удержано {formatMoney(salary.deductions)}</Text>
        ) : null}
      </View>
      <View style={styles.salaryDue}>
        <Text style={styles.miniLabel}>К выплате</Text>
        <Text style={styles.dueMoney}>{formatMoney(salary.due)}</Text>
      </View>
    </Pressable>
  );
}

function PaymentHistory({
  state,
  employee,
  expandedMonths,
  onToggleMonth,
  onEditPayment,
  onDeletePayment,
}: {
  state: AppState;
  employee: Employee;
  expandedMonths: Record<string, boolean>;
  onToggleMonth: (month: string, defaultExpanded: boolean) => void;
  onEditPayment: (payment: SalaryPayment) => void;
  onDeletePayment: (payment: SalaryPayment) => void;
}) {
  const groups = getPaymentMonthGroups(state, employee.id);

  if (!groups.length) {
    return <EmptyState text="Выплат и удержаний пока нет." />;
  }

  return (
    <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyList}>
      {groups.map((group, index) => {
        const defaultExpanded = index === 0;
        const expanded = expandedMonths[group.month] ?? defaultExpanded;

        return (
          <View key={group.month} style={styles.historyMonth}>
            <Pressable
              style={styles.historyMonthHeader}
              onPress={() => onToggleMonth(group.month, defaultExpanded)}
              testID={`history-month-${group.month}`}
            >
              {expanded ? (
                <ChevronDown size={18} color={colors.text} />
              ) : (
                <ChevronRight size={18} color={colors.text} />
              )}
              <View style={styles.historyMonthTitle}>
                <Text style={styles.historyMonthName}>{formatHistoryMonthLabel(group.month)}</Text>
                <Text style={styles.muted}>
                  Записей: {group.payments.length} · Учтено: {formatMoney(group.total)}
                </Text>
              </View>
            </Pressable>

            {expanded ? (
              <View style={styles.historyTable}>
                <View style={styles.historyHead}>
                  <Text style={styles.historyHeadText}>Дата</Text>
                  <Text style={[styles.historyHeadText, styles.historyAmountCell]}>Сумма</Text>
                </View>
                {group.payments.map((payment) => (
                  <View key={payment.id} style={styles.historyRow}>
                    <View style={styles.historyMainCell}>
                      <Text style={styles.historyDate}>{formatDate(payment.paidAt)}</Text>
                      <Text
                        style={[
                          styles.historyKind,
                          payment.kind === 'deduction' && styles.historyKindDeduction,
                        ]}
                      >
                        {payment.kind === 'deduction' ? 'Удержание' : 'Выплата'}
                      </Text>
                      {payment.comment ? (
                        <Text style={styles.historyComment} numberOfLines={2}>
                          {payment.comment}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.historySideCell}>
                      <Text
                        style={[
                          styles.historyAmount,
                          payment.kind === 'deduction' && styles.historyAmountDeduction,
                        ]}
                      >
                        {payment.kind === 'deduction'
                          ? `− ${formatMoney(payment.amount)}`
                          : formatMoney(payment.amount)}
                      </Text>
                      <View style={styles.historyActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Изменить запись"
                          style={styles.historyIconButton}
                          onPress={() => onEditPayment(payment)}
                          testID={`edit-payment-${payment.id}`}
                        >
                          <PencilLine size={14} color={colors.text} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Удалить запись"
                          style={[styles.historyIconButton, styles.historyDeleteButton]}
                          onPress={() => onDeletePayment(payment)}
                          testID={`delete-payment-${payment.id}`}
                        >
                          <Trash2 size={14} color={colors.dangerText} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(year, monthNumber - 1 + offset, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const monthName = MONTH_NAMES[monthNumber - 1];
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year}`;
}

function formatHistoryMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const monthName = MONTH_NAMES[monthNumber - 1];
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year} г.`;
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}

function formatDateTime(timestamp: string): string {
  const value = new Date(timestamp);

  if (Number.isNaN(value.getTime())) {
    return 'дата не указана';
  }

  return value.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseDateInput(value: string): string | null {
  const text = value.trim();
  const ruMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);

  if (ruMatch) {
    const [, day, month, year] = ruMatch;
    return getValidIsoDate(Number(year), Number(month), Number(day));
  }

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return getValidIsoDate(Number(year), Number(month), Number(day));
  }

  return null;
}

function getValidIsoDate(year: number, month: number, day: number): string | null {
  const parsed = new Date(year, month - 1, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function createEmployeeUndoToken(): string {
  const randomPart = () => Math.random().toString(36).slice(2, 12);
  return `undo-${Date.now()}-${randomPart()}-${randomPart()}`;
}

function getPaymentMonthGroups(state: AppState, employeeId: string): PaymentMonthGroup[] {
  const groups = new Map<string, SalaryPayment[]>();

  state.payments
    .filter((payment) => payment.employeeId === employeeId)
    .sort((first, second) => second.paidAt.localeCompare(first.paidAt))
    .forEach((payment) => {
      const month = payment.paidAt.slice(0, 7);
      groups.set(month, [...(groups.get(month) ?? []), payment]);
    });

  return [...groups.entries()].map(([month, payments]) => ({
    month,
    payments,
    total: payments.reduce((sum, payment) => sum + payment.amount, 0),
  }));
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  shell: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 620,
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  syncStatus: {
    alignSelf: 'flex-start',
    minHeight: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  syncStatusOffline: {
    backgroundColor: colors.panelSoft,
    borderColor: colors.borderStrong,
  },
  syncStatusError: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentStrong,
  },
  syncDotOffline: {
    backgroundColor: colors.muted,
  },
  syncDotError: {
    backgroundColor: colors.dangerText,
  },
  syncStatusText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  syncStatusTextOffline: {
    color: colors.muted,
  },
  syncStatusTextError: {
    color: colors.dangerText,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  locationButton: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationName: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    flexShrink: 1,
  },
  editBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 30,
    gap: 16,
  },
  onboardingContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
  },
  onboardingPanel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    gap: 14,
  },
  onboardingHeader: {
    gap: 8,
  },
  onboardingTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  onboardingSubtitle: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  onboardingField: {
    gap: 7,
  },
  onboardingHint: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  employeeRateField: {
    gap: 4,
  },
  employeeRateHint: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  calendarCard: {
    borderRadius: 18,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
    shadowColor: '#111312',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  muted: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
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
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
  },
  smallButton: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 13,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    flexShrink: 0,
  },
  smallButtonText: {
    fontFamily: appFont,
    color: colors.accentText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  paymentButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  paymentButtonText: {
    fontSize: 13,
    fontWeight: '900',
  },
  employeeName: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  employeeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  assignmentList: {
    gap: 8,
  },
  assignmentDayOffNote: {
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: colors.weekendBg,
    borderWidth: 1,
    borderColor: colors.weekendBorder,
  },
  assignmentDayOffText: {
    fontFamily: appFont,
    color: colors.dangerText,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  assignmentNoteButton: {
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  assignmentNoteText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  assignmentNoteTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  assignmentNoteExamples: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  assignmentRow: {
    minHeight: 50,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  assignmentRowActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  employeeManagerList: {
    gap: 8,
  },
  archiveSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 8,
  },
  employeeManagerRow: {
    minHeight: 58,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  archiveButton: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  archiveButtonText: {
    fontFamily: appFont,
    color: colors.accentText,
    fontSize: 11,
    fontWeight: '900',
  },
  shiftStatus: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  deleteTextButton: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteTextButtonText: {
    fontFamily: appFont,
    color: colors.dangerText,
    fontSize: 11,
    fontWeight: '900',
  },
  warningText: {
    fontFamily: appFont,
    color: colors.dangerText,
    fontSize: 13,
    lineHeight: 18,
  },
  deleteImpact: {
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    gap: 4,
  },
  deleteImpactText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
  },
  dangerButton: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: {
    fontFamily: appFont,
    color: colors.dangerText,
    fontSize: 14,
    fontWeight: '900',
  },
  totalCard: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: colors.accentWarmSoft,
    borderWidth: 1,
    borderColor: colors.accentWarm,
    gap: 4,
  },
  totalMoney: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '900',
  },
  salaryCard: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#111312',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  salaryCardPressed: {
    opacity: 0.82,
  },
  salaryCardInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  salaryDue: {
    minWidth: 88,
    alignItems: 'flex-end',
    gap: 2,
  },
  deductionLine: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  miniLabel: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  dueMoney: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  saving: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 13,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savingText: {
    fontFamily: appFont,
    color: colors.accentText,
    fontSize: 12,
    fontWeight: '900',
  },
  undoBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 64,
    minHeight: 64,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    shadowColor: '#111312',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  undoTextContainer: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  undoTitle: {
    fontFamily: appFont,
    color: colors.panel,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
  },
  undoBody: {
    fontFamily: appFont,
    color: colors.borderStrong,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  undoButton: {
    minHeight: 38,
    borderRadius: 19,
    paddingHorizontal: 13,
    backgroundColor: colors.accentWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoButtonText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  fieldLabel: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    fontFamily: appFont,
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: 13,
    fontSize: 15,
    fontWeight: '700',
  },
  dayNoteInput: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
    textAlignVertical: 'top',
  },
  paymentEditEmployee: {
    gap: 4,
  },
  deletePaymentPreview: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  importSummary: {
    borderRadius: 12,
    padding: 13,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 5,
  },
  importSummaryText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  historyScroll: {
    maxHeight: 460,
  },
  historyList: {
    gap: 10,
  },
  historyMonth: {
    borderRadius: 8,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  historyMonthHeader: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyMonthTitle: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historyMonthName: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  historyTable: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.panel,
  },
  historyHead: {
    minHeight: 36,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyHeadText: {
    flex: 1,
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  historyRow: {
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyMainCell: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historySideCell: {
    minWidth: 102,
    alignItems: 'flex-end',
    gap: 8,
  },
  historyDate: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  historyKind: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '900',
  },
  historyKindDeduction: {
    color: colors.dangerText,
  },
  historyComment: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  historyAmountCell: {
    textAlign: 'right',
  },
  historyAmount: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'right',
  },
  historyAmountDeduction: {
    color: colors.text,
  },
  historyActions: {
    flexDirection: 'row',
    gap: 6,
  },
  historyIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDeleteButton: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: appFont,
    color: colors.accentText,
    fontSize: 14,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.58,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paymentTypeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentTypeButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  paymentTypeButtonDanger: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  paymentTypeText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  paymentTypeTextActive: {
    color: colors.accentText,
  },
  paymentTypeTextDanger: {
    color: colors.dangerText,
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  chipTextActive: {
    color: '#ffffff',
  },
});
