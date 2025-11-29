import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract, ethers } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { Header } from './Header';
import {
  SHIELD_VAULT_ADDRESS,
  VAULT_ABI,
  CZAMA_ADDRESS,
  CUSDT_ADDRESS,
  TOKEN_ABI,
  TOKEN_DECIMALS,
} from '../config/contracts';
import '../styles/ShieldPadApp.css';

type EncryptedResult = {
  handles: string[];
  inputProof: string;
};

const formatAmount = (value: bigint) => {
  const divisor = 10n ** BigInt(TOKEN_DECIMALS);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) {
    return whole.toString();
  }
  return `${whole}.${fraction.toString().padStart(TOKEN_DECIMALS, '0').replace(/0+$/, '')}`;
};

const shortenHandle = (handle?: string) => {
  if (!handle || handle === ethers.ZeroHash) {
    return '—';
  }
  return `${handle.slice(0, 6)}…${handle.slice(-4)}`;
};

const buildDecryptKey = (handle?: string, contract?: string) => {
  if (!handle || !contract) {
    return '';
  }
  return `${contract}:${handle}`;
};

export function ShieldPadApp() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [stakeAmount, setStakeAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [decryptingKey, setDecryptingKey] = useState<string | null>(null);
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({});

  const {
    data: czamaBalanceHandle,
    refetch: refetchZamaBalance,
  } = useReadContract({
    address: CZAMA_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const {
    data: cusdtBalanceHandle,
    refetch: refetchUsdtBalance,
  } = useReadContract({
    address: CUSDT_ADDRESS,
    abi: TOKEN_ABI,
    functionName: 'confidentialBalanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const {
    data: stakedHandle,
    refetch: refetchStake,
  } = useReadContract({
    address: SHIELD_VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'getStakedBalance',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const {
    data: borrowedHandle,
    refetch: refetchBorrow,
  } = useReadContract({
    address: SHIELD_VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'getBorrowedBalance',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: claimedZamaData, refetch: refetchClaims } = useReadContract({
    address: SHIELD_VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'hasClaimedCZAMA',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const { data: claimedUsdtData } = useReadContract({
    address: SHIELD_VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'hasClaimedCUSDT',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  const hasClaimedZama = Boolean(claimedZamaData);
  const hasClaimedUsdt = Boolean(claimedUsdtData);

  const refreshAll = () => {
    refetchZamaBalance?.();
    refetchUsdtBalance?.();
    refetchStake?.();
    refetchBorrow?.();
    refetchClaims?.();
  };

  const resolveSigner = async () => {
    const signer = await signerPromise;
    if (!signer) {
      throw new Error('Connect a wallet to continue.');
    }
    return signer;
  };

  const parseAmount = (value: string) => {
    const normalized = value.trim();
    if (!normalized) {
      throw new Error('Enter an amount first.');
    }
    const parsed = ethers.parseUnits(normalized, TOKEN_DECIMALS);
    if (parsed <= 0n) {
      throw new Error('Amount must be greater than zero.');
    }
    return parsed;
  };

  const encryptAmount = async (value: string): Promise<EncryptedResult> => {
    if (!instance || !address) {
      throw new Error('Encryption service not ready yet.');
    }
    const units = parseAmount(value);
    const buffer = instance.createEncryptedInput(SHIELD_VAULT_ADDRESS, address);
    buffer.add64(units);
    return buffer.encrypt();
  };

  const handleClaim = async (token: 'czama' | 'cusdt') => {
    if (!address) {
      setStatusMessage('Connect a wallet first.');
      return;
    }
    setPendingAction(`claim-${token}`);
    setStatusMessage(null);
    try {
      const signer = await resolveSigner();
      const vault = new Contract(SHIELD_VAULT_ADDRESS, VAULT_ABI, signer);
      const tx =
        token === 'czama'
          ? await vault.claimCZama()
          : await vault.claimCUSDT();
      await tx.wait();
      setStatusMessage(`Claimed ${token === 'czama' ? 'cZAMA' : 'cUSDT'} successfully.`);
      refreshAll();
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleAuthorization = async () => {
    if (!address) {
      setStatusMessage('Connect a wallet first.');
      return;
    }
    setPendingAction('authorize');
    setStatusMessage(null);
    try {
      const signer = await resolveSigner();
      const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      const czama = new Contract(CZAMA_ADDRESS, TOKEN_ABI, signer);
      const cusdt = new Contract(CUSDT_ADDRESS, TOKEN_ABI, signer);
      const tx1 = await czama.setOperator(SHIELD_VAULT_ADDRESS, expiry);
      await tx1.wait();
      const tx2 = await cusdt.setOperator(SHIELD_VAULT_ADDRESS, expiry);
      await tx2.wait();
      setStatusMessage('Protocol permissions granted for both tokens.');
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleEncryptedAction = async (
    kind: 'stake' | 'unstake' | 'borrow' | 'repay',
    value: string
  ) => {
    if (!address) {
      setStatusMessage('Connect a wallet first.');
      return;
    }
    setPendingAction(kind);
    setStatusMessage(null);
    try {
      const encrypted = await encryptAmount(value);
      const signer = await resolveSigner();
      const vault = new Contract(SHIELD_VAULT_ADDRESS, VAULT_ABI, signer);
      let tx;
      if (kind === 'stake') {
        tx = await vault.stakeCZama(encrypted.handles[0], encrypted.inputProof);
      } else if (kind === 'unstake') {
        tx = await vault.unstakeCZama(encrypted.handles[0], encrypted.inputProof);
      } else if (kind === 'borrow') {
        tx = await vault.borrowCUSDT(encrypted.handles[0], encrypted.inputProof);
      } else {
        tx = await vault.repayCUSDT(encrypted.handles[0], encrypted.inputProof);
      }
      await tx.wait();
      const messageMap = {
        stake: 'Staked cZAMA successfully.',
        unstake: 'Unstaked cZAMA.',
        borrow: 'Borrowed cUSDT successfully.',
        repay: 'Loan position updated.',
      };
      setStatusMessage(messageMap[kind]);
      refreshAll();
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setPendingAction(null);
    }
  };

  const handleDecrypt = async (handle?: string, contract?: string) => {
    if (!address || !contract) {
      setStatusMessage('Connect a wallet first.');
      return;
    }
    const key = buildDecryptKey(handle, contract);
    if (!key) {
      setStatusMessage('Nothing to decrypt yet.');
      return;
    }
    if (handle === ethers.ZeroHash) {
      setDecryptedValues(prev => ({ ...prev, [key]: '0' }));
      return;
    }
    if (!instance) {
      setStatusMessage('Encryption service not ready yet.');
      return;
    }
    setDecryptingKey(key);
    setStatusMessage(null);
    try {
      const keypair = instance.generateKeypair();
      const start = Math.floor(Date.now() / 1000).toString();
      const duration = '10';
      const payload = instance.createEIP712(keypair.publicKey, [contract], start, duration);
      const signer = await resolveSigner();
      const signature = await signer.signTypedData(
        payload.domain,
        { UserDecryptRequestVerification: payload.types.UserDecryptRequestVerification },
        payload.message
      );
      const result = await instance.userDecrypt(
        [{ handle, contractAddress: contract }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        [contract],
        address,
        start,
        duration
      );
      const rawValue = result[handle as string] ?? '0';
      const formatted = formatAmount(BigInt(rawValue));
      setDecryptedValues(prev => ({ ...prev, [key]: formatted }));
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setDecryptingKey(null);
    }
  };

  const renderBalanceRow = (
    label: string,
    handle?: string,
    contract?: string
  ) => {
    const key = buildDecryptKey(handle, contract);
    const decrypted = key ? decryptedValues[key] : undefined;
    const isDecrypting = decryptingKey === key;

    return (
      <div className="balance-row" key={label}>
        <div>
          <p className="balance-label">{label}</p>
          <p className="balance-handle">{shortenHandle(handle)}</p>
        </div>
        <div className="balance-actions">
          <button
            className="secondary-button"
            onClick={() => handleDecrypt(handle, contract)}
            disabled={!address || isDecrypting}
          >
            {isDecrypting ? 'Decrypting…' : 'Decrypt'}
          </button>
          <span className="balance-value">{decrypted ?? 'Encrypted'}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="shieldpad-app">
      <Header />
      <main className="shieldpad-main">
        {zamaError && (
          <div className="shieldpad-banner shieldpad-banner--warning">
            Encryption relay error: {zamaError}
          </div>
        )}
        {zamaLoading && (
          <div className="shieldpad-banner">Connecting to Zama relayer…</div>
        )}
        <section className="shieldpad-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Faucet</p>
              <h2>Claim starter balances</h2>
              <p>Mint confidential starter liquidity before staking or borrowing.</p>
            </div>
          </div>
          <div className="action-buttons">
            <button
              onClick={() => handleClaim('czama')}
              disabled={!address || hasClaimedZama || pendingAction === 'claim-czama'}
            >
              {pendingAction === 'claim-czama' ? 'Claiming…' : 'Claim cZAMA'}
            </button>
            <button
              onClick={() => handleClaim('cusdt')}
              disabled={!address || hasClaimedUsdt || pendingAction === 'claim-cusdt'}
            >
              {pendingAction === 'claim-cusdt' ? 'Claiming…' : 'Claim cUSDT'}
            </button>
            <button
              className="secondary-button"
              onClick={handleAuthorization}
              disabled={!address || pendingAction === 'authorize'}
            >
              {pendingAction === 'authorize' ? 'Authorizing…' : 'Authorize protocol'}
            </button>
          </div>
        </section>

        <section className="shieldpad-card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Encrypted balances</p>
              <h2>Your confidential positions</h2>
              <p>Decrypt values locally whenever you need a clear-text view.</p>
            </div>
          </div>
          <div className="balances">
            {renderBalanceRow('cZAMA wallet', czamaBalanceHandle as string, CZAMA_ADDRESS)}
            {renderBalanceRow('cUSDT wallet', cusdtBalanceHandle as string, CUSDT_ADDRESS)}
            {renderBalanceRow('Staked cZAMA', stakedHandle as string, SHIELD_VAULT_ADDRESS)}
            {renderBalanceRow('Borrowed cUSDT', borrowedHandle as string, SHIELD_VAULT_ADDRESS)}
          </div>
        </section>

        <section className="shieldpad-grid">
          <div className="shieldpad-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Stake</p>
                <h2>Deposit cZAMA</h2>
                <p>Provide collateral for private credit lines.</p>
              </div>
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="action-buttons">
              <button
                onClick={() => handleEncryptedAction('stake', stakeAmount)}
                disabled={!address || pendingAction === 'stake'}
              >
                {pendingAction === 'stake' ? 'Submitting…' : 'Stake cZAMA'}
              </button>
              <button
                className="secondary-button"
                onClick={() => handleEncryptedAction('unstake', unstakeAmount)}
                disabled={!address || pendingAction === 'unstake'}
              >
                {pendingAction === 'unstake' ? 'Submitting…' : 'Unstake'}
              </button>
            </div>
            <div className="form-group">
              <label>Unstake amount</label>
              <input
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="shieldpad-card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Borrow</p>
                <h2>Mint cUSDT loans</h2>
                <p>Draw cUSDT against the encrypted stake.</p>
              </div>
            </div>
            <div className="form-group">
              <label>Borrow amount</label>
              <input
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="action-buttons">
              <button
                onClick={() => handleEncryptedAction('borrow', borrowAmount)}
                disabled={!address || pendingAction === 'borrow'}
              >
                {pendingAction === 'borrow' ? 'Submitting…' : 'Borrow cUSDT'}
              </button>
            </div>
            <div className="form-group">
              <label>Repay amount</label>
              <input
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="action-buttons">
              <button
                className="secondary-button"
                onClick={() => handleEncryptedAction('repay', repayAmount)}
                disabled={!address || pendingAction === 'repay'}
              >
                {pendingAction === 'repay' ? 'Submitting…' : 'Repay loan'}
              </button>
            </div>
          </div>
        </section>

        {statusMessage && (
          <div className="shieldpad-banner">{statusMessage}</div>
        )}

        {!address && (
          <div className="shieldpad-banner shieldpad-banner--info">
            Connect your wallet to start working with confidential balances.
          </div>
        )}
      </main>
    </div>
  );
}
