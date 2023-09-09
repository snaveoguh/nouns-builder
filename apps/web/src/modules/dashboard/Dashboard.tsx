import { Box, Button, Flex, Text } from '@zoralabs/zord'
import axios from 'axios'
import dayjs from 'dayjs'
import { getFetchableUrl } from 'ipfs-service'
import Image from 'next/image'
import React, { useState } from 'react'
import useSWR, { mutate } from 'swr'
import { formatEther } from 'viem'
import { useAccount, useBalance, useContractEvent } from 'wagmi'

import { Avatar } from 'src/components/Avatar'
import { ContractButton } from 'src/components/ContractButton'
import { Meta } from 'src/components/Meta'
import { PUBLIC_ALL_CHAINS } from 'src/constants/defaultChains'
import SWR_KEYS from 'src/constants/swrKeys'
import { auctionAbi } from 'src/data/contract/abis'
import {
  ProposalState,
  getProposalState,
} from 'src/data/contract/requests/getProposalState'
import {
  CurrentAuctionFragment,
  DaoFragment,
  ProposalFragment,
} from 'src/data/subgraph/sdk.generated'
import { useCountdown, useIsMounted } from 'src/hooks'
import { AddressType, CHAIN_ID } from 'src/typings'
import { formatCryptoVal } from 'src/utils/numbers'

import { useMinBidIncrement } from '../auction'
import { bidInput } from './dashboard.css'

const ACTIVE_PROPOSAL_STATES = [
  ProposalState.Active,
  ProposalState.Pending,
  ProposalState.Queued,
]

type DashboardDao = DaoFragment & {
  chainId: CHAIN_ID
  daoImage: string
  auctionConfig: {
    minimumBidIncrement: string
    reservePrice: string
  }
  proposals: ProposalFragment[]
  currentAuction: CurrentAuctionFragment
}

const fetchDaoProposalState = async (dao: DashboardDao) => {
  const proposals = await Promise.all(
    dao.proposals.map(async (proposal) => {
      const proposalState = await getProposalState(
        dao.chainId,
        proposal.dao.governorAddress,
        proposal.proposalId
      )
      return { ...proposal, proposalState }
    })
  )
  return {
    ...dao,
    proposals: proposals.filter((proposal) =>
      ACTIVE_PROPOSAL_STATES.includes(proposal.proposalState)
    ),
  }
}

const fetchDashboardData = async (address: string) => {
  const userDaos = await axios
    .get<DashboardDao[]>(`/api/dashboard/${address}`)
    .then((x) => x.data)

  const resolved = await Promise.all(userDaos.map(fetchDaoProposalState))
  return resolved
}

const Dashboard = () => {
  const { address } = useAccount()

  const { data, error, isValidating } = useSWR(
    [`${SWR_KEYS.DASHBOARD}:${address}`],
    address ? () => fetchDashboardData(address) : null,
    { revalidateOnFocus: false }
  )

  if (error) {
    return <div>error</div>
  }
  if (isValidating) {
    return <div>loading</div>
  }
  if (!address) {
    return <div>no address</div>
  }
  if (!data) {
    return <div>no data</div>
  }

  return (
    <Flex
      minH={'100vh'}
      pt={{ '@initial': 'x20', '@768': 'x32' }}
      w={'100%'}
      justify="center"
    >
      <Meta title={'Dashboard'} type={'website'} slug={'/'} />
      <Box w="100%" style={{ maxWidth: 912 }}>
        <Text fontSize={35} fontWeight={'display'} mb={'x10'}>
          Dashboard
        </Text>
        <Box mb={'x8'}>
          <Text fontSize={28} fontWeight={'display'} mb={'x6'}>
            DAOs
          </Text>
          {data?.map((dao) => (
            <DaoAuctionCard {...dao} userAddress={address} />
          ))}
        </Box>
        <Box>
          <Text fontSize={28} fontWeight={'display'} mb={'x6'}>
            Proposals
          </Text>
          {data
            .filter((dao) => dao.proposals.length)
            .map((dao) => (
              <DaoProposals {...dao} />
            ))}
        </Box>
      </Box>
    </Flex>
  )
}

export default Dashboard

const DashCountdown = ({
  endTime,
  onEnd,
  isOver,
}: {
  endTime: string | null
  onEnd: () => void
  isOver: boolean
}) => {
  const { countdownString } = useCountdown(Number(endTime), onEnd)
  const isMounted = useIsMounted()
  const countdownText = !endTime || isOver ? 'N/A' : countdownString
  if (!isMounted) return null
  return (
    <Text fontSize={18} fontWeight="label">
      {countdownText}
    </Text>
  )
}

const DaoAuctionCard = ({
  currentAuction,
  chainId,
  auctionAddress,
  userAddress,
  auctionConfig,
}: DashboardDao & { userAddress: AddressType }) => {
  const { name: chainName, icon: chainIcon } =
    PUBLIC_ALL_CHAINS.find((chain) => chain.id === chainId) ?? {}

  const { endTime, highestBid } = currentAuction
  const { minimumBidIncrement, reservePrice } = auctionConfig
  const [bidAmount, setBidAmount] = useState('')
  const [isEnded, setIsEnded] = useState(false)

  const { data: balance } = useBalance({ address: userAddress, chainId })

  const bidText = currentAuction.highestBid?.amount
    ? formatEther(BigInt(currentAuction.highestBid.amount))
    : 'N/A'

  const { minBidAmount } = useMinBidIncrement({
    highestBid: highestBid?.amount ? BigInt(highestBid?.amount) : undefined,
    reservePrice: BigInt(reservePrice),
    minBidIncrement: BigInt(minimumBidIncrement),
  })
  const formattedMinBid = formatCryptoVal(minBidAmount)
  const isOver = !!endTime ? dayjs.unix(Date.now() / 1000) >= dayjs.unix(endTime) : true
  const onEnd = () => {
    setIsEnded(true)
  }

  useContractEvent({
    address: auctionAddress,
    abi: auctionAbi,
    eventName: 'AuctionCreated',
    chainId,
    listener: async () => {
      await mutate([`${SWR_KEYS.DASHBOARD}:${userAddress}`, userAddress], () =>
        fetchDashboardData(userAddress)
      )
    },
  })
  useContractEvent({
    address: auctionAddress,
    abi: auctionAbi,
    eventName: 'AuctionBid',
    chainId,
    listener: async () => {
      await mutate([`${SWR_KEYS.DASHBOARD}:${userAddress}`, userAddress], () =>
        fetchDashboardData(userAddress)
      )
    },
  })

  return (
    <Flex
      mb={'x4'}
      w={'100%'}
      borderColor={'border'}
      borderStyle={'solid'}
      borderRadius={'curved'}
      borderWidth={'normal'}
      cursor={'pointer'}
      py={{ '@initial': 'x2', '@768': 'x3' }}
      px={{ '@initial': 'x2', '@768': 'x6' }}
      align={'center'}
    >
      <Box mr="x6">
        <Image
          src={currentAuction.token.image}
          layout="fixed"
          objectFit="contain"
          style={{ borderRadius: '12px' }}
          alt=""
          height={64}
          width={64}
        />
      </Box>
      <Flex
        direction={'column'}
        style={{
          width: '30%',
        }}
      >
        <Flex mb="x1" align="center">
          {chainIcon && (
            <Image
              src={chainIcon}
              layout="fixed"
              objectFit="contain"
              style={{ borderRadius: '12px', maxHeight: '22px' }}
              alt=""
              height={22}
              width={22}
            />
          )}
          <Text fontSize={16} color="text3" ml={'x1'}>
            {chainName}
          </Text>
        </Flex>
        <Text fontSize={20} fontWeight="label">
          {currentAuction.token.name}
        </Text>
      </Flex>
      <Flex
        direction={'column'}
        style={{
          width: '15%',
        }}
      >
        <Text fontSize={16} color="text3" mb={'x1'}>
          Current Bid
        </Text>
        <Text fontSize={18} fontWeight="label">
          {bidText}
        </Text>
      </Flex>
      <Flex
        direction={'column'}
        style={{
          width: '15%',
        }}
      >
        <Text fontSize={16} color="text3" mb={'x1'}>
          Ends In
        </Text>
        <DashCountdown endTime={endTime} onEnd={onEnd} isOver={isOver} />
      </Flex>
      <form>
        <Box position="relative" mr={{ '@initial': 'x0', '@768': 'x2' }}>
          <input
            className={bidInput}
            placeholder={`${formattedMinBid} ETH`}
            type={'number'}
            min={formattedMinBid}
            max={balance?.formatted}
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
          />
          <Flex
            position="absolute"
            style={{ top: 0, right: 0, bottom: 0 }}
            align={'center'}
            justify={'center'}
          >
            <Button
              height={'100%'}
              mr={'x4'}
              px={'x0'}
              fontWeight={'label'}
              size="sm"
              variant="ghost"
              style={{
                minWidth: 'fit-content',
                fontWeight: 500,
                paddingLeft: 0,
                paddingRight: 0,
              }}
              onClick={() => setBidAmount(formattedMinBid)}
              disabled={bidAmount >= formattedMinBid}
            >
              Min
            </Button>
          </Flex>
        </Box>
      </form>
      <ContractButton handleClick={() => {}} borderRadius={'curved'}>
        Bid
      </ContractButton>
    </Flex>
  )
}

const DaoProposals = ({ daoImage, tokenAddress, name, proposals }: DashboardDao) => {
  const daoImageSrc = React.useMemo(() => {
    return daoImage ? getFetchableUrl(daoImage) : null
  }, [daoImage])
  return (
    <Box>
      <Flex justify={'space-between'} mb={'x6'}>
        <Flex align={'center'}>
          {daoImageSrc ? (
            <Box mr="x4">
              <Image
                src={daoImageSrc}
                layout="fixed"
                objectFit="contain"
                style={{ borderRadius: '12px' }}
                alt=""
                height={48}
                width={48}
              />
            </Box>
          ) : (
            <Box mr="x4" borderRadius="phat">
              <Avatar address={tokenAddress ?? undefined} size="52" />
            </Box>
          )}
          <Text fontSize={20} fontWeight="label">
            {name}
          </Text>
        </Flex>

        <Button variant="outline" borderRadius="curved">
          Submit Proposal
        </Button>
      </Flex>
      {proposals.map((proposal) => (
        <DaoProposalCard {...proposal} />
      ))}
    </Box>
  )
}

const DaoProposalCard = ({ title, proposalNumber }: ProposalFragment) => {
  return (
    <Flex
      mb={'x4'}
      w={'100%'}
      borderColor={'border'}
      borderStyle={'solid'}
      borderRadius={'curved'}
      borderWidth={'normal'}
      cursor={'pointer'}
      py={{ '@initial': 'x2', '@768': 'x6' }}
      px={{ '@initial': 'x2', '@768': 'x3' }}
    >
      <Flex>
        <Text fontSize={18} fontWeight="label" color={'text4'} mr={'x4'}>
          {proposalNumber}
        </Text>
        <Text fontSize={18} fontWeight="label">
          {title}
        </Text>
      </Flex>
    </Flex>
  )
}
