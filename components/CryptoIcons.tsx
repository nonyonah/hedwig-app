import React from 'react';
import { Image, View } from 'react-native';
import { CurrencyNgn, CurrencyDollar } from 'phosphor-react-native';

// Network icon images
const BaseIcon = require('../assets/icons/networks/base.png');
const CeloIcon = require('../assets/icons/networks/celo.png');
const LiskIcon = require('../assets/icons/networks/lisk.png');
const PolygonIcon = require('../assets/icons/networks/polygon.png');
const SolanaIcon = require('../assets/icons/networks/solana.png');
const OptimismIcon = require('../assets/icons/networks/optimism.png');
const ArbitrumIcon = require('../assets/icons/networks/arbitrum.png');

// Token icon images
const ETHIcon = require('../assets/icons/tokens/eth.png');
const USDCIcon = require('../assets/icons/tokens/usdc.png');
const USDTIcon = require('../assets/icons/tokens/usdt.png');

// --- Networks ---
export const NetworkBase = (props: any) => (
    <Image
        source={BaseIcon}
        style={{ width: props.width || 24, height: props.height || 24, borderRadius: (props.width || 24) / 2 }}
        resizeMode="contain"
    />
);

export const NetworkSolana = (props: any) => (
    <Image
        source={SolanaIcon}
        style={{ width: props.width || 24, height: props.height || 24, borderRadius: (props.width || 24) / 2 }}
        resizeMode="contain"
    />
);

export const NetworkCelo = (props: any) => (
    <Image
        source={CeloIcon}
        style={{ width: props.width || 24, height: props.height || 24, borderRadius: (props.width || 24) / 2 }}
        resizeMode="contain"
    />
);

export const NetworkLisk = (props: any) => (
    <Image
        source={LiskIcon}
        style={{ width: props.width || 24, height: props.height || 24, borderRadius: (props.width || 24) / 2 }}
        resizeMode="contain"
    />
);

export const NetworkOptimism = (props: any) => (
    <Image
        source={OptimismIcon}
        style={{ width: props.width || 24, height: props.height || 24, borderRadius: (props.width || 24) / 2 }}
        resizeMode="contain"
    />
);

export const NetworkPolygon = (props: any) => (
    <Image
        source={PolygonIcon}
        style={{ width: props.width || 24, height: props.height || 24, borderRadius: (props.width || 24) / 2 }}
        resizeMode="contain"
    />
);

export const NetworkArbitrumOne = (props: any) => (
    <Image
        source={ArbitrumIcon}
        style={{ width: props.width || 24, height: props.height || 24, borderRadius: (props.width || 24) / 2 }}
        resizeMode="contain"
    />
);

// --- Tokens ---
export const TokenETH = (props: any) => (
    <Image
        source={ETHIcon}
        style={{ width: props.width || 32, height: props.height || 32, borderRadius: (props.width || 32) / 2 }}
        resizeMode="contain"
    />
);

export const TokenUSDC = (props: any) => (
    <Image
        source={USDCIcon}
        style={{ width: props.width || 32, height: props.height || 32, borderRadius: (props.width || 32) / 2 }}
        resizeMode="contain"
    />
);

export const TokenUSDT = (props: any) => (
    <Image
        source={USDTIcon}
        style={{ width: props.width || 32, height: props.height || 32, borderRadius: (props.width || 32) / 2 }}
        resizeMode="contain"
    />
);

export const TokenMATIC = (props: any) => (
    <Image
        source={PolygonIcon}
        style={{ width: props.width || 32, height: props.height || 32, borderRadius: (props.width || 32) / 2 }}
        resizeMode="contain"
    />
);

export const TokenSOL = (props: any) => (
    <Image
        source={SolanaIcon}
        style={{ width: props.width || 32, height: props.height || 32, borderRadius: (props.width || 32) / 2 }}
        resizeMode="contain"
    />
);

export const TokenCELO = (props: any) => (
    <Image
        source={CeloIcon}
        style={{ width: props.width || 32, height: props.height || 32, borderRadius: (props.width || 32) / 2 }}
        resizeMode="contain"
    />
);

export const TokenCUSD = (props: any) => (
    <View style={{ width: props.width || 32, height: props.height || 32, borderRadius: (props.width || 32) / 2, backgroundColor: '#45D07F', justifyContent: 'center', alignItems: 'center' }}>
        <CurrencyDollar size={(props.width || 32) * 0.6} color="white" weight="bold" />
    </View>
);

export const TokenCNGN = (props: any) => (
    <View style={{ width: props.width || 32, height: props.height || 32, borderRadius: (props.width || 32) / 2, backgroundColor: '#008751', justifyContent: 'center', alignItems: 'center' }}>
        <CurrencyNgn size={(props.width || 32) * 0.6} color="white" weight="bold" />
    </View>
);
