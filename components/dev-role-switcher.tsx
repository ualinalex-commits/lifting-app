import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  StyleSheet, Platform, Pressable,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth, UserRole } from '@/lib/auth'
import { isDevMode } from '@/lib/dev-mode'

const ROLES: { role: UserRole; label: string; group: string }[] = [
  { role: 'main_admin',         label: 'Main Admin',          group: 'Admin' },
  { role: 'company_admin',      label: 'Company Admin',       group: 'Admin' },
  { role: 'appointed_person',   label: 'Appointed Person',    group: 'Site' },
  { role: 'crane_supervisor',   label: 'Crane Supervisor',    group: 'Operative' },
  { role: 'crane_operator',     label: 'Crane Operator',      group: 'Operative' },
  { role: 'slinger_signaller',  label: 'Slinger / Signaller', group: 'Operative' },
  { role: 'subcontractor_admin',label: 'Subcontractor Admin', group: 'Operative' },
]

const GROUP_ORDER = ['Admin', 'Site', 'Operative']

function toLabel(r: UserRole): string {
  return ROLES.find(x => x.role === r)?.label ?? r ?? 'No Role'
}

export function DevRoleSwitcher() {
  const { session, role, actualRole, devRole, setDevRole } = useAuth()
  const [open, setOpen] = useState(false)
  const insets = useSafeAreaInsets()

  if (!isDevMode() || !session) return null

  const isOverriding = devRole !== undefined

  function selectRole(newRole: UserRole) {
    setDevRole(newRole)
    setOpen(false)
    router.replace('/')
  }

  function resetRole() {
    setDevRole(undefined)
    setOpen(false)
    router.replace('/')
  }

  // Web: position:fixed so it doesn't affect layout flow
  // Native: position:absolute pinned just below the status bar
  const barStyle = Platform.OS === 'web'
    ? [styles.bar, { position: 'fixed' as any, top: 0 }]
    : [styles.bar, { position: 'absolute' as const, top: insets.top }]

  return (
    <>
      <View style={barStyle} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.pill, isOverriding && styles.pillOverriding]}
          onPress={() => setOpen(true)}
          activeOpacity={0.75}
        >
          <Text style={styles.devBadge}>DEV</Text>
          <Text style={styles.separator}>·</Text>
          <Text style={styles.roleText} numberOfLines={1}>{toLabel(role)}</Text>
          {isOverriding && <View style={styles.overrideDot} />}
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={e => e.stopPropagation()}>

            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Dev Role Switcher</Text>

            {isOverriding && (
              <Text style={styles.realRoleNote}>
                Real session role:{' '}
                <Text style={styles.realRoleValue}>{toLabel(actualRole)}</Text>
              </Text>
            )}

            <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
              {GROUP_ORDER.map(group => (
                <View key={group}>
                  <Text style={styles.groupLabel}>{group}</Text>
                  {ROLES.filter(r => r.group === group).map(({ role: r, label }) => {
                    const active = role === r
                    return (
                      <TouchableOpacity
                        key={r}
                        style={[styles.option, active && styles.optionActive]}
                        onPress={() => selectRole(r)}
                        activeOpacity={0.65}
                      >
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>
                          {label}
                        </Text>
                        {active && <Text style={styles.checkmark}>✓</Text>}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              ))}

              {isOverriding && (
                <TouchableOpacity style={styles.resetBtn} onPress={resetRole} activeOpacity={0.7}>
                  <Text style={styles.resetText}>↩ Reset to real role ({toLabel(actualRole)})</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const BAR_BG = '#111827'
const AMBER = '#F59E0B'

const styles = StyleSheet.create({
  bar: {
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: BAR_BG,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  pillOverriding: {
    borderColor: AMBER,
  },
  devBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: AMBER,
    letterSpacing: 0.8,
  },
  separator: {
    fontSize: 11,
    color: '#6B7280',
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E5E7EB',
    maxWidth: 160,
  },
  overrideDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AMBER,
  },
  chevron: {
    fontSize: 10,
    color: '#9CA3AF',
  },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  realRoleNote: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  realRoleValue: {
    color: AMBER,
    fontWeight: '600',
  },
  list: {
    marginTop: 4,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  optionActive: {
    backgroundColor: '#EFF6FF',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  optionTextActive: {
    fontWeight: '700',
    color: '#1D4ED8',
  },
  checkmark: {
    fontSize: 14,
    color: '#1D4ED8',
    fontWeight: '700',
  },
  resetBtn: {
    marginTop: 14,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },
})
