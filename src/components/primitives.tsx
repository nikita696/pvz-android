import { CalendarDays } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { appFont, colors } from '../ui/theme';

type DialogProps = {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  closeTestID?: string;
  onClose: () => void;
};

export function Dialog({ visible, title, children, closeTestID, onClose }: DialogProps) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.dialog}>
          <View style={styles.dialogHeader}>
            <Text style={styles.dialogTitle}>{title}</Text>
            <Pressable onPress={onClose} testID={closeTestID ?? 'dialog-close'}>
              <Text style={styles.cancelText}>Отмена</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.dialogBody}
            contentContainerStyle={styles.dialogBodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'numeric';
  placeholder?: string;
  maxLength?: number;
  secureTextEntry?: boolean;
  testID?: string;
};

export function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  maxLength,
  secureTextEntry,
  testID,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        placeholderTextColor="#9CA3AF"
        testID={testID}
      />
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <CalendarDays size={24} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 26, 22, 0.24)',
    justifyContent: 'center',
    padding: 18,
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    alignSelf: 'center',
    borderRadius: 14,
    padding: 18,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
    shadowColor: '#111312',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  dialogBody: {
    flexShrink: 1,
  },
  dialogBodyContent: {
    gap: 14,
  },
  dialogTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  cancelText: {
    fontFamily: appFont,
    color: colors.accentStrong,
    fontSize: 13,
    fontWeight: '800',
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    fontFamily: appFont,
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: appFont,
    fontSize: 15,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 22,
  },
  emptyText: {
    fontFamily: appFont,
    color: colors.muted,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
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
    fontWeight: '700',
  },
});
