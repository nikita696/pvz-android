import { useNetworkState } from 'expo-network';
import { StatusBar } from 'expo-status-bar';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Cog,
  PencilLine,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState as NativeAppState,
  Platform,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ApiRequestError,
  checkAppVersion,
  claimInvite,
  fetchFreshStateForBackup,
  fetchState,
  sendAction,
} from './api';
import { exportWorkspaceBackup, pickWorkspaceBackup } from './backupFile';
import { CalendarGrid } from './components/CalendarGrid';
import { EmployeeAvatar } from './components/EmployeeAvatar';
import { MonthStepper } from './components/MonthStepper';
import { SelectedDayPanel } from './components/SelectedDayPanel';
import { SettingsDialog, type SettingsBackupItem } from './components/SettingsDialog';
import { Dialog, EmptyState, Field, Notice } from './components/primitives';
import type { WorkspaceBackup } from './domain/backup';
import { getDayOffInfo } from './domain/calendar';
import {
  calculateSalary,
  calculateTotalDue,
  formatMoney,
  getDayNoteByDate,
  getEmployeesWithBalance,
  hasShift,
} from './domain/calculations';
import { emptyAppState, getCurrentLocalDate } from './domain/seed';
import { isValidPaymentAmount } from './domain/paymentValidation';
import { createMonthScheduleText, createMonthSummaryText } from './domain/shareSummary';
import type {
  ApiAction,
  AppState,
  Employee,
  PaymentKind,
  SalaryPayment,
  WorkspaceBackupPreview,
  WorkspaceBackupSummary,
} from './domain/types';
import { clearSessionToken, getStoredSessionToken, saveSessionToken } from './sessionToken';
import { loadLastSuccessfulSnapshot } from './localSnapshot';
import { appFont, colors } from './ui/theme';
import { CURRENT_APP_VERSION, type AppVersionCheck } from './version';

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
  | 'archiveEmployee'
  | 'backupPreview'
  | 'deleteEmployee'
  | 'deletePayment'
  | 'disconnect'
  | 'editEmployee'
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
  paid: number;
  deductions: number;
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
type PaymentUndoNotice =
  | {
      status: 'pending';
      token: string;
      kind: PaymentKind;
      amount: number;
      expiresAt: number;
    }
  | {
      status: 'restored';
      kind: PaymentKind;
      amount: number;
      expiresAt: number;
    };

type ShiftUndoNotice =
  | {
      status: 'pending';
      employeeId: string;
      employeeName: string;
      date: string;
      expiresAt: number;
    }
  | {
      status: 'restored';
      employeeName: string;
      date: string;
      expiresAt: number;
    };

type ArchiveUndoNotice =
  | {
      status: 'pending';
      employeeId: string;
      employeeName: string;
      expiresAt: number;
    }
  | {
      status: 'restored';
      employeeName: string;
      expiresAt: number;
    };

const UNDO_WINDOW_MS = 30_000;
const UNDO_SUCCESS_VISIBLE_MS = 3_500;

export default function AppRoot() {
  const networkState = useNetworkState();
  const initialCurrentDate = useRef(getCurrentLocalDate()).current;
  const [state, setState] = useState<AppState>(emptyAppState);
  const [currentDate, setCurrentDate] = useState(initialCurrentDate);
  const [selectedMonth, setSelectedMonth] = useState(initialCurrentDate.month);
  const [selectedDate, setSelectedDate] = useState(initialCurrentDate.today);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [locationName, setLocationName] = useState('');
  const [locationError, setLocationError] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeError, setEmployeeError] = useState('');
  const [employeeToArchiveId, setEmployeeToArchiveId] = useState('');
  const [employeeToEditId, setEmployeeToEditId] = useState('');
  const [editEmployeeName, setEditEmployeeName] = useState('');
  const [editEmployeeRate, setEditEmployeeRate] = useState('');
  const [editEmployeeRateDate, setEditEmployeeRateDate] = useState('');
  const [editEmployeeError, setEditEmployeeError] = useState('');
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
  const [paymentDateText, setPaymentDateText] = useState(formatDate(initialCurrentDate.today));
  const [paymentError, setPaymentError] = useState('');
  const [dayNoteText, setDayNoteText] = useState('');
  const [dayNoteError, setDayNoteError] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [selectedDayEmployeesOpen, setSelectedDayEmployeesOpen] = useState(false);
  const [expandedSelectedDayEmployees, setExpandedSelectedDayEmployees] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [fatalLoadError, setFatalLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const refreshingRef = useRef(false);
  const pendingEmployeeCreateRef = useRef<{ fingerprint: string; id: string } | null>(null);
  const pendingPaymentCreateRef = useRef<{ fingerprint: string; id: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [versionCheck, setVersionCheck] = useState<AppVersionCheck | null>(null);
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<WorkspaceBackup | null>(null);
  const [employeeUndoNotice, setEmployeeUndoNotice] = useState<EmployeeUndoNotice | null>(null);
  const [employeeUndoSeconds, setEmployeeUndoSeconds] = useState(0);
  const [paymentUndoNotice, setPaymentUndoNotice] = useState<PaymentUndoNotice | null>(null);
  const [paymentUndoSeconds, setPaymentUndoSeconds] = useState(0);
  const [shiftUndoNotice, setShiftUndoNotice] = useState<ShiftUndoNotice | null>(null);
  const [shiftUndoSeconds, setShiftUndoSeconds] = useState(0);
  const [archiveUndoNotice, setArchiveUndoNotice] = useState<ArchiveUndoNotice | null>(null);
  const [archiveUndoSeconds, setArchiveUndoSeconds] = useState(0);
  const [backupPreview, setBackupPreview] = useState<WorkspaceBackupPreview | null>(null);
  const previousOfflineRef = useRef<boolean | null>(null);

  const activeEmployees = useMemo(
    () => state.employees.filter((employee) => employee.active),
    [state.employees],
  );
  const archivedEmployees = useMemo(
    () => state.employees.filter((employee) => !employee.active),
    [state.employees],
  );
  const visibleBalanceEmployees = useMemo(
    () => getEmployeesWithBalance(state, selectedMonth, currentDate.today),
    [currentDate.today, selectedMonth, state],
  );
  const archivedEmployeesWithBalance = useMemo(
    () => visibleBalanceEmployees.filter((employee) => !employee.active),
    [visibleBalanceEmployees],
  );
  const paymentEmployees = useMemo(
    () => state.employees.filter((employee) => employee.active || calculateSalary(
      state,
      employee,
      selectedMonth,
      currentDate.today,
    ).due !== 0),
    [currentDate.today, selectedMonth, state],
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
  const employeeToArchive = useMemo(
    () => state.employees.find((employee) => employee.id === employeeToArchiveId),
    [employeeToArchiveId, state.employees],
  );
  const employeeToEdit = useMemo(
    () => state.employees.find((employee) => employee.id === employeeToEditId),
    [employeeToEditId, state.employees],
  );
  const employeeDeletionShiftCount = useMemo(
    () => state.shifts.filter((shift) => shift.employeeId === employeeToDeleteId).length,
    [employeeToDeleteId, state.shifts],
  );
  const employeeDeletionPaymentCount = useMemo(
    () => state.payments.filter((payment) => payment.employeeId === employeeToDeleteId).length,
    [employeeToDeleteId, state.payments],
  );
  const totalDue = useMemo(
    () => calculateTotalDue(state, selectedMonth, currentDate.today),
    [currentDate.today, selectedMonth, state],
  );
  const offline = networkState.isConnected === false || networkState.isInternetReachable === false;
  const readOnly = offline || syncFailed;
  const syncLabel = offline
    ? lastSyncedAt
      ? `Нет сети · данные от ${formatSyncTime(lastSyncedAt)}`
      : 'Нет сети'
    : syncing
      ? 'Обновляю…'
      : syncFailed
        ? 'Не обновлено · нажми'
        : lastSyncedAt
          ? `Обновлено в ${formatSyncTime(lastSyncedAt)}`
          : 'Готово к синхронизации';
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

  useEffect(() => {
    if (!paymentUndoNotice) {
      setPaymentUndoSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = paymentUndoNotice.expiresAt - Date.now();

      if (remainingMs <= 0) {
        setPaymentUndoNotice(null);
        setPaymentUndoSeconds(0);
        return;
      }

      if (paymentUndoNotice.status === 'pending') {
        setPaymentUndoSeconds(Math.ceil(remainingMs / 1000));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 250);
    return () => clearInterval(interval);
  }, [paymentUndoNotice]);

  useEffect(() => {
    if (!shiftUndoNotice) {
      setShiftUndoSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = shiftUndoNotice.expiresAt - Date.now();

      if (remainingMs <= 0) {
        setShiftUndoNotice(null);
        setShiftUndoSeconds(0);
        return;
      }

      if (shiftUndoNotice.status === 'pending') {
        setShiftUndoSeconds(Math.ceil(remainingMs / 1000));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 250);
    return () => clearInterval(interval);
  }, [shiftUndoNotice]);

  useEffect(() => {
    if (!archiveUndoNotice) {
      setArchiveUndoSeconds(0);
      return;
    }

    const updateCountdown = () => {
      const remainingMs = archiveUndoNotice.expiresAt - Date.now();

      if (remainingMs <= 0) {
        setArchiveUndoNotice(null);
        setArchiveUndoSeconds(0);
        return;
      }

      if (archiveUndoNotice.status === 'pending') {
        setArchiveUndoSeconds(Math.ceil(remainingMs / 1000));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 250);
    return () => clearInterval(interval);
  }, [archiveUndoNotice]);

  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (nextStatus) => {
      if (nextStatus !== 'active') {
        return;
      }

      refreshToday();
      if (sessionToken && hasLoadedState && !offline) {
        void loadState(false);
      }
    });

    return () => subscription.remove();
  }, [currentDate, hasLoadedState, offline, selectedDate, selectedMonth, sessionToken]);

  useEffect(() => {
    const wasOffline = previousOfflineRef.current;
    previousOfflineRef.current = offline;

    if (wasOffline === true && !offline && sessionToken && hasLoadedState) {
      void loadState(false);
    }
  }, [hasLoadedState, offline, sessionToken]);

  async function bootstrapSession() {
    setLoading(true);
    setSyncing(true);
    setError('');
    setFatalLoadError('');

    try {
      const storedToken = await getStoredSessionToken();

      if (!storedToken) {
        setSessionToken(null);
        setState(emptyAppState);
        setHasLoadedState(false);
        setOnboarding(true);
        setSyncFailed(false);
        return;
      }

      setSessionToken(storedToken);
      setOnboarding(false);
      const nextState = await fetchState(storedToken);
      setState(nextState);
      setHasLoadedState(true);
      setLastSyncedAt(new Date());
      setOnboarding(false);
      setSyncFailed(false);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        await clearSessionToken();
        setSessionToken(null);
        setState(emptyAppState);
        setHasLoadedState(false);
        setOnboarding(true);
        return;
      }

      const message = caught instanceof Error ? caught.message : 'Не удалось загрузить данные.';

      try {
        const cached = await loadLastSuccessfulSnapshot();

        if (cached) {
          setState(cached.state);
          setHasLoadedState(true);
          setLastSyncedAt(new Date(cached.exportedAt));
          setError(`${message} Показана последняя локальная копия только для просмотра.`);
          setSyncFailed(true);
          return;
        }
      } catch {
        // The dedicated load error below is safer than rendering an empty app.
      }

      setFatalLoadError(`${message} В базе ничего не изменено.`);
      setSyncFailed(true);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  async function loadState(showLoading = false) {
    if (!sessionToken) {
      setOnboarding(true);
      return;
    }

    if (refreshingRef.current) {
      return;
    }

    refreshingRef.current = true;
    if (showLoading || !hasLoadedState) {
      setLoading(true);
    }
    setSyncing(true);
    setError('');
    setFatalLoadError('');

    try {
      const nextState = await fetchState(sessionToken);
      setState(nextState);
      setHasLoadedState(true);
      setLastSyncedAt(new Date());
      setSyncFailed(false);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        await clearSessionToken();
        setSessionToken(null);
        setState(emptyAppState);
        setHasLoadedState(false);
        setOnboarding(true);
        return;
      }

      const message = caught instanceof Error ? caught.message : 'Не удалось загрузить данные.';

      if (hasLoadedState) {
        setError(`${message} Показаны последние загруженные данные.`);
      } else {
        setFatalLoadError(`${message} В базе ничего не изменено.`);
      }
      setSyncFailed(true);
    } finally {
      setLoading(false);
      setSyncing(false);
      refreshingRef.current = false;
    }
  }

  async function mutate(action: ApiAction, setLocalError?: (message: string) => void): Promise<AppState | null> {
    if (!sessionToken) {
      setOnboarding(true);
      return null;
    }

    if (readOnly) {
      const message = offline
        ? 'Нет сети. Данные доступны для просмотра; изменения будут доступны после подключения.'
        : 'Сначала обнови данные, чтобы безопасно сохранить изменение.';

      if (setLocalError) {
        setLocalError(message);
      } else {
        setError(message);
      }
      return null;
    }

    if (savingRef.current) {
      return null;
    }

    savingRef.current = true;
    setSaving(true);
    setSyncing(true);
    setError('');
    setLocalError?.('');

    try {
      const nextState = await sendAction(sessionToken, action);
      setState(nextState);
      setHasLoadedState(true);
      setLastSyncedAt(new Date());
      setSyncFailed(false);
      return nextState;
    } catch (caught) {
      if (isUnauthorized(caught)) {
        await clearSessionToken();
        setSessionToken(null);
        setState(emptyAppState);
        setOnboarding(true);
        return null;
      }

      const message = caught instanceof Error ? caught.message : 'Не удалось сохранить в Neon.';

      if (setLocalError) {
        setLocalError(message);
      } else {
        setError(message);
      }
      setSyncFailed(
        !(caught instanceof ApiRequestError) || caught.status === 0 || caught.status >= 500,
      );
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSyncing(false);
    }
  }

  async function openWorkspace(token: string, nextState: AppState) {
    try {
      await saveSessionToken(token);
      setSessionToken(token);
      setState(nextState);
      setHasLoadedState(true);
      setLastSyncedAt(new Date());
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

    if (
      !employeeName.trim() ||
      employeeName.trim().length > 80 ||
      !normalizedRate ||
      !Number.isSafeInteger(rate) ||
      rate < 0 ||
      rate > 100_000_000
    ) {
      setEmployeeError('Укажи имя и ставку от 0 ₽ целыми рублями.');
      return;
    }

    const fingerprint = JSON.stringify([employeeName.trim(), rate]);
    if (pendingEmployeeCreateRef.current?.fingerprint !== fingerprint) {
      pendingEmployeeCreateRef.current = {
        fingerprint,
        id: createClientId('employee'),
      };
    }

    const saved = await mutate(
      {
        action: 'addEmployee',
        id: pendingEmployeeCreateRef.current.id,
        name: employeeName.trim(),
        dailyRate: rate,
      },
      setEmployeeError,
    );
    if (!saved) {
      return;
    }

    pendingEmployeeCreateRef.current = null;
    setEmployeeName('');
    setEmployeeError('');
    setDailyRate('2500');
    setDialog(null);
  }

  function openLocationDialog() {
    setLocationName(state.location.name);
    setLocationError('');
    setDialog('location');
  }

  async function saveLocationName() {
    if (!locationName.trim()) {
      setLocationError('Укажи название ПВЗ.');
      return;
    }

    const saved = await mutate(
      { action: 'updateLocation', name: locationName.trim() },
      setLocationError,
    );
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

    if (!isValidPaymentAmount(amount)) {
      setPaymentError('Укажите положительную сумму целыми рублями.');
      return;
    }

    if (!paidAt) {
      setPaymentError('Укажите дату в формате ДД.ММ.ГГГГ.');
      return;
    }

    const normalizedComment = paymentComment.trim();
    const fingerprint = JSON.stringify([
      paymentEmployeeId,
      amount,
      paidAt,
      paymentKind,
      normalizedComment,
    ]);
    if (pendingPaymentCreateRef.current?.fingerprint !== fingerprint) {
      pendingPaymentCreateRef.current = {
        fingerprint,
        id: createClientId('payment'),
      };
    }

    const saved = await mutate(
      {
        action: 'addPayment',
        id: pendingPaymentCreateRef.current.id,
        employeeId: paymentEmployeeId,
        amount,
        paidAt,
        kind: paymentKind,
        comment: normalizedComment,
      },
      setPaymentError,
    );
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
    setDayNoteError('');
    setDialog('dayNote');
  }

  async function saveDayNote() {
    const comment = dayNoteText.trim();

    if (comment.length > 160) {
      setDayNoteError('Комментарий не длиннее 160 символов.');
      return;
    }

    const saved = await mutate(
      { action: 'saveDayNote', date: selectedDate, comment },
      setDayNoteError,
    );
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
    setPaymentError('');
    setDialog('editPayment');
  }

  function openDeletePayment(payment: SalaryPayment) {
    setPaymentToDeleteId(payment.id);
    setPaymentError('');
    setDialog('deletePayment');
  }

  async function updateSelectedPayment() {
    const amount = Number(paymentAmount);
    const paidAt = parseDateInput(paymentDateText);

    if (!paymentToEdit || !isValidPaymentAmount(amount)) {
      setPaymentError('Укажи положительную сумму целыми рублями.');
      return;
    }

    if (!paidAt) {
      setPaymentError('Укажи существующую дату в формате ДД.ММ.ГГГГ.');
      return;
    }

    const saved = await mutate(
      {
        action: 'updatePayment',
        id: paymentToEdit.id,
        employeeId: paymentToEdit.employeeId,
        amount,
        paidAt,
        kind: paymentKind,
        comment: paymentComment.trim(),
        expectedUpdatedAt: paymentToEdit.updatedAt,
      },
      setPaymentError,
    );
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

    const deletedPayment = paymentToDelete;
    const undoToken = createUndoToken();
    const deleted = await mutate(
      {
        action: 'deletePayment',
        id: deletedPayment.id,
        employeeId: deletedPayment.employeeId,
        undoToken,
        expectedUpdatedAt: deletedPayment.updatedAt,
      },
      setPaymentError,
    );
    if (!deleted) {
      return;
    }

    setPaymentUndoNotice({
      status: 'pending',
      token: undoToken,
      kind: deletedPayment.kind,
      amount: deletedPayment.amount,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });
    setEmployeeUndoNotice(null);
    setPaymentToDeleteId('');
    setHistoryEmployeeId('');
    setDialog(null);
  }

  async function undoDeletedPayment() {
    if (paymentUndoNotice?.status !== 'pending' || paymentUndoNotice.expiresAt <= Date.now()) {
      return;
    }

    const { amount, kind, token } = paymentUndoNotice;
    const restored = await mutate({ action: 'restoreDeletedPayment', undoToken: token });
    if (!restored) {
      return;
    }

    setPaymentUndoNotice({
      status: 'restored',
      kind,
      amount,
      expiresAt: Date.now() + UNDO_SUCCESS_VISIBLE_MS,
    });
  }

  function resetPaymentForm() {
    pendingPaymentCreateRef.current = null;
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
    void refreshVersionStatus();
  }

  async function refreshVersionStatus() {
    if (checkingVersion) {
      return;
    }

    setCheckingVersion(true);

    try {
      setVersionCheck(await checkAppVersion());
    } catch {
      setVersionCheck(null);
    } finally {
      setCheckingVersion(false);
    }
  }

  function applyAvailableUpdate() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }

    setSettingsMessage(
      `Доступна версия ${versionCheck?.latestVersion ?? ''}. Установи новую APK поверх текущей — данные ПВЗ сохранятся.`,
    );
  }

  async function shareSchedule() {
    await shareText(
      `${state.location.name}: график`,
      createMonthScheduleText(state, selectedMonth),
      setSettingsMessage,
      setSettingsError,
    );
  }

  async function shareMonthSummary() {
    await shareText(
      `${state.location.name}: сводка`,
      createMonthSummaryText(state, selectedMonth, currentDate.today),
      setSettingsMessage,
      setSettingsError,
    );
  }

  function openDisconnectDialog() {
    setDialog('disconnect');
  }

  async function disconnectWorkspace() {
    const revoked = await mutate({ action: 'revokeCurrentSession' }, setSettingsError);

    if (!revoked) {
      setDialog('settings');
      return;
    }

    await clearSessionToken();
    setSessionToken(null);
    setState(emptyAppState);
    setHasLoadedState(false);
    setLastSyncedAt(null);
    setSyncFailed(false);
    setDialog(null);
    setOnboarding(true);
  }

  function refreshToday() {
    const next = getCurrentLocalDate();
    const previous = currentDate;

    setCurrentDate(next);

    if (selectedMonth === previous.month && selectedDate === previous.today) {
      setSelectedMonth(next.month);
      setSelectedDate(next.today);
    } else if (selectedMonth === previous.month && next.month !== previous.month) {
      setSelectedMonth(next.month);
    }
  }

  async function changeEmployeeColor(employeeId: string, color: string) {
    setSettingsError('');
    setSettingsMessage('');
    const saved = await mutate(
      { action: 'updateEmployeeColor', employeeId, color },
      setSettingsError,
    );

    if (!saved) {
      setSettingsError((current) => current || 'Не удалось сохранить цвет сотрудника.');
    }
  }

  async function exportBackup() {
    setSettingsError('');
    setSettingsMessage('');
    setSaving(true);

    try {
      if (!sessionToken) {
        throw new Error('Сначала подключи ПВЗ.');
      }

      const freshState = await fetchFreshStateForBackup(sessionToken);
      setState(freshState);
      setLastSyncedAt(new Date());
      setSyncFailed(false);
      const fileName = await exportWorkspaceBackup(freshState);
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
    setSettingsMessage('Резервная копия восстановлена. Предыдущее состояние сохранено как страховочная копия.');
    setDialog('settings');
  }

  async function previewServerBackup(backup: WorkspaceBackupSummary) {
    setSettingsError('');
    setSettingsMessage('');
    const loaded = await mutate(
      { action: 'previewBackup', backupId: backup.id },
      setSettingsError,
    );

    if (!loaded) {
      return;
    }

    if (!loaded.backupPreview) {
      setSettingsError('Не удалось подготовить предпросмотр этой копии.');
      return;
    }

    setBackupPreview(loaded.backupPreview);
    setDialog('backupPreview');
  }

  async function restoreServerBackup() {
    if (!backupPreview) {
      return;
    }

    const restored = await mutate(
      { action: 'restoreBackup', backupId: backupPreview.id },
      setSettingsError,
    );

    if (!restored) {
      setDialog('settings');
      return;
    }

    setBackupPreview(null);
    setSettingsMessage('Серверная копия восстановлена. Состояние до восстановления тоже сохранено.');
    setDialog('settings');
  }

  function openAssignment(date: string) {
    setSelectedDate(date);
    setDialog('assign');
  }

  function changeSelectedMonth(month: string) {
    setSelectedMonth(month);
    setSelectedDate(month === currentDate.month ? currentDate.today : `${month}-01`);
  }

  function goToToday() {
    setSelectedMonth(currentDate.month);
    setSelectedDate(currentDate.today);
  }

  async function setShiftAssignment(employee: Employee, assigned: boolean) {
    const saved = await mutate({
      action: 'setShift',
      employeeId: employee.id,
      date: selectedDate,
      assigned,
    });

    if (saved && !assigned) {
      setShiftUndoNotice({
        status: 'pending',
        employeeId: employee.id,
        employeeName: employee.name,
        date: selectedDate,
        expiresAt: Date.now() + UNDO_WINDOW_MS,
      });
      setEmployeeUndoNotice(null);
      setPaymentUndoNotice(null);
      setArchiveUndoNotice(null);
    }
  }

  async function undoRemovedShift() {
    if (shiftUndoNotice?.status !== 'pending' || shiftUndoNotice.expiresAt <= Date.now()) {
      return;
    }

    const notice = shiftUndoNotice;
    const restored = await mutate({
      action: 'setShift',
      employeeId: notice.employeeId,
      date: notice.date,
      assigned: true,
    });

    if (restored) {
      setShiftUndoNotice({
        status: 'restored',
        employeeName: notice.employeeName,
        date: notice.date,
        expiresAt: Date.now() + UNDO_SUCCESS_VISIBLE_MS,
      });
    }
  }

  function openArchiveEmployee(employeeId: string) {
    setEmployeeToArchiveId(employeeId);
    setDialog('archiveEmployee');
  }

  async function archiveEmployee() {
    if (!employeeToArchive) {
      return;
    }

    const employee = employeeToArchive;
    const archived = await mutate({ action: 'archiveEmployee', employeeId: employee.id });

    if (!archived) {
      return;
    }

    setArchiveUndoNotice({
      status: 'pending',
      employeeId: employee.id,
      employeeName: employee.name,
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });
    setEmployeeToArchiveId('');
    setDialog('employees');
  }

  async function restoreEmployee(employeeId: string) {
    await mutate({ action: 'restoreEmployee', employeeId }, setEmployeeError);
  }

  async function undoArchivedEmployee() {
    if (archiveUndoNotice?.status !== 'pending' || archiveUndoNotice.expiresAt <= Date.now()) {
      return;
    }

    const notice = archiveUndoNotice;
    const restored = await mutate({ action: 'restoreEmployee', employeeId: notice.employeeId });

    if (restored) {
      setArchiveUndoNotice({
        status: 'restored',
        employeeName: notice.employeeName,
        expiresAt: Date.now() + UNDO_SUCCESS_VISIBLE_MS,
      });
    }
  }

  function openEditEmployee(employee: Employee) {
    setEmployeeToEditId(employee.id);
    setEditEmployeeName(employee.name);
    setEditEmployeeRate(String(employee.dailyRate));
    setEditEmployeeRateDate(formatDate(currentDate.today));
    setEditEmployeeError('');
    setDialog('editEmployee');
  }

  async function saveEditedEmployee() {
    const rate = Number(editEmployeeRate);
    const effectiveDate = parseDateInput(editEmployeeRateDate);
    const name = editEmployeeName.trim();

    if (!employeeToEdit || !name || name.length > 80) {
      setEditEmployeeError('Укажи имя сотрудника.');
      return;
    }

    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 100_000_000 || !effectiveDate) {
      setEditEmployeeError('Ставка должна быть целым числом от 0 ₽, дата — существующей.');
      return;
    }

    const saved = await mutate(
      {
        action: 'updateEmployee',
        employeeId: employeeToEdit.id,
        name,
        dailyRate: rate,
        effectiveDate,
      },
      setEditEmployeeError,
    );

    if (saved) {
      setEmployeeToEditId('');
      setDialog('employees');
    }
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

    const undoToken = createUndoToken();
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
      expiresAt: Date.now() + UNDO_WINDOW_MS,
    });
    setPaymentUndoNotice(null);
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${syncLabel}. Нажмите, чтобы обновить данные.`}
              accessibilityLiveRegion="polite"
              style={[
                styles.syncStatus,
                offline && styles.syncStatusOffline,
                syncFailed && !offline && styles.syncStatusError,
              ]}
              disabled={syncing || offline}
              onPress={() => void loadState(false)}
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
            </Pressable>
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
              accessibilityLabel="Настройки"
              style={styles.iconButton}
              onPress={openSettings}
              testID="open-settings"
            >
              <Cog size={20} color={colors.accentText} />
            </Pressable>
          </View>
        </View>

        {loading && !hasLoadedState ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Загружаю данные</Text>
          </View>
        ) : !hasLoadedState ? (
          <View style={styles.centerState} testID="load-error-state">
            <Notice text={fatalLoadError || 'Не удалось загрузить данные. В базе ничего не изменено.'} />
            <Pressable
              style={styles.primaryButton}
              onPress={() => void bootstrapSession()}
              testID="retry-initial-load"
            >
              <Text style={styles.primaryButtonText}>Повторить</Text>
            </Pressable>
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
                  onChange={changeSelectedMonth}
                  onToday={goToToday}
                  showTodayAction={
                    selectedMonth !== currentDate.month || selectedDate !== currentDate.today
                  }
                />
              </View>
              <CalendarGrid
                month={selectedMonth}
                state={state}
                selectedDate={selectedDate}
                today={currentDate.today}
                onSelect={openAssignment}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Текущий баланс</Text>
                  <Text style={styles.muted}>Начислено по сегодня − выплаты и удержания</Text>
                </View>
                <Pressable
                  style={[
                    styles.smallButton,
                    styles.paymentButton,
                    (!paymentEmployees.length || readOnly) && styles.disabledButton,
                  ]}
                  disabled={!paymentEmployees.length || readOnly}
                  onPress={openPaymentDialog}
                  testID="open-payment"
                >
                  <Plus size={19} color={colors.accentText} />
                  <Text style={[styles.smallButtonText, styles.paymentButtonText]}>Выплата</Text>
                </Pressable>
              </View>
              <View style={styles.totalCard}>
                <Text style={styles.muted}>
                  {totalDue < 0 ? 'Общий аванс / переплата' : 'Общий баланс к выплате'}
                </Text>
                <Text style={styles.totalMoney}>{formatMoney(Math.abs(totalDue))}</Text>
              </View>

              {activeEmployees.map((employee) => (
                <SalaryCard
                  key={employee.id}
                  state={state}
                  employee={employee}
                  month={selectedMonth}
                  cutoffDate={currentDate.today}
                  onOpen={() => openEmployeePayments(employee.id)}
                />
              ))}

              {archivedEmployeesWithBalance.length ? (
                <View style={styles.archivedBalanceSection}>
                  <Text style={styles.fieldLabel}>Архив — нужно рассчитаться</Text>
                  {archivedEmployeesWithBalance.map((employee) => (
                    <SalaryCard
                      key={employee.id}
                      state={state}
                      employee={employee}
                      month={selectedMonth}
                      cutoffDate={currentDate.today}
                      archived
                      onOpen={() => openEmployeePayments(employee.id)}
                    />
                  ))}
                </View>
              ) : null}

              {!activeEmployees.length ? (
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => setDialog('employees')}
                  testID="add-first-employee"
                >
                  <Text style={styles.primaryButtonText}>Добавить первого сотрудника</Text>
                </Pressable>
              ) : null}
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

        {paymentUndoNotice ? (
          <View style={styles.undoBanner} testID="payment-undo-banner">
            <View style={styles.undoTextContainer}>
              <Text style={styles.undoTitle}>
                {paymentUndoNotice.status === 'pending'
                  ? `Запись на ${formatMoney(paymentUndoNotice.amount)} удалена · ${paymentUndoSeconds} с`
                  : `Запись на ${formatMoney(paymentUndoNotice.amount)} возвращена`}
              </Text>
              <Text style={styles.undoBody}>
                {paymentUndoNotice.status === 'pending'
                  ? 'Выплату или удержание можно вернуть.'
                  : paymentUndoNotice.kind === 'deduction'
                    ? 'Удержание снова учитывается в расчёте.'
                    : 'Выплата снова учитывается в расчёте.'}
              </Text>
            </View>
            {paymentUndoNotice.status === 'pending' ? (
              <Pressable
                disabled={saving}
                style={[styles.undoButton, saving && styles.disabledButton]}
                onPress={() => void undoDeletedPayment()}
                testID="undo-delete-payment"
              >
                <Text style={styles.undoButtonText}>Отменить</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {shiftUndoNotice ? (
          <View style={styles.undoBanner} testID="shift-undo-banner">
            <View style={styles.undoTextContainer}>
              <Text style={styles.undoTitle}>
                {shiftUndoNotice.status === 'pending'
                  ? `Смена ${shiftUndoNotice.employeeName} снята · ${shiftUndoSeconds} с`
                  : `Смена ${shiftUndoNotice.employeeName} возвращена`}
              </Text>
              <Text style={styles.undoBody}>{formatDate(shiftUndoNotice.date)}</Text>
            </View>
            {shiftUndoNotice.status === 'pending' ? (
              <Pressable
                disabled={saving}
                style={[styles.undoButton, saving && styles.disabledButton]}
                onPress={() => void undoRemovedShift()}
                testID="undo-remove-shift"
              >
                <Text style={styles.undoButtonText}>Отменить</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {archiveUndoNotice ? (
          <View style={styles.undoBanner} testID="archive-undo-banner">
            <View style={styles.undoTextContainer}>
              <Text style={styles.undoTitle}>
                {archiveUndoNotice.status === 'pending'
                  ? `${archiveUndoNotice.employeeName} в архиве · ${archiveUndoSeconds} с`
                  : `${archiveUndoNotice.employeeName} снова в команде`}
              </Text>
              <Text style={styles.undoBody}>Смены и выплаты сохранены.</Text>
            </View>
            {archiveUndoNotice.status === 'pending' ? (
              <Pressable
                disabled={saving}
                style={[styles.undoButton, saving && styles.disabledButton]}
                onPress={() => void undoArchivedEmployee()}
                testID="undo-archive-employee"
              >
                <Text style={styles.undoButtonText}>Отменить</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Dialog
          visible={dialog === 'assign'}
          title={selectedDateLabel}
          closeLabel="Готово"
          closeTestID="close-assignment"
          onClose={() => setDialog(null)}
        >
          {readOnly ? (
            <Notice text="Показаны последние загруженные данные. Обнови соединение перед изменением смен." />
          ) : null}
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
                    disabled={readOnly || saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active, disabled: readOnly || saving }}
                    accessibilityLabel={`${employee.name}: ${active ? 'на смене' : 'не на смене'}`}
                    onPress={() => void setShiftAssignment(employee, !active)}
                    testID={`assign-employee-${employee.name}`}
                  >
                    <View style={styles.employeeTitleRow}>
                      <EmployeeAvatar name={employee.name} color={employee.color} />
                      <Text style={styles.employeeName}>{employee.name}</Text>
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
          <View style={styles.quickNoteChips}>
            {['Замена', 'Больничный', 'Опоздание', 'Прогул'].map((note) => (
              <Pressable
                key={note}
                accessibilityRole="button"
                accessibilityState={{ selected: dayNoteText.trim() === note }}
                style={[styles.quickNoteChip, dayNoteText.trim() === note && styles.quickNoteChipActive]}
                onPress={() => {
                  setDayNoteText(note);
                  setDayNoteError('');
                }}
              >
                <Text style={styles.quickNoteChipText}>{note}</Text>
              </Pressable>
            ))}
          </View>
          {dayNoteError ? <Notice text={dayNoteError} /> : null}
          <TextInput
            style={[styles.input, styles.dayNoteInput]}
            value={dayNoteText}
            onChangeText={(value) => {
              setDayNoteText(value);
              setDayNoteError('');
            }}
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
          {locationError ? <Notice text={locationError} /> : null}
          <Field
            label="Название"
            value={locationName}
            onChangeText={(value) => {
              setLocationName(value);
              setLocationError('');
            }}
            maxLength={120}
            testID="location-name"
          />
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
                      <Text style={styles.employeeName}>{employee.name}</Text>
                      <Text style={styles.muted}>{formatMoney(employee.dailyRate)} в день</Text>
                    </View>
                  </View>
                  <View style={styles.employeeManagerActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Изменить ${employee.name}`}
                      style={styles.managerIconButton}
                      onPress={() => openEditEmployee(employee)}
                      testID={`edit-employee-${employee.name}`}
                    >
                      <PencilLine size={17} color={colors.text} />
                    </Pressable>
                    <Pressable
                      style={styles.archiveButton}
                      onPress={() => openArchiveEmployee(employee.id)}
                      testID={`archive-employee-${employee.name}`}
                    >
                      <Archive size={16} color={colors.accentText} />
                      <Text style={styles.archiveButtonText}>В архив</Text>
                    </Pressable>
                  </View>
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
                  <View style={styles.employeeManagerActions}>
                    <Pressable
                      style={styles.restoreEmployeeButton}
                      onPress={() => void restoreEmployee(employee.id)}
                      testID={`restore-employee-${employee.name}`}
                    >
                      <Text style={styles.restoreEmployeeButtonText}>Вернуть</Text>
                    </Pressable>
                    <Pressable
                      style={styles.deleteTextButton}
                      onPress={() => openDeleteEmployeeDialog(employee.id)}
                      testID={`delete-archived-employee-${employee.name}`}
                    >
                      <Trash2 size={16} color={colors.dangerText} />
                      <Text style={styles.deleteTextButtonText}>Удалить</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {employeeError ? <Notice text={employeeError} /> : null}
          <Field
            label="Имя"
            value={employeeName}
            onChangeText={(value) => {
              setEmployeeName(value);
              setEmployeeError('');
            }}
            maxLength={80}
            testID="employee-name"
          />
          <View style={styles.employeeRateField}>
            <Field
              label="Ставка в день, ₽"
              value={dailyRate}
              onChangeText={(value) => {
                setDailyRate(value);
                setEmployeeError('');
              }}
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
          visible={dialog === 'archiveEmployee' && Boolean(employeeToArchive)}
          title="Переместить в архив?"
          closeLabel="Отмена"
          onClose={() => {
            setEmployeeToArchiveId('');
            setDialog('employees');
          }}
        >
          {employeeToArchive ? (
            <View style={styles.importSummary}>
              <Text style={styles.warningText}>
                {employeeToArchive.name} исчезнет только из назначения будущих смен. История останется.
              </Text>
              <Text style={styles.importSummaryText}>
                {formatEmployeeBalance(
                  calculateSalary(state, employeeToArchive, selectedMonth, currentDate.today).due,
                )}
              </Text>
            </View>
          ) : null}
          <Pressable
            disabled={saving}
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={() => void archiveEmployee()}
            testID="confirm-archive-employee"
          >
            <Text style={styles.primaryButtonText}>Переместить в архив</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'editEmployee' && Boolean(employeeToEdit)}
          title="Изменить сотрудника"
          closeLabel="Отмена"
          onClose={() => {
            setEmployeeToEditId('');
            setEditEmployeeError('');
            setDialog('employees');
          }}
        >
          {editEmployeeError ? <Notice text={editEmployeeError} /> : null}
          <Field
            label="Имя"
            value={editEmployeeName}
            onChangeText={(value) => {
              setEditEmployeeName(value);
              setEditEmployeeError('');
            }}
            maxLength={80}
            testID="edit-employee-name"
          />
          <Field
            label="Новая ставка в день, ₽"
            value={editEmployeeRate}
            onChangeText={(value) => {
              setEditEmployeeRate(value);
              setEditEmployeeError('');
            }}
            keyboardType="numeric"
            testID="edit-employee-rate"
          />
          <Field
            label="Применять с даты, ДД.ММ.ГГГГ"
            value={editEmployeeRateDate}
            onChangeText={(value) => {
              setEditEmployeeRateDate(value);
              setEditEmployeeError('');
            }}
            placeholder="03.08.2026"
            testID="edit-employee-rate-date"
          />
          <Text style={styles.employeeRateHint}>
            Старые смены останутся рассчитаны по прежней ставке.
          </Text>
          <Pressable
            disabled={saving}
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={() => void saveEditedEmployee()}
            testID="save-edit-employee"
          >
            <Text style={styles.primaryButtonText}>Сохранить</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'deleteEmployee'}
          title="Удалить из базы?"
          closeLabel="Отмена"
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

        <Dialog
          visible={dialog === 'payment'}
          title="Выплата"
          closeLabel="Отмена"
          onClose={() => setDialog(null)}
        >
          <Text style={styles.fieldLabel}>Сотрудник</Text>
          <View style={styles.chips}>
            {paymentEmployees.map((employee) => (
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
              onPress={() => {
                setPaymentKind('payment');
                setPaymentError('');
              }}
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
              onPress={() => {
                setPaymentKind('deduction');
                setPaymentError('');
              }}
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
            onChangeText={(value) => {
              setPaymentDateText(value);
              setPaymentError('');
            }}
            placeholder="26.05.2026"
            testID="payment-date"
          />
          <Field
            label="Сумма, ₽"
            value={paymentAmount}
            onChangeText={(value) => {
              setPaymentAmount(value);
              setPaymentError('');
            }}
            keyboardType="numeric"
            testID="payment-amount"
          />
          <Field
            label="Комментарий"
            value={paymentComment}
            onChangeText={(value) => {
              setPaymentComment(value);
              setPaymentError('');
            }}
            placeholder={paymentKind === 'deduction' ? 'причина удержания' : 'нал, СБП, аванс, зарплата'}
            maxLength={80}
            testID="payment-comment"
          />
          <Pressable
            disabled={saving}
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={() => void addPayment()}
            testID="save-payment"
          >
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
          backupStatus={getBackupStatus(state.backups ?? [])}
          backupItems={(state.backups ?? []).map(toSettingsBackupItem)}
          restoringBackupId={backupPreview?.id ?? null}
          appVersion={CURRENT_APP_VERSION}
          updateStatus={getVersionStatus(versionCheck)}
          updateAvailable={versionCheck?.updateAvailable ?? false}
          checkingForUpdate={checkingVersion}
          onClose={() => setDialog(null)}
          onColorChange={(employeeId, color) => void changeEmployeeColor(employeeId, color)}
          onExport={() => void exportBackup()}
          onImport={() => void selectBackupForImport()}
          onShareSchedule={() => void shareSchedule()}
          onShareSummary={() => void shareMonthSummary()}
          onRestoreBackup={(backupId) => {
            const backup = state.backups?.find((item) => item.id === backupId);
            if (backup) {
              void previewServerBackup(backup);
            }
          }}
          onEditEmployee={(employeeId) => {
            const employee = state.employees.find((item) => item.id === employeeId);
            if (employee) {
              openEditEmployee(employee);
            }
          }}
          onRestoreEmployee={(employeeId) => void restoreEmployee(employeeId)}
          onCheckForUpdate={() => void refreshVersionStatus()}
          onApplyUpdate={applyAvailableUpdate}
          onDisconnect={openDisconnectDialog}
        />

        <Dialog
          visible={dialog === 'backupPreview' && Boolean(backupPreview)}
          title="Восстановить серверную копию?"
          closeLabel="Отмена"
          onClose={() => {
            setBackupPreview(null);
            setDialog('settings');
          }}
        >
          {backupPreview ? (
            <View style={styles.importSummary}>
              <Text style={styles.warningText}>
                Текущие данные будут заменены. Перед этим сервер создаст ещё одну страховочную копию.
              </Text>
              <Text style={styles.importSummaryText}>{backupPreview.locationName}</Text>
              <Text style={styles.importSummaryText}>
                Сотрудников: {backupPreview.employees} · смен: {backupPreview.shifts}
              </Text>
              <Text style={styles.importSummaryText}>
                Выплат: {backupPreview.payments} · комментариев: {backupPreview.dayNotes}
              </Text>
              <Text style={styles.importSummaryText}>
                Период: {formatBackupRange(backupPreview.firstDate, backupPreview.lastDate)}
              </Text>
              <Text style={styles.importSummaryText}>
                Копия от {formatDateTime(backupPreview.createdAt)}
              </Text>
            </View>
          ) : null}
          <Pressable
            disabled={saving}
            style={[styles.dangerButton, saving && styles.disabledButton]}
            onPress={() => void restoreServerBackup()}
            testID="confirm-restore-server-backup"
          >
            <Text style={styles.dangerButtonText}>Восстановить эту копию</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'disconnect'}
          title="Отключить ПВЗ?"
          closeLabel="Отмена"
          onClose={() => setDialog('settings')}
        >
          <Text style={styles.warningText}>
            На этом устройстве снова появится экран ввода кода. Общий график, сотрудники и выплаты не удалятся.
          </Text>
          <Pressable
            disabled={saving}
            style={[styles.dangerButton, saving && styles.disabledButton]}
            onPress={() => void disconnectWorkspace()}
            testID="confirm-disconnect-workspace"
          >
            <Text style={styles.dangerButtonText}>Отключить это устройство</Text>
          </Pressable>
        </Dialog>

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
                Текущие данные этого ПВЗ будут заменены. Перед заменой сервер автоматически сохранит страховочную копию.
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
          scrollable={false}
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
          closeLabel="Отмена"
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
          {paymentError ? <Notice text={paymentError} /> : null}
          <View style={styles.paymentTypeRow}>
            <Pressable
              style={[styles.paymentTypeButton, paymentKind === 'payment' && styles.paymentTypeButtonActive]}
              onPress={() => {
                setPaymentKind('payment');
                setPaymentError('');
              }}
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
              onPress={() => {
                setPaymentKind('deduction');
                setPaymentError('');
              }}
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
            onChangeText={(value) => {
              setPaymentDateText(value);
              setPaymentError('');
            }}
            placeholder="26.05.2026"
            testID="edit-payment-date"
          />
          <Field
            label="Сумма, ₽"
            value={paymentAmount}
            onChangeText={(value) => {
              setPaymentAmount(value);
              setPaymentError('');
            }}
            keyboardType="numeric"
            testID="edit-payment-amount"
          />
          <Field
            label="Комментарий"
            value={paymentComment}
            onChangeText={(value) => {
              setPaymentComment(value);
              setPaymentError('');
            }}
            placeholder={paymentKind === 'deduction' ? 'причина удержания' : 'нал, СБП, аванс, зарплата'}
            maxLength={80}
            testID="edit-payment-comment"
          />
          <Pressable
            disabled={saving}
            style={[styles.primaryButton, saving && styles.disabledButton]}
            onPress={() => void updateSelectedPayment()}
            testID="save-edit-payment"
          >
            <Text style={styles.primaryButtonText}>Сохранить изменения</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'deletePayment' && Boolean(paymentToDelete)}
          title="Удалить запись?"
          closeLabel="Отмена"
          closeTestID="close-delete-payment"
          onClose={() => {
            setPaymentToDeleteId('');
            setDialog('employeePayments');
          }}
        >
          <Text style={styles.warningText}>
            Это удалит только выбранную выплату или удержание. Смены и сотрудники останутся на месте.
          </Text>
          {paymentError ? <Notice text={paymentError} /> : null}
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
          <Pressable
            disabled={saving}
            style={[styles.dangerButton, saving && styles.disabledButton]}
            onPress={() => void deleteSelectedPayment()}
            testID="confirm-delete-payment"
          >
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
  cutoffDate,
  archived = false,
  onOpen,
}: {
  state: AppState;
  employee: Employee;
  month: string;
  cutoffDate: string;
  archived?: boolean;
  onOpen: () => void;
}) {
  const salary = calculateSalary(state, employee, month, cutoffDate);
  const balanceLabel = salary.due < 0 ? 'Аванс / переплата' : 'К выплате';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${employee.name}. ${formatEmployeeBalance(salary.due)}. Открыть историю.`}
      style={({ pressed }) => [
        styles.salaryCard,
        { borderLeftColor: employee.color },
        archived && styles.salaryCardArchived,
        pressed && styles.salaryCardPressed,
      ]}
      onPress={onOpen}
      testID={`open-payment-history-${employee.name}`}
    >
      <View style={styles.salaryCardInfo}>
        <View style={styles.employeeTitleRow}>
          <EmployeeAvatar name={employee.name} color={employee.color} muted={archived} />
          <Text style={styles.employeeName}>{employee.name}</Text>
          {archived ? <Text style={styles.archivedInlineLabel}>Архив</Text> : null}
        </View>
        <Text style={styles.muted}>
          {salary.workedShifts} смен · начислено {formatMoney(salary.accrued)}
        </Text>
        <Text style={styles.deductionLine}>
          Выплачено {formatMoney(salary.paid)} · удержано {formatMoney(salary.deductions)}
        </Text>
      </View>
      <View style={styles.salaryDue}>
        <Text style={styles.miniLabel}>{balanceLabel}</Text>
        <Text style={styles.dueMoney}>{formatMoney(Math.abs(salary.due))}</Text>
        <View style={styles.historyAffordance}>
          <Text style={styles.historyAffordanceText}>История</Text>
          <ChevronRight size={14} color={colors.muted} />
        </View>
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
                  Записей: {group.payments.length} · выплачено {formatMoney(group.paid)} · удержано {formatMoney(group.deductions)}
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

function createUndoToken(): string {
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
    paid: payments
      .filter((payment) => payment.kind === 'payment')
      .reduce((sum, payment) => sum + payment.amount, 0),
    deductions: payments
      .filter((payment) => payment.kind === 'deduction')
      .reduce((sum, payment) => sum + payment.amount, 0),
  }));
}

function formatSyncTime(value: Date): string {
  return value.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function createClientId(prefix: 'employee' | 'payment'): string {
  const uuid = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${uuid}`;
}

async function shareText(
  title: string,
  message: string,
  onSuccess: (message: string) => void,
  onError: (message: string) => void,
) {
  onSuccess('');
  onError('');

  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      const webNavigator = navigator as Navigator & {
        share?: (data: { title: string; text: string }) => Promise<void>;
      };

      if (webNavigator.share) {
        await webNavigator.share({ title, text: message });
        onSuccess('Текст подготовлен для отправки.');
        return;
      }

      if (webNavigator.clipboard) {
        await webNavigator.clipboard.writeText(message);
        onSuccess('Текст скопирован в буфер обмена.');
        return;
      }
    }

    await Share.share({ title, message });
    onSuccess('Текст подготовлен для отправки.');
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') {
      return;
    }

    onError('Не удалось подготовить текст для отправки.');
  }
}

function formatEmployeeBalance(balance: number): string {
  if (balance > 0) {
    return `К выплате ${formatMoney(balance)}`;
  }

  if (balance < 0) {
    return `Аванс / переплата ${formatMoney(Math.abs(balance))}`;
  }

  return 'Баланс закрыт';
}

function getBackupStatus(backups: readonly WorkspaceBackupSummary[]): string {
  const latest = [...backups].sort((first, second) => second.createdAt.localeCompare(first.createdAt))[0];

  if (!latest) {
    return 'Серверная автокопия ещё не создана.';
  }

  const createdAt = new Date(latest.createdAt);
  const ageHours = (Date.now() - createdAt.getTime()) / 3_600_000;
  const prefix = ageHours > 36 ? 'Внимание: последняя копия' : 'Последняя серверная копия';

  return `${prefix}: ${createdAt.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function toSettingsBackupItem(backup: WorkspaceBackupSummary): SettingsBackupItem {
  const sourceLabels: Record<WorkspaceBackupSummary['source'], string> = {
    daily: 'Ежедневная копия',
    'pre-import': 'Перед загрузкой файла',
    'pre-restore': 'Перед восстановлением',
    manual: 'Ручная копия',
    legacy: 'Резервная копия',
  };

  return {
    id: backup.id,
    title: `${sourceLabels[backup.source]} · ${formatDateTime(backup.createdAt)}`,
    detail: `${backup.employees} сотрудников · ${backup.shifts} смен · ${backup.payments} записей`,
    automatic: backup.source === 'daily',
  };
}

function getVersionStatus(version: AppVersionCheck | null): string {
  if (!version) {
    return 'Обновление можно проверить вручную.';
  }

  if (version.updateRequired) {
    return `Версия ${version.latestVersion} обязательна для безопасной работы.`;
  }

  if (version.updateAvailable) {
    return `Доступна версия ${version.latestVersion}.`;
  }

  return 'Установлена актуальная версия.';
}

function formatBackupRange(firstDate: string | null, lastDate: string | null): string {
  if (!firstDate && !lastDate) {
    return 'датированные записи отсутствуют';
  }

  if (firstDate === lastDate || !lastDate) {
    return firstDate ? formatDate(firstDate) : 'дата не указана';
  }

  return `${firstDate ? formatDate(firstDate) : '…'} — ${formatDate(lastDate)}`;
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
  archivedBalanceSection: {
    gap: 10,
    paddingTop: 2,
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
  employeeManagerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  managerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
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
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
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
  restoreEmployeeButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreEmployeeButtonText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
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
  salaryCardArchived: {
    backgroundColor: colors.panelSoft,
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
  archivedInlineLabel: {
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: colors.panelSoft,
    color: colors.muted,
    fontFamily: appFont,
    fontSize: 9,
    fontWeight: '700',
  },
  historyAffordance: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  historyAffordanceText: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
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
    minHeight: 44,
    borderRadius: 22,
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
  quickNoteChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  quickNoteChip: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 13,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickNoteChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  quickNoteChipText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    minHeight: 44,
    borderRadius: 22,
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
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 22,
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
