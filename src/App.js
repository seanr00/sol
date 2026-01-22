import React, { useState } from 'react';
import { AlertCircle, Wallet, Check } from 'lucide-react';

export default function PhantomMultiSigDApp() {
  const [wallet, setWallet] = useState(null);
  const [walletType, setWalletType] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [signature, setSignature] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [apiKey, setApiKey] = useState('e596e7d1-1e3e-423f-b173-c3264aa44a0a');
  const [apiKeySet, setApiKeySet] = useState(true);

  const connectWallet = async (type) => {
    try {
      setError('');
      setStatus('');
      
      let provider;
      
      if (type === 'phantom') {
        if (!window.solana || !window.solana.isPhantom) {
          setError('Phantom wallet not found. Please install Phantom.');
          return;
        }
        provider = window.solana;
      } else if (type === 'solflare') {
        if (!window.solflare || !window.solflare.isSolflare) {
          setError('Solflare wallet not found. Please install Solflare.');
          return;
        }
        provider = window.solflare;
      }

      const response = await provider.connect();
      
      // Get public key - different wallets have different response structures
      let publicKey;
      if (response.publicKey) {
        publicKey = response.publicKey.toString();
      } else if (provider.publicKey) {
        publicKey = provider.publicKey.toString();
      } else {
        throw new Error('Failed to get public key from wallet');
      }
      
      setWallet(publicKey);
      setWalletType(type);
      setStatus(`${type === 'phantom' ? 'Phantom' : 'Solflare'} wallet connected successfully!`);
    } catch (err) {
      setError(`Failed to connect: ${err.message}`);
    }
  };

  const signTransaction = async () => {
    try {
      setError('');
      setStatus('Preparing transaction...');
      setSignature('');
      setTxSignature('');

      const provider = walletType === 'phantom' ? window.solana : window.solflare;
      
      if (!provider || !wallet) {
        setError('Please connect your wallet first');
        return;
      }

      const { Connection, PublicKey, Transaction, TransactionInstruction } = window.solanaWeb3;
      
      // Use Helius RPC with API key
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
      const connection = new Connection(rpcUrl, 'confirmed');
      
      setStatus('Fetching blockhash from Helius...');
      
      // Get recent blockhash with lastValidBlockHeight for reliable confirmation
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      
      // Add memo instruction (simplified - only requires your signature)
      const memoData = new Uint8Array([77, 117, 108, 116, 105, 45, 115, 105, 103]); // "Multi-sig"
      const memoInstruction = new TransactionInstruction({
        keys: [
          { pubkey: new PublicKey(wallet), isSigner: true, isWritable: false },
        ],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: memoData,
      });
      
      // Create a transaction
      const transaction = new Transaction().add(memoInstruction);
      transaction.feePayer = provider.publicKey;
      transaction.recentBlockhash = blockhash;

      setStatus(`Waiting for approval in ${walletType === 'phantom' ? 'Phantom' : 'Solflare'}...`);
      
      // Request signature AND submission from wallet
      const { signature: txSig } = await provider.signAndSendTransaction(transaction);
      
      console.log('Transaction signature:', txSig);
      
      setSignature(txSig.slice(0, 32) + '...');
      setTxSignature(txSig);
      
      setStatus('✓ Transaction signed and submitted!');
      
      // Wait for confirmation
      setStatus('Confirming transaction...');
      await connection.confirmTransaction(
        {
          signature: txSig,
          blockhash,
          lastValidBlockHeight
        },
        'confirmed'
      );
      
      setStatus('✓ Transaction confirmed on blockchain!');
      
    } catch (err) {
      console.error('Full error:', err);
      setError(`Transaction failed: ${err.message || 'Unknown error'}`);
      setStatus('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-700 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="inline-block p-3 bg-purple-100 rounded-full mb-4">
            <Wallet className="w-8 h-8 text-purple-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Solana Wallet dApp</h1>
          <p className="text-gray-600">Phantom & Solflare Support</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {status && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
            <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">{status}</p>
          </div>
        )}

        {!apiKeySet ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Helius API Key
              </label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your Helius API key"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => {
                if (apiKey.trim()) {
                  setApiKeySet(true);
                  setStatus('API key set! Now connect your wallet.');
                } else {
                  setError('Please enter a valid API key');
                }
              }}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              Set API Key
            </button>
            <p className="text-xs text-gray-500 text-center">
              Get a free API key at{' '}
              <a href="https://www.helius.dev/" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
                helius.dev
              </a>
            </p>
          </div>
        ) : !wallet ? (
          <div className="space-y-3">
            <button
              onClick={() => connectWallet('phantom')}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <Wallet className="w-5 h-5" />
              Connect Phantom Wallet
            </button>
            <button
              onClick={() => connectWallet('solflare')}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <Wallet className="w-5 h-5" />
              Connect Solflare Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Your Wallet</p>
              <p className="text-sm font-mono text-gray-800 break-all">{wallet}</p>
            </div>

            <button
              onClick={signTransaction}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              Sign & Send Transaction
            </button>

            {signature && (
              <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <p className="text-xs text-green-700 font-semibold mb-1">✓ Transaction Submitted</p>
                <p className="text-xs font-mono text-green-800 break-all">{signature}</p>
              </div>
            )}

            {txSignature && (
              <a
                href={`https://explorer.solana.com/tx/${txSignature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-blue-50 rounded-lg border-2 border-blue-200 hover:bg-blue-100 transition-colors"
              >
                <p className="text-xs text-blue-700 font-semibold mb-2">View on Solana Explorer</p>
                <p className="text-xs font-mono text-blue-800 break-all mb-2">{txSignature}</p>
                <p className="text-xs text-blue-600">Click to view →</p>
              </a>
            )}

            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-800">
                <strong>Note:</strong> This will sign and submit a memo transaction to the Solana blockchain. You'll need to approve the transaction in your wallet.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Network: Solana Mainnet-Beta
          </p>
        </div>
      </div>

      <script src="https://cdnjs.cloudflare.com/ajax/libs/solana-web3.js/1.87.6/solana-web3.min.js"></script>
    </div>
  );
}