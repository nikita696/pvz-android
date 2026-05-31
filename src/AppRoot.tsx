import { StatusBar } from 'expo-status-bar';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw, UserPlus } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchState, sendAction } from './api';
import {
  calculateSalary,
  calculateTotalDue,
  formatMoney,
  getShiftCountByDate,
  hasShift,
} from './domain/calculations';
import { CURRENT_MONTH, TODAY, emptyAppState } from './domain/seed';
import type { ApiAction, AppState, Employee } from './domain/types';

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
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const appFont = 'Arial';
const colors = {
  background: '#0f1110',
  panel: '#181b19',
  panelSoft: '#111412',
  border: '#2b302c',
  borderStrong: '#667667',
  text: '#f5f2ea',
  muted: '#979f95',
  accent: '#a8d5ba',
  accentWarm: '#f0dd92',
  accentText: '#101411',
  dangerBg: '#342426',
  dangerBorder: '#6d474d',
  dangerText: '#ffc7cd',
};

type DialogName = 'employee' | 'payment' | null;

export default function AppRoot() {
  const [state, setState] = useState<AppState>(emptyAppState);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [dailyRate, setDailyRate] = useState('2500');
  const [paymentEmployeeId, setPaymentEmployeeId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeEmployees = useMemo(
    () => state.employees.filter((employee) => employee.active),
    [state.employees],
  );
  const selectedDayShifts = useMemo(
    () => state.shifts.filter((shift) => shift.date === selectedDate),
    [state.shifts, selectedDate],
  );
  const totalDue = useMemo(() => calculateTotalDue(state, selectedMonth), [state, selectedMonth]);

  useEffect(() => {
    void loadState();
  }, []);

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

  async function mutate(action: ApiAction) {
    setSaving(true);
    setError('');

    try {
      setState(await sendAction(action));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить в Neon.');
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

    await mutate({ action: 'addEmployee', name: employeeName.trim(), dailyRate: rate });
    setEmployeeName('');
    setDailyRate('2500');
    setDialog(null);
  }

  async function addPayment() {
    const amount = Number(paymentAmount);
    const employeeId = paymentEmployeeId || activeEmployees[0]?.id;

    if (!employeeId || !Number.isFinite(amount) || amount <= 0) {
      setError('Выбери сотрудника и сумму выплаты.');
      return;
    }

    await mutate({ action: 'addPayment', employeeId, amount, paidAt: selectedDate });
    setPaymentAmount('');
    setPaymentEmployeeId('');
    setDialog(null);
  }

  const selectedDateLabel = formatDate(selectedDate);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.shell}>
        <View style={styles.header}>
          <View>
            <Text style={styles.locationName}>{state.location.name}</Text>
            <Text style={styles.subtitle}>График и зарплата без лишнего</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={loadState} testID="refresh">
            <RefreshCw size={20} color="#17121f" />
          </Pressable>
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
                <View>
                  <Text style={styles.cardTitle}>Календарь</Text>
                  <Text style={styles.muted}>{formatMonthLabel(selectedMonth)}</Text>
                </View>
                <MonthStepper month={selectedMonth} onChange={setSelectedMonth} />
              </View>
              <CalendarGrid
                month={selectedMonth}
                selectedDate={selectedDate}
                state={state}
                onSelect={setSelectedDate}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>{selectedDateLabel}</Text>
                  <Text style={styles.muted}>
                    {selectedDayShifts.length ? `${selectedDayShifts.length} смен(ы)` : 'Смен нет'}
                  </Text>
                </View>
                <Pressable style={styles.smallButton} onPress={() => setDialog('employee')} testID="open-add-employee">
                  <UserPlus size={18} color="#17121f" />
                  <Text style={styles.smallButtonText}>Сотрудник</Text>
                </Pressable>
              </View>

              {activeEmployees.length ? (
                activeEmployees.map((employee) => {
                  const active = hasShift(state, employee.id, selectedDate);
                  return (
                    <Pressable
                      key={employee.id}
                      style={[styles.employeeShiftRow, active && styles.employeeShiftRowActive]}
                      onPress={() =>
                        mutate({ action: 'toggleShift', employeeId: employee.id, date: selectedDate })
                      }
                      testID={`toggle-shift-${employee.name}`}
                    >
                      <View>
                        <Text style={styles.employeeName}>{employee.name}</Text>
                        <Text style={styles.muted}>{formatMoney(employee.dailyRate)} в день</Text>
                      </View>
                      <Text style={[styles.shiftStatus, active && styles.shiftStatusActive]}>
                        {active ? 'Отработал' : 'Выходной'}
                      </Text>
                    </Pressable>
                  );
                })
              ) : (
                <EmptyState text="Добавь 2–3 сотрудников, потом отмечай смены прямо в календаре." />
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>Зарплата</Text>
                  <Text style={styles.muted}>Смены × ставка в день − уже выплачено</Text>
                </View>
                <Pressable
                  style={styles.smallButton}
                  disabled={!activeEmployees.length}
                  onPress={() => setDialog('payment')}
                  testID="open-payment"
                >
                  <Plus size={18} color="#17121f" />
                  <Text style={styles.smallButtonText}>Выплата</Text>
                </Pressable>
              </View>
              <View style={styles.totalCard}>
                <Text style={styles.muted}>К выплате за месяц</Text>
                <Text style={styles.totalMoney}>{formatMoney(totalDue)}</Text>
              </View>

              {activeEmployees.map((employee) => (
                <SalaryCard
                  key={employee.id}
                  state={state}
                  employee={employee}
                  month={selectedMonth}
                />
              ))}
            </View>
          </ScrollView>
        )}

        {saving ? (
          <View style={styles.saving}>
            <ActivityIndicator color="#17121f" />
            <Text style={styles.savingText}>Сохраняю</Text>
          </View>
        ) : null}

        <Dialog visible={dialog === 'employee'} title="Новый сотрудник" onClose={() => setDialog(null)}>
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

        <Dialog visible={dialog === 'payment'} title="Выплата" onClose={() => setDialog(null)}>
          <Text style={styles.fieldLabel}>Сотрудник</Text>
          <View style={styles.chips}>
            {activeEmployees.map((employee) => (
              <Pressable
                key={employee.id}
                style={[
                  styles.chip,
                  (paymentEmployeeId || activeEmployees[0]?.id) === employee.id && styles.chipActive,
                ]}
                onPress={() => setPaymentEmployeeId(employee.id)}
              >
                <Text
                  style={[
                    styles.chipText,
                    (paymentEmployeeId || activeEmployees[0]?.id) === employee.id && styles.chipTextActive,
                  ]}
                >
                  {employee.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="Сумма, ₽"
            value={paymentAmount}
            onChangeText={setPaymentAmount}
            keyboardType="numeric"
            testID="payment-amount"
          />
          <Pressable style={styles.primaryButton} onPress={addPayment} testID="save-payment">
            <Text style={styles.primaryButtonText}>Сохранить выплату</Text>
          </Pressable>
        </Dialog>
      </View>
    </SafeAreaView>
  );
}

function CalendarGrid({
  month,
  selectedDate,
  state,
  onSelect,
}: {
  month: string;
  selectedDate: string;
  state: AppState;
  onSelect: (date: string) => void;
}) {
  const days = getCalendarDays(month);
  const weeks = chunkWeeks(days);

  return (
    <View style={styles.calendar}>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((day) => (
          <Text key={day} style={styles.weekday}>
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
              const count = getShiftCountByDate(state, date);

              return (
                <Pressable
                  key={date}
                  style={[styles.dayCell, selected && styles.dayCellSelected, count > 0 && styles.dayCellFilled]}
                  onPress={() => onSelect(date)}
                  testID={`day-${day}`}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day}</Text>
                  {count > 0 ? <Text style={[styles.dayCount, selected && styles.dayTextSelected]}>{count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function SalaryCard({
  state,
  employee,
  month,
}: {
  state: AppState;
  employee: Employee;
  month: string;
}) {
  const salary = calculateSalary(state, employee, month);

  return (
    <View style={styles.salaryCard}>
      <View>
        <Text style={styles.employeeName}>{employee.name}</Text>
        <Text style={styles.muted}>
          {salary.workedShifts} смен × {formatMoney(salary.dailyRate)} − {formatMoney(salary.paid)}
        </Text>
      </View>
      <View style={styles.salaryDue}>
        <Text style={styles.miniLabel}>К выплате</Text>
        <Text style={styles.dueMoney}>{formatMoney(salary.due)}</Text>
      </View>
    </View>
  );
}

function MonthStepper({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <View style={styles.monthStepper}>
      <Pressable style={styles.roundButton} onPress={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft size={18} color="#17121f" />
      </Pressable>
      <Text style={styles.monthText}>{formatMonthLabel(month)}</Text>
      <Pressable style={styles.roundButton} onPress={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight size={18} color="#17121f" />
      </Pressable>
    </View>
  );
}

function Dialog({
  visible,
  title,
  children,
  onClose,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.dialog}>
          <View style={styles.dialogHeader}>
            <Text style={styles.dialogTitle}>{title}</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.cancelText}>Отмена</Text>
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric';
  testID?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholderTextColor="#736b80"
        testID={testID}
      />
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <CalendarDays size={24} color="#837a91" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

function getCalendarDays(month: string): Array<number | null> {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const days: Array<number | null> = Array.from({ length: offset }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(day);
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function chunkWeeks(days: Array<number | null>): Array<Array<number | null>> {
  const weeks: Array<Array<number | null>> = [];

  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }

  return weeks;
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

function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
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
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationName: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '800',
  },
  subtitle: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 13,
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
    paddingBottom: 26,
    gap: 14,
  },
  calendarCard: {
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
  },
  muted: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  monthStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roundButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 12,
    minWidth: 72,
    textAlign: 'center',
    fontWeight: '800',
  },
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
    borderRadius: 8,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellFilled: {
    backgroundColor: '#20291f',
    borderColor: colors.borderStrong,
  },
  dayCellSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayText: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  dayTextSelected: {
    color: colors.accentText,
  },
  dayCount: {
    fontFamily: appFont,
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  smallButton: {
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  smallButtonText: {
    fontFamily: appFont,
    color: colors.accentText,
    fontSize: 12,
    fontWeight: '800',
  },
  employeeShiftRow: {
    minHeight: 72,
    borderRadius: 8,
    padding: 14,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  employeeShiftRowActive: {
    backgroundColor: '#20291f',
    borderColor: colors.accent,
  },
  employeeName: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  shiftStatus: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  shiftStatusActive: {
    color: colors.accent,
  },
  totalCard: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: colors.accentWarm,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  salaryDue: {
    alignItems: 'flex-end',
    gap: 2,
  },
  miniLabel: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
  },
  dueMoney: {
    fontFamily: appFont,
    color: colors.accentWarm,
    fontSize: 17,
    fontWeight: '900',
  },
  emptyState: {
    minHeight: 112,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 18,
  },
  emptyText: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  notice: {
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  noticeText: {
    fontFamily: appFont,
    color: colors.dangerText,
    fontSize: 13,
    lineHeight: 18,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 10,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dialogTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  cancelText: {
    fontFamily: appFont,
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  field: {
    gap: 6,
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
  primaryButton: {
    minHeight: 50,
    borderRadius: 25,
    backgroundColor: colors.accent,
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
    color: colors.accentText,
  },
});
