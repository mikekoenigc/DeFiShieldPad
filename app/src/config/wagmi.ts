import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'DeFi ShieldPad',
  projectId: 'defishieldpad',
  chains: [sepolia],
  ssr: false,
});
