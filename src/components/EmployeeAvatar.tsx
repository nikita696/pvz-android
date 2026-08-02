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
  tiny: { box: 15, radius: 5, font: 9, line: 11 },
  small: { box: 24, radius: 8, font: 13, line: 16 },
  medium: { box: 32, radius: 10, font: 17, line: 20 },
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
          borderRadius: dimensions.radius,
          backgroundColor: color,
          opacity: muted ? 0.45 : 1,
        },
      ]}
    >
      <Text
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
  },
  initial: {
    fontFamily: appFont,
    color: '#FFFFFF',
    fontWeight: '900',
    textAlign: 'center',
  },
});
