const R = require('ramda')
const Blockchain = require('../blockchain.app')
const Block = require('../block')
const { cryptoHash } = require('../../utils')
const Wallet = require('../../wallet/wallet.app')
const Transaction = require('../../wallet/transaction')

describe('Blockchain', () => {
  let blockchain, newChain, originalChain, errorMock, logMock

  beforeEach(() => {
    blockchain = new Blockchain()
    newChain = new Blockchain()
    originalChain = R.clone(blockchain.chain)
    errorMock = jest.fn()
    global.console.error = errorMock
    logMock = jest.fn()
    global.console.log = logMock
  })

  it('containas a `chain` Array of instance', () => {
    expect(blockchain.chain instanceof Array).toBe(true)
  })

  it('starts with the genesis block', () => {
    expect(blockchain.chain[0]).toEqual(Block.genesis())
  })

  it('adds a new block to the chain', () => {
    const newData = 'new data'
    blockchain.addBlock({ data: newData })
    const lastBlockInChain = blockchain.chain[blockchain.chain.length - 1]
    expect(lastBlockInChain.data).toEqual(newData)
  })

  describe('isValidChain()', () => {
    describe('when the chain does not start with the genesis block', () => {
      it('returns false', () => {
        blockchain = new Blockchain()
        blockchain.chain[0] = { data: 'fake block' }
        expect(Blockchain.isValidChain(blockchain.chain)).toBe(false)
      })
    })

    describe('when the chain starts with the genesis block and has muliple blocks', () => {
      beforeEach(() => {
        blockchain.addBlock({ data: 'a1' })
        blockchain.addBlock({ data: 'a2' })
        blockchain.addBlock({ data: 'a3' })
      })

      describe('and a lastHash reference has change', () => {
        it('returns false', () => {
          blockchain.chain[2].hash = 'fake hash'
          expect(Blockchain.isValidChain(blockchain.chain)).toBe(false)
        })
      })

      describe('and the chain contains a block with an invalid field ', () => {
        it('returns false', () => {
          blockchain.chain[2].data = 'fake data'
          expect(Blockchain.isValidChain(blockchain.chain)).toBe(false)
        })
      })

      describe('and the chain contains a block with a jumped difficulty', () => {
        it('returns false', () => {
          const chain = blockchain.chain
          const lastBlock = chain[chain.length - 1]
          const timestamp = Date.now()
          const lastHash = lastBlock.hash
          const nonce = 0
          const data = []
          const difficulty = lastBlock.difficulty - 2
          const hash = cryptoHash(timestamp, lastHash, nonce, data, difficulty)

          const badBlock = new Block({ timestamp, lastHash, nonce, data, difficulty, hash })
          chain.push(badBlock)

          expect(Blockchain.isValidChain(chain)).toBe(false)
        })
      })

      describe('and the chain does not contain any invalid blocks ', () => {
        it('returns true', () => {
          expect(Blockchain.isValidChain(blockchain.chain)).toBe(true)
        })
      })
    })
  })

  describe('replaceChain()', () => {
    describe('when the new chain is not longer', () => {
      it('does not repleace the chain', () => {
        newChain.chain[0] = { data: 'a1' }
        blockchain.replaceChain(newChain.chain)
        expect(blockchain.chain).toEqual(originalChain)
      })
    })

    describe('when the new chain is longer', () => {
      beforeEach(() => {
        newChain.addBlock({ data: 'a1' })
        newChain.addBlock({ data: 'a2' })
        newChain.addBlock({ data: 'a3' })
      })

      describe('and the new chain is invalid', () => {
        it('does not repleace the chain', () => {
          newChain.chain[2].hash = 'fake hash'
          blockchain.replaceChain(newChain.chain)
          expect(blockchain.chain).toEqual(originalChain)
          expect(errorMock).toHaveBeenCalled()
        })
      })

      describe('and the new chain is valid', () => {
        it('replaces the chain ', () => {
          blockchain.replaceChain(newChain.chain)
          expect(blockchain.chain).toEqual(newChain.chain)
          expect(logMock).toHaveBeenCalled()
        })
      })
    })
  })

  describe('validTransactionData', () => {
    let transaction, rewardTransaction, wallet

    beforeEach(() => {
      wallet = new Wallet()
      transaction = wallet.createTransaction({ recipient: 'foo-recipient', amount: 65 })
      rewardTransaction = Transaction.rewardTransaction({ minerWallet: wallet })
    })

    describe('and the transaction data is valid', () => {
      it('returns true', () => {
        newChain.addBlock({ data: [transaction, rewardTransaction] })
        expect(blockchain.validTransactionData({ chain: newChain.chain })).toBe(true)
        expect(errorMock).not.toHaveBeenCalled()
      })
    })

    describe('and the transaction data has multuple rewards', () => {
      it('returns false and logs an error', () => {
        newChain.addBlock({ data: [transaction, rewardTransaction, rewardTransaction] })
        expect(blockchain.validTransactionData({ chain: newChain.chain })).toBe(false)
        expect(errorMock).toHaveBeenCalled()
      })
    })

    describe('and the transaction data has at least one malformed outputMap', () => {
      describe('and the transaction is not a reward transaction', () => {
        it('returns false and logs an error', () => {
          transaction.outputMap[wallet.publicKey] = 999999
          newChain.addBlock({ data: [transaction, rewardTransaction] })
          expect(blockchain.validTransactionData({ chain: newChain.chain })).toBe(false)
          expect(errorMock).toHaveBeenCalled()
        })
      })

      describe('and the transaction is a reward transaction', () => {
        it('returns false and logs an error', () => {
          rewardTransaction.outputMap[wallet.publicKey] = 999999
          newChain.addBlock({ data: [transaction, rewardTransaction] })
          expect(blockchain.validTransactionData({ chain: newChain.chain })).toBe(false)
          expect(errorMock).toHaveBeenCalled()
        })
      })
    })

    describe('and the transaction data has at least one malformed input', () => {
      it('returns false and logs an error', () => {
        wallet.balance = 9000

        const evilOutputMap = {
          [wallet.publicKey]: 8900,
          fooRecipient: 100,
        }
        const evilTransaction = {
          input: {
            timestamp: Date.now(),
            amount: wallet.balance,
            address: wallet.publicKey,
            signature: wallet.sign(evilOutputMap),
          },
          outputMap: evilOutputMap,
        }

        newChain.addBlock({ data: [evilTransaction, rewardTransaction] })
        expect(blockchain.validTransactionData({ chain: newChain.chain })).toBe(false)
        expect(errorMock).toHaveBeenCalled()
      })
    })

    describe('and a block contains multiple indentical transactions', () => {
      it('returns false and logs an error', () => {
        newChain.addBlock({ data: [transaction, transaction, transaction, rewardTransaction] })
        expect(blockchain.validTransactionData({ chain: newChain.chain })).toBe(false)
        expect(errorMock).toHaveBeenCalled()
      })
    })
  })
})
