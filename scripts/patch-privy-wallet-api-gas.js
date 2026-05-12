const fs = require('fs');
const path = require('path');

const targets = [
  {
    label: 'esm',
    file: path.join(
      __dirname,
      '..',
      'node_modules',
      '@privy-io',
      'js-sdk-core',
      'dist',
      'esm',
      'embedded',
      'stack',
      'wallet-api-eth-transaction.mjs',
    ),
    from: 'gas_limit:n(t.gasLimit)',
    to: 'gas_limit:n(t.gasLimit??t.gas)',
  },
  {
    label: 'cjs',
    file: path.join(
      __dirname,
      '..',
      'node_modules',
      '@privy-io',
      'js-sdk-core',
      'dist',
      'cjs',
      'embedded',
      'stack',
      'wallet-api-eth-transaction.js',
    ),
    from: 'gas_limit:t(i.gasLimit)',
    to: 'gas_limit:t(i.gasLimit??i.gas)',
  },
];

let patched = 0;

for (const target of targets) {
  try {
    if (!fs.existsSync(target.file)) {
      continue;
    }

    const original = fs.readFileSync(target.file, 'utf8');
    if (original.includes(target.to)) {
      console.log(`[patch-privy-wallet-api-gas] ${target.label} already patched`);
      continue;
    }

    if (!original.includes(target.from)) {
      throw new Error(`expected snippet not found in ${target.file}`);
    }

    fs.writeFileSync(target.file, original.replace(target.from, target.to), 'utf8');
    patched += 1;
    console.log(`[patch-privy-wallet-api-gas] patched ${target.label}`);
  } catch (err) {
    console.error('[patch-privy-wallet-api-gas] failed:', err?.message || err);
    process.exit(1);
  }
}

if (patched === 0) {
  console.log('[patch-privy-wallet-api-gas] no changes needed');
}
