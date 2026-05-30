import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ShadowWrapper from './ShadowWrapper';
import { COLORS, SPACING } from '../constants';

interface SectionHeaderProps {
  title: string;
  shadowOffset?: number;
  borderRadius?: number;
}

export default function SectionHeader({ title, shadowOffset = 2, borderRadius = 4 }: SectionHeaderProps) {
  return (
    <ShadowWrapper offset={shadowOffset} borderRadius={borderRadius}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
      </View>
    </ShadowWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.yellow,
    borderRadius: 4,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
  },
  title: {
    color: COLORS.black,
    fontFamily: 'Bangers-Regular',
    fontSize: 18,
    letterSpacing: 0.5,
    textAlign: 'left',
  },
});
