import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { appFont } from '../ui/theme';

type EmployeeAvatarProps = {
  name: string;
  color: string;
  size?: 'tiny' | 'small' | 'medium';
  muted?: boolean;
};

const sizes = {
  tiny: { box: 16, font: 9, line: 11 },
  small: { box: 24, font: 12, line: 15 },
  medium: { box: 32, font: 16, line: 19 },
} as const;

export function EmployeeAvatar({ name, color, size = 'small', muted = false }: EmployeeAvatarProps) {
  const dimensions = sizes[size];
  const initial = name.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';

  return (
    <View
      accessibilityLabel={`Сотрудник ${name}`}
      style={[
        styles.avatar,
        {
          width: dimensions.box,
          height: dimensions.box,
          borderRadius: dimensions.box / 2,
          backgroundColor: color,
          opacity: muted ? 0.45 : 1,
        },
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.initial,
          {
            fontSize: dimensions.font,
            lineHeight: dimensions.line,
          },
        ]}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
  },
  initial: {
    fontFamily: appFont,
    color: '#FFFFFF',
    fontWeight: '500',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});
