import { CalendarDays } from 'lucide-react-native';
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { appFont, colors } from '../ui/theme';

type DialogProps = {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  closeTestID?: string;
  closeLabel?: string;
  scrollable?: boolean;
  onClose: () => void;
};

export function Dialog({
  visible,
  title,
  children,
  closeTestID,
  closeLabel = 'Закрыть',
  scrollable = true,
  onClose,
}: DialogProps) {
  const content = scrollable ? (
    <ScrollView
      style={styles.dialogContentScroll}
      contentContainerStyle={styles.dialogContent}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.dialogContent}>{children}</View>
  );

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
          style={styles.keyboardAvoider}
        >
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={onClose}
            style={styles.dialog}
          >
            <View style={styles.dialogHeader}>
              <Text accessibilityRole="header" style={styles.dialogTitle}>{title}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
                style={({ pressed }) => [styles.closeButton, pressed && styles.buttonPressed]}
                onPress={onClose}
                testID={closeTestID ?? 'dialog-close'}
              >
                <Text style={styles.cancelText}>{closeLabel}</Text>
              </Pressable>
            </View>
            {content}
          </View>
        </KeyboardAvoidingView>
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
  testID?: string;
};

export function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  maxLength,
  testID,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        maxLength={maxLength}
        placeholderTextColor="#9CA3AF"
        testID={testID}
      />
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <CalendarDays accessible={false} size={24} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Notice({ text }: { text: string }) {
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 26, 22, 0.24)',
    padding: 18,
  },
  keyboardAvoider: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
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
    shadowColor: '#111312',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  dialogContentScroll: {
    flexShrink: 1,
  },
  dialogContent: {
    gap: 14,
    paddingBottom: 2,
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  dialogTitle: {
    fontFamily: appFont,
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
    flex: 1,
    minWidth: 0,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.accentSoft,
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
