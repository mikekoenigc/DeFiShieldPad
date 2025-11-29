import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div>
          <p className="app-header__eyebrow">Confidential liquidity</p>
          <h1 className="app-header__title">DeFi ShieldPad</h1>
          <p className="app-header__subtitle">
            Stake cZAMA, mint cUSDT, and run private credit positions secured by Zama FHE.
          </p>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
