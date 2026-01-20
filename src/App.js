import React, { useState } from 'react';
import { AlertCircle, Wallet, Check } from 'lucide-react';

export default function PhantomMultiSigDApp() {
  const [wallet, setWallet] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [signature, setSignature] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [apiKey, setApiKey] = useState('e596e7d1-1e3e-423f-b173-c3264aa44a0a');
  const [apiKeySet, setApiKeySet] = useState(true);

  const REQUIRED_SIGNER = 'AeNzsm4mMEmzogE9fbZ9MHz8x5S3F2iyJpgiVykKFkjJ';

  const connectWallet = async () => {
    try {
      setError('');
      setStatus('');
      
      if (!window.solana || !window.solana.isPhantom) {
        setError('Phantom wallet not found. Please install Phantom.');
        return;
      }

      const response = await window.solana.connect();
      setWallet(response.publicKey.toString());
      setStatus('Wallet connected successfully!');
    } catch (err) {
      setError(`Failed to connect: ${err.message}`);
    }
  };

  const signTransaction = async () => {
    try {
      setError('');
      setStatus('Preparing transaction...');
      setSignature('');

      if (!window.solana || !wallet) {
        setError('Please connect your wallet first');
        return;
      }

      const { Connection, PublicKey, Transaction, TransactionInstruction } = window.solanaWeb3;
      
      // Use Helius RPC with API key
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
      const connection = new Connection(rpcUrl, 'confirmed');
      
      setStatus('Fetching blockhash from Helius...');
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      
      // Create a transaction
      const transaction = new Transaction();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(wallet);

      // Add memo instruction that requires both signers
      const memoData = new Uint8Array([77, 117, 108, 116, 105, 45, 115, 105, 103]); // "Multi-sig"
      const memoInstruction = new TransactionInstruction({
        keys: [
          { pubkey: new PublicKey(wallet), isSigner: true, isWritable: false },
          { pubkey: new PublicKey(REQUIRED_SIGNER), isSigner: true, isWritable: false },
        ],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: memoData,
      });
      
      transaction.add(memoInstruction);

      setStatus('Waiting for signature in Phantom...');
      
      // Request signature from Phantom
      const signed = await window.solana.signTransaction(transaction);
      
      console.log('Signed transaction:', signed);
      console.log('All signatures:', signed.signatures);
      
      // Get transaction signature (txid) - it's already in the transaction
      // The signature is the first signature in base58 format
      const txSig = signed.signatures[0] && signed.signatures[0].signature 
        ? Buffer.from(signed.signatures[0].signature).toString('base64')
        : 'pending';
      
      console.log('Transaction signature:', txSig);
      
      // For explorer, we need the actual transaction hash
      // Since the transaction hasn't been sent, we'll use a placeholder
      // In a real scenario, you'd get this after sending the transaction
      
      // Extract signature
      const sig = signed.signatures.find(s => 
        s.publicKey.toString() === wallet
      );
      
      console.log('User signature object:', sig);
      
      if (sig && sig.signature) {
        const sigString = Buffer.from(sig.signature).toString('hex');
        console.log('User signature (hex):', sigString);
        console.log('User signature (base64):', Buffer.from(sig.signature).toString('base64'));
        setSignature(sigString.slice(0, 32) + '...');
        setTxSignature(sigString);
      }
      
      setStatus('✓ Transaction signed! (Requires second signature to submit)');
      
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
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Multi-Sig dApp</h1>
          <p className="text-gray-600">Solana Mainnet Transaction</p>
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
          <button
            onClick={connectWallet}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <Wallet className="w-5 h-5" />
            Connect Phantom Wallet
          </button>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Your Wallet</p>
              <p className="text-sm font-mono text-gray-800 break-all">{wallet}</p>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-xs text-purple-600 mb-1">Required Co-Signer</p>
              <p className="text-sm font-mono text-purple-800 break-all">{REQUIRED_SIGNER}</p>
            </div>

            <button
              onClick={signTransaction}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              Sign Transaction
            </button>

            {signature && (
              <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <p className="text-xs text-green-700 font-semibold mb-1">✓ Signature Created</p>
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
                <strong>Note:</strong> This transaction requires both your signature and the co-signer's signature before it can be submitted to the blockchain.
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