import { View, StyleSheet, ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Colors } from '@/constants/theme'

interface Props {
  children: React.ReactNode
  style?: ViewStyle
  edges?: ('top' | 'bottom' | 'left' | 'right')[]
}

export function ScreenWrapper({ children, style, edges = ['top', 'bottom'] }: Props) {
  return (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      {children}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
})
