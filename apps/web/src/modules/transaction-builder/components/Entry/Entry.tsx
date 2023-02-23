import React from 'react'
import { Stack, Text } from '@zoralabs/zord'
import ShortcutCollection from '../Shortcut/ShortcutCollection'
import { TransactionType } from '../../constants/transactionTypes'
import AdminNav from './AdminNav'

const Entry = () => {
  const shortcuts = [
    TransactionType.SEND_ETH,
    TransactionType.AIRDROP,
    TransactionType.CUSTOM,
  ]
  return (
    <Stack style={{ maxWidth: 680, minHeight: '80vh' }} mx={'auto'}>
      <Text variant={'heading-xs'} mb={'x5'}>
        Select Transaction Type
      </Text>
      <ShortcutCollection shortcuts={shortcuts} />
      <AdminNav />
    </Stack>
  )
}

export default Entry
