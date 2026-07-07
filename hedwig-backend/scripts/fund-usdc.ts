import { 
  Keypair, 
  TransactionBuilder, 
  Asset, 
  Operation, 
  BASE_FEE,
  Networks,
  Horizon,
  Memo
} from '@stellar/stellar-sdk';

const DISTRIBUTION_SEED = 'SARO2HATZ67GCBDLHWMG5XU2BEYDAQQMXANYFHZRCSUO24UZZQ5YJWRI';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const USDC_CODE = 'USDC';

async function main() {
  const server = new Horizon.Server(HORIZON_URL);
  const keypair = Keypair.fromSecret(DISTRIBUTION_SEED);
  const publicKey = keypair.publicKey();
  
  console.log('Distribution account:', publicKey);
  
  const account = await server.loadAccount(publicKey);
  console.log('Sequence:', account.sequenceNumber);
  
  const xlmBalance = account.balances.find((b: any) => b.asset_type === 'native');
  console.log('XLM balance:', xlmBalance?.balance);
  
  const usdcBalance = account.balances.find(
    (b: any) => b.asset_type === 'credit_alphanum4' && b.asset_code === USDC_CODE
  );
  console.log('USDC balance:', usdcBalance?.balance || 'no trustline');
  
  if (!usdcBalance) {
    console.log('Establishing USDC trustline...');
    const usdcAsset = new Asset(USDC_CODE, USDC_ISSUER);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.changeTrust({ asset: usdcAsset, limit: '100000' }))
      .setTimeout(30)
      .build();
    tx.sign(keypair);
    const result = await server.submitTransaction(tx);
    console.log('Trustline established. Hash:', result.hash);
  }
  
  // Use path payment strict send to swap 500 XLM for USDC
  // This sends XLM and expects USDC back, using the DEX
  console.log('\nSwapping 500 XLM for USDC on DEX...');
  
  const usdcAsset = new Asset(USDC_CODE, USDC_ISSUER);
  const nativeAsset = Asset.native();
  
  const tx2 = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.payment({
      destination: publicKey,
      asset: usdcAsset,
      amount: '10', // 10 USDC - might fail if no offers on DEX
      source: publicKey, // send from self
    }))
    .setTimeout(30)
    .build();

  // Actually, let's try a simpler approach: path payment
  const account2 = await server.loadAccount(publicKey);
  const tx3 = new TransactionBuilder(account2, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.pathPaymentStrictSend({
      sendAsset: nativeAsset,
      sendAmount: '500',
      destination: publicKey,
      destAsset: usdcAsset,
      destMin: '1', // receive at least 1 USDC
    }))
    .setTimeout(30)
    .build();
  
  tx3.sign(keypair);
  
  try {
    const result2 = await server.submitTransaction(tx3);
    console.log('Swap successful! Hash:', result2.hash);
  } catch (e: any) {
    console.log('Path payment failed:', e.response?.data?.extras?.result_codes || e.message);
    console.log('The testnet DEX may not have USDC/XLM liquidity.');
    console.log('Try funding via https://faucet.circle.com/ instead.');
  }
  
  // Check final balance
  const { data } = await server.loadAccount(publicKey);
  // @ts-ignore
  const finalUsdc = data.balances.find((b: any) => b.asset_type === 'credit_alphanum4' && b.asset_code === USDC_CODE);
  console.log('\nFinal USDC balance:', finalUsdc?.balance || '0');
}

main().catch(console.error);
