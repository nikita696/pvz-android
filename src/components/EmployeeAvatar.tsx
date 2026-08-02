import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { appFont, colors } from '../ui/theme';

type EmployeeAvatarProps = {
  name: string;
  color: string;
  size?: 'tiny' | 'small' | 'medium';
  muted?: boolean;
};

const sizes = {
  tiny: { width: 19, height: 16, radius: 5, font: 10, line: 12 },
  small: { width: 30, height: 22, radius: 7, font: 12, line: 15 },
  medium: { width: 38, height: 28, radius: 9, font: 15, line: 18 },
} as const;

export function EmployeeAvatar({ name, color, size = 'small', muted = false }: EmployeeAvatarProps) {
  const dimensions = sizes[size];
  const initial = name.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';
  const backgroundColor = mixWithWhite(color, 0.82);
  const borderColor = mixWithWhite(color, 0.65);

  return (
    <View
      accessibilityLabel={`Сотрудник ${name}`}
      style={[
        styles.avatar,
        {
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: dimensions.radius,
          backgroundColor,
          borderColor,
          opacity: muted ? 0.55 : 1,
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
  },
  initial: {
    fontFamily: appFont,
    color: colors.text,
    fontWeight: '500',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
});

function mixWithWhite(color: string, whiteRatio: number) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);

  if (!match) {
    return colors.panelSoft;
  }

  const value = Number.parseInt(match[1], 16);
  const colorRatio = 1 - whiteRatio;
  const red = Math.round(((value >> 16) & 255) * colorRatio + 255 * whiteRatio);
  const green = Math.round(((value >> 8) & 255) * colorRatio + 255 * whiteRatio);
  const blue = Math.round((value & 255) * colorRatio + 255 * whiteRatio);

  return `rgb(${red}, ${green}, ${blue})`;
}
