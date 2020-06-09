const TransactionPool = require('../transaction-pool')
const Transaction = require('../transaction')
const Wallet = require('../wallet.app')

describe('TransactionPool', () => {
  let transactionPool, transaction

  beforeEach(() => {
    transactionPool = new TransactionPool()
    transaction = new Transaction({
      senderWallet: new Wallet(),
      recipient: 'foo-recipient',
      amount: 50,
    })
  })

  describe('setTransaction()', () => {
    it('adds a transaction', () => {
      transactionPool.setTransaction(transaction)
      expect(transactionPool.transactionMap[transaction.id]).toBe(transaction)
    })
  })
})