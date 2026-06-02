import { StatusBar } from 'expo-status-bar';
import {
  Archive,
  ChevronDown,
  ChevronRight,
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

import { fetchState, sendAction } from './api';
import { CalendarGrid } from './components/CalendarGrid';
import { MonthStepper } from './components/MonthStepper';
import { SelectedDayPanel } from './components/SelectedDayPanel';
import { Dialog, EmptyState, Field, Notice } from './components/primitives';
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
  | null;
type PaymentMonthGroup = {
  month: string;
  payments: SalaryPayment[];
  total: number;
};

export default function AppRoot() {
  const [state, setState] = useState<AppState>(emptyAppState);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [locationName, setLocationName] = useState('');
  const [employeeName, setEmployeeName] = useState('');
  const [employeeToDeleteId, setEmployeeToDeleteId] = useState('');
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
  const [dayNoteText, setDayNoteText] = useState('');
  const [selectedDayEmployeesOpen, setSelectedDayEmployeesOpen] = useState(false);
  const [expandedSelectedDayEmployees, setExpandedSelectedDayEmployees] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
  const totalDue = useMemo(() => calculateTotalDue(state, selectedMonth), [state, selectedMonth]);

  useEffect(() => {
    void loadState();
  }, []);

  useEffect(() => {
    setSelectedDayEmployeesOpen(false);
    setExpandedSelectedDayEmployees({});
  }, [selectedDate]);

  async function loadState() {
    setLoading(true);
    setError('');

    try {
      setState(await fetchState());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось загрузить данные из Neon.');
    } finally {
      setLoading(false);
    }
  }

  async function mutate(action: ApiAction): Promise<boolean> {
    setSaving(true);
    setError('');

    try {
      setState(await sendAction(action));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить в Neon.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addEmployee() {
    const rate = Number(dailyRate);

    if (!employeeName.trim() || !Number.isFinite(rate) || rate <= 0) {
      setError('Укажи имя и ставку в день.');
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
    const employeeId = paymentEmployeeId || activeEmployees[0]?.id;
    const paidAt = parseDateInput(paymentDateText);

    if (!employeeId || !Number.isFinite(amount) || amount <= 0) {
      setError('Выбери сотрудника и сумму.');
      return;
    }

    if (!paidAt) {
      setError('Укажи дату в формате ДД.ММ.ГГГГ.');
      return;
    }

    const saved = await mutate({
      action: 'addPayment',
      employeeId,
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
    setPaymentDateText(formatDate(selectedDate));
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
    setDialog('deleteEmployee');
  }

  async function deleteArchivedEmployee() {
    if (!employeeToDeleteId) {
      return;
    }

    const deleted = await mutate({ action: 'deleteEmployee', employeeId: employeeToDeleteId });
    if (!deleted) {
      return;
    }

    setEmployeeToDeleteId('');
    setDialog('employees');
  }

  const selectedDateLabel = formatDate(selectedDate);

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
            <Text style={styles.subtitle}>Удобный трекер смен и выплат</Text>
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
                selectedDate={selectedDate}
                state={state}
                onSelect={openAssignment}
              />
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
              dayNote={selectedDayNote}
              onOpenDayNote={openDayNoteDialog}
              onToggleEmployee={toggleSelectedDayEmployee}
              onToggleEmployeesOpen={() => setSelectedDayEmployeesOpen((current) => !current)}
            />

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Зарплата</Text>
                  <Text style={styles.muted}>Отработано по сегодня × ставка − выплаты и штрафы</Text>
                </View>
                <Pressable
                  style={styles.smallButton}
                  disabled={!activeEmployees.length}
                  onPress={openPaymentDialog}
                  testID="open-payment"
                >
                  <Plus size={18} color={colors.accentText} />
                  <Text style={styles.smallButtonText}>Выплата</Text>
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
          </ScrollView>
        )}

        {saving ? (
          <View style={styles.saving}>
            <ActivityIndicator color={colors.accentText} />
            <Text style={styles.savingText}>Сохраняю</Text>
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
                      <View style={[styles.employeeDot, { backgroundColor: employee.color }]} />
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
            placeholder="Например: замена, опоздал, инвентаризация"
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

        <Dialog visible={dialog === 'employees'} title="Сотрудники" onClose={() => setDialog(null)}>
          <View style={styles.employeeManagerList}>
            {activeEmployees.length ? (
              activeEmployees.map((employee) => (
                <View key={employee.id} style={styles.employeeManagerRow}>
                  <View style={styles.employeeTitleRow}>
                    <View style={[styles.employeeDot, { backgroundColor: employee.color }]} />
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
                    <View style={[styles.employeeDot, styles.employeeDotMuted]} />
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
          <Field
            label="Ставка в день, ₽"
            value={dailyRate}
            onChangeText={setDailyRate}
            keyboardType="numeric"
            testID="employee-rate"
          />
          <Pressable style={styles.primaryButton} onPress={addEmployee} testID="save-employee">
            <Text style={styles.primaryButtonText}>Добавить</Text>
          </Pressable>
        </Dialog>

        <Dialog
          visible={dialog === 'deleteEmployee'}
          title="Удалить из базы?"
          onClose={() => {
            setEmployeeToDeleteId('');
            setDialog('employees');
          }}
        >
          <Text style={styles.warningText}>
            Сотрудник уже в архиве. Следующий шаг удалит его из базы вместе со сменами и выплатами.
          </Text>
          <Pressable style={styles.dangerButton} onPress={deleteArchivedEmployee} testID="confirm-delete-employee">
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
                  (paymentEmployeeId || activeEmployees[0]?.id) === employee.id && styles.chipActive,
                  (paymentEmployeeId || activeEmployees[0]?.id) === employee.id && {
                    backgroundColor: employee.color,
                    borderColor: employee.color,
                  },
                ]}
                onPress={() => setPaymentEmployeeId(employee.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: employee.color },
                    (paymentEmployeeId || activeEmployees[0]?.id) === employee.id && styles.chipTextActive,
                  ]}
                >
                  {employee.name}
                </Text>
              </Pressable>
            ))}
          </View>
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
          <View style={[styles.employeeDot, { backgroundColor: employee.color }]} />
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

function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const next = new Date(year, monthNumber - 1 + offset, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTH_NAMES[monthNumber - 1]} ${year}`;
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
    paddingTop: 10,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    flexShrink: 1,
    textDecorationLine: 'underline',
    textDecorationColor: colors.borderStrong,
  },
  editBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    paddingHorizontal: 14,
    paddingBottom: 30,
    gap: 14,
  },
  calendarCard: {
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    gap: 14,
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
    borderColor: colors.accentStrong,
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
  employeeDot: {
    width: 12,
    height: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  employeeDotMuted: {
    backgroundColor: colors.muted,
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
    borderColor: colors.accentStrong,
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
    borderRadius: 8,
    padding: 16,
    backgroundColor: colors.accentWarmSoft,
    borderWidth: 1,
    borderColor: colors.accentWarm,
    gap: 4,
  },
  totalMoney: {
    fontFamily: appFont,
    color: colors.accentText,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
  },
  salaryCard: {
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
    color: colors.dangerText,
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
    color: colors.accentStrong,
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
    color: colors.dangerText,
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
    borderColor: colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: appFont,
    color: colors.accentText,
    fontSize: 14,
    fontWeight: '900',
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
    borderColor: colors.accentStrong,
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
    borderColor: colors.accentStrong,
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
