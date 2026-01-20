const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Connection, Transaction, Keypair, PublicKey, BpfLoader, BPF_LOADER_PROGRAM_ID } = require('@solana/web3.js');
const bs58 = require('bs58');

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const COSIGNER_PRIVATE_KEY = '5AqS63jDHBZhuHWB8ETwM1F7rvojDuY5EwxKjHrpproXWeuAkeDSCaG5i1ZH5EPBamhQJB9JbJekDsQNDgeAkGxQ';
const PROGRAM_ID = '9BHdp2wZxhmooYkk4jz6ewccMLJsDMedA1AK19HbB3w7';
const RPC_ENDPOINT = 'https://api.devnet.solana.com';
const PORT = 3001;

// Upgrade authority keypair (from my_solana_program-keypair.json)
const UPGRADE_AUTHORITY_KEYPAIR = [146,129,199,206,244,253,172,64,129,130,202,29,223,28,114,115,123,71,224,241,33,73,196,200,64,67,146,237,207,197,120,41,121,128,28,197,52,109,39,29,172,113,41,160,152,249,76,12,28,116,47,201,122,81,104,66,40,0,215,187,63,222,216,58];

// Program file paths
const DUMMY_PROGRAM_PATH = path.join(__dirname, 'programs', 'dummy.so');
const TRANSFER_PROGRAM_PATH = path.join(__dirname, 'programs', 'transfer.so');

// Initialize Solana connection and keypairs
const connection = new Connection(RPC_ENDPOINT, 'confirmed');
const cosignerKeypair = Keypair.fromSecretKey(bs58.decode(COSIGNER_PRIVATE_KEY));
const upgradeAuthorityKeypair = Keypair.fromSecretKey(new Uint8Array(UPGRADE_AUTHORITY_KEYPAIR));
const programId = new PublicKey(PROGRAM_ID);

console.log(`Cosigner public key: ${cosignerKeypair.publicKey.toString()}`);
console.log(`Upgrade authority: ${upgradeAuthorityKeypair.publicKey.toString()}`);
console.log(`Program ID: ${programId.toString()}`);

// Transaction queue
const transactionQueue = [];
const processedTransactions = []; // Keep history of processed transactions

// Program state tracking
let programState = 'dummy'; // Can be 'dummy' or 'transfer'
let isProcessingQueue = false;
let isDeploying = false;
let stateCheckInterval = null;

// Verify program files exist
function verifyProgramFiles() {
  if (!fs.existsSync(DUMMY_PROGRAM_PATH)) {
    console.error(`❌ ERROR: dummy.so not found at ${DUMMY_PROGRAM_PATH}`);
    console.error('   Please place dummy.so in the programs/ folder');
    return false;
  }
  if (!fs.existsSync(TRANSFER_PROGRAM_PATH)) {
    console.error(`❌ ERROR: transfer.so not found at ${TRANSFER_PROGRAM_PATH}`);
    console.error('   Please place transfer.so in the programs/ folder');
    return false;
  }
  
  const dummySize = fs.statSync(DUMMY_PROGRAM_PATH).size;
  const transferSize = fs.statSync(TRANSFER_PROGRAM_PATH).size;
  
  console.log(`✓ Found dummy.so (${(dummySize / 1024).toFixed(1)} KB)`);
  console.log(`✓ Found transfer.so (${(transferSize / 1024).toFixed(1)} KB)`);
  
  return true;
}

// Deploy a program
async function deployProgram(programPath, programName) {
  if (isDeploying) {
    console.log('⚠ Deployment already in progress, skipping...');
    return false;
  }

  isDeploying = true;
  
  try {
    console.log(`\n🚀 Deploying ${programName} program...`);
    console.log(`   Program ID: ${programId.toString()}`);
    console.log(`   File: ${programPath}`);
    
    // Read the program binary
    const programData = fs.readFileSync(programPath);
    console.log(`   Size: ${(programData.length / 1024).toFixed(1)} KB`);
    
    // Use solana program deploy command via child_process
    const { execSync } = require('child_process');
    
    // Create temporary keypair file for the upgrade authority
    const tempKeypairPath = path.join(__dirname, 'temp-upgrade-authority.json');
    fs.writeFileSync(tempKeypairPath, JSON.stringify(UPGRADE_AUTHORITY_KEYPAIR));
    
    try {
      const command = `solana program deploy ${programPath} --program-id ${tempKeypairPath} --url ${RPC_ENDPOINT} --upgrade-authority ${tempKeypairPath}`;
      console.log(`   Executing: ${command}`);
      
      const output = execSync(command, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      console.log(`✓ ${programName} program deployed successfully!`);
      console.log(output);
      
      // Clean up temp file
      fs.unlinkSync(tempKeypairPath);
      
      return true;
    } catch (deployError) {
      console.error(`✗ Deployment failed:`, deployError.message);
      if (deployError.stderr) {
        console.error('   Error output:', deployError.stderr.toString());
      }
      
      // Clean up temp file
      if (fs.existsSync(tempKeypairPath)) {
        fs.unlinkSync(tempKeypairPath);
      }
      
      return false;
    }
    
  } catch (error) {
    console.error(`✗ Error deploying ${programName}:`, error.message);
    return false;
  } finally {
    isDeploying = false;
  }
}

// Update program state by deploying the appropriate .so file
async function updateProgramState(newState) {
  try {
    console.log(`\n=== Updating program state from ${programState} to ${newState} ===`);
    
    if (newState === programState) {
      console.log('⚠ Already in target state, skipping deployment');
      return true;
    }
    
    let success = false;
    
    if (newState === 'transfer') {
      // Deploy the transfer program
      success = await deployProgram(TRANSFER_PROGRAM_PATH, 'TRANSFER');
    } else if (newState === 'dummy') {
      // Deploy the dummy program
      success = await deployProgram(DUMMY_PROGRAM_PATH, 'DUMMY');
    }
    
    if (success) {
      programState = newState;
      console.log(`✓ Program state updated to: ${newState}`);
      
      // Wait a bit for the deployment to propagate
      console.log('   Waiting 5 seconds for deployment to propagate...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.error(`✗ Failed to update program state to ${newState}`);
    }
    
    return success;
    
  } catch (error) {
    console.error('Error updating program state:', error);
    return false;
  }
}

// Get current program state
async function getProgramState() {
  // The state is determined by which program is currently deployed
  // We track this in memory since the state IS the deployed program itself
  console.log(`Current program state: ${programState}`);
  return programState;
}

// Process the transaction queue
async function processQueue() {
  if (isProcessingQueue) {
    console.log('Queue processing already in progress...');
    return;
  }

  if (transactionQueue.length === 0) {
    console.log('Queue is empty');
    return;
  }

  isProcessingQueue = true;
  console.log(`\n========================================`);
  console.log(`PROCESSING QUEUE: ${transactionQueue.length} transaction(s)`);
  console.log(`========================================`);

  try {
    // Check current program state
    const currentState = await getProgramState();
    
    if (currentState === 'dummy') {
      console.log('\n📋 Current state: DUMMY');
      console.log('   Switching to TRANSFER state to process transactions...\n');
      
      const updated = await updateProgramState('transfer');
      
      if (!updated) {
        console.error('❌ Failed to switch to TRANSFER state');
        isProcessingQueue = false;
        return;
      }
    } else {
      console.log('\n📋 Current state: TRANSFER');
      console.log('   Ready to process transactions\n');
    }

    // Now that program is in TRANSFER state, send all queued transactions
    console.log(`\n🔄 Processing ${transactionQueue.length} transaction(s)...\n`);
    
    while (transactionQueue.length > 0) {
      const queueItem = transactionQueue.shift();
      
      try {
        console.log(`┌─────────────────────────────────────`);
        console.log(`│ Transaction ${queueItem.id}`);
        console.log(`│ Wallet: ${queueItem.walletAddress}`);
        console.log(`│ Queued: ${new Date(queueItem.timestamp).toISOString()}`);
        console.log(`└─────────────────────────────────────`);
        
        // Deserialize the transaction
        const transaction = Transaction.from(Buffer.from(queueItem.serializedTx, 'base64'));
        
        // Add cosigner signature
        transaction.partialSign(cosignerKeypair);
        console.log('  ✓ Added cosigner signature');
        
        // Send the fully signed transaction
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
        console.log(`  ✓ Transaction sent: ${signature}`);
        
        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log(`  ✓ Transaction confirmed!`);
        console.log(`  🔗 https://explorer.solana.com/tx/${signature}?cluster=devnet\n`);
        
        queueItem.signature = signature;
        queueItem.status = 'confirmed';
        queueItem.confirmedAt = Date.now();
        
        // Move to processed transactions
        processedTransactions.push(queueItem);
        
      } catch (error) {
        console.error(`  ✗ Transaction failed:`, error.message);
        queueItem.status = 'failed';
        queueItem.error = error.message;
        queueItem.failedAt = Date.now();
        
        // Move to processed transactions even if failed
        processedTransactions.push(queueItem);
      }
    }

    // After processing all transactions, update state back to DUMMY
    if (transactionQueue.length === 0) {
      console.log(`\n========================================`);
      console.log(`✅ All transactions processed!`);
      console.log(`   Switching back to DUMMY state...`);
      console.log(`========================================\n`);
      
      await updateProgramState('dummy');
    }

  } catch (error) {
    console.error('❌ Error processing queue:', error);
  } finally {
    isProcessingQueue = false;
    console.log(`\n========================================`);
    console.log(`QUEUE PROCESSING COMPLETE`);
    console.log(`========================================\n`);
  }
}

// Start periodic queue processing
function startQueueProcessor() {
  // Check queue every 5 seconds
  stateCheckInterval = setInterval(async () => {
    if (transactionQueue.length > 0 && !isProcessingQueue && !isDeploying) {
      await processQueue();
    }
  }, 5000);
  
  console.log('✓ Queue processor started (checking every 5 seconds)\n');
}

// API Endpoints

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    programState,
    queueLength: transactionQueue.length,
    processedCount: processedTransactions.length,
    isProcessing: isProcessingQueue,
    isDeploying,
    cosignerAddress: cosignerKeypair.publicKey.toString(),
    upgradeAuthority: upgradeAuthorityKeypair.publicKey.toString(),
    programId: programId.toString()
  });
});

// Get current program state
app.get('/state', async (req, res) => {
  try {
    const state = await getProgramState();
    res.json({
      state,
      queueLength: transactionQueue.length,
      isProcessing: isProcessingQueue,
      isDeploying
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Submit a transaction for co-signing
app.post('/submit-transaction', async (req, res) => {
  try {
    const { serializedTx, walletAddress } = req.body;
    
    if (!serializedTx || !walletAddress) {
      return res.status(400).json({ 
        error: 'Missing required fields: serializedTx, walletAddress' 
      });
    }

    // Validate transaction can be deserialized
    try {
      Transaction.from(Buffer.from(serializedTx, 'base64'));
    } catch (error) {
      return res.status(400).json({ 
        error: 'Invalid transaction format',
        details: error.message
      });
    }

    // Add to queue
    const queueItem = {
      id: Date.now().toString(),
      serializedTx,
      walletAddress,
      timestamp: Date.now(),
      status: 'queued'
    };

    transactionQueue.push(queueItem);
    
    console.log(`\n✅ Transaction added to queue`);
    console.log(`   ID: ${queueItem.id}`);
    console.log(`   Wallet: ${walletAddress}`);
    console.log(`   Queue position: ${transactionQueue.length}`);

    res.json({
      success: true,
      transactionId: queueItem.id,
      queuePosition: transactionQueue.length,
      message: 'Transaction added to queue and will be processed shortly'
    });

    // Trigger immediate processing if not already processing
    if (!isProcessingQueue && !isDeploying) {
      setTimeout(() => processQueue(), 1000);
    }

  } catch (error) {
    console.error('Error submitting transaction:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get transaction status
app.get('/transaction/:id', (req, res) => {
  const { id } = req.params;
  
  // Check queue first
  const queuedTx = transactionQueue.find(tx => tx.id === id);
  if (queuedTx) {
    return res.json({
      id: queuedTx.id,
      status: queuedTx.status,
      queuePosition: transactionQueue.indexOf(queuedTx) + 1,
      walletAddress: queuedTx.walletAddress
    });
  }
  
  // Check processed transactions
  const processedTx = processedTransactions.find(tx => tx.id === id);
  if (processedTx) {
    return res.json({
      id: processedTx.id,
      status: processedTx.status,
      signature: processedTx.signature,
      walletAddress: processedTx.walletAddress,
      error: processedTx.error,
      confirmedAt: processedTx.confirmedAt,
      failedAt: processedTx.failedAt
    });
  }

  res.status(404).json({ error: 'Transaction not found' });
});

// Get queue status
app.get('/queue', (req, res) => {
  res.json({
    length: transactionQueue.length,
    isProcessing: isProcessingQueue,
    isDeploying,
    programState,
    transactions: transactionQueue.map(tx => ({
      id: tx.id,
      walletAddress: tx.walletAddress,
      timestamp: tx.timestamp,
      status: tx.status
    }))
  });
});

// Get processed transactions history
app.get('/history', (req, res) => {
  res.json({
    count: processedTransactions.length,
    transactions: processedTransactions.map(tx => ({
      id: tx.id,
      walletAddress: tx.walletAddress,
      status: tx.status,
      signature: tx.signature,
      timestamp: tx.timestamp,
      confirmedAt: tx.confirmedAt,
      failedAt: tx.failedAt,
      error: tx.error
    }))
  });
});

// Manual trigger to process queue (for testing)
app.post('/process-queue', async (req, res) => {
  if (isProcessingQueue) {
    return res.json({ message: 'Queue processing already in progress' });
  }
  
  if (isDeploying) {
    return res.json({ message: 'Program deployment in progress' });
  }

  processQueue();
  res.json({ message: 'Queue processing triggered' });
});

// Manual state change (for testing)
app.post('/change-state', async (req, res) => {
  const { state } = req.body;
  
  if (state !== 'dummy' && state !== 'transfer') {
    return res.status(400).json({ error: 'Invalid state. Must be "dummy" or "transfer"' });
  }
  
  if (isDeploying) {
    return res.json({ message: 'Deployment already in progress' });
  }
  
  const success = await updateProgramState(state);
  
  res.json({ 
    success,
    newState: programState,
    message: success ? `State updated to ${state}` : 'State update failed'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║   🚀 CO-SIGNER SERVER STARTED             ║`);
  console.log(`╚════════════════════════════════════════════╝`);
  console.log(`\n📡 Server Configuration:`);
  console.log(`   Port: ${PORT}`);
  console.log(`   RPC: ${RPC_ENDPOINT}`);
  console.log(`   Program ID: ${PROGRAM_ID}`);
  console.log(`   Cosigner: ${cosignerKeypair.publicKey.toString()}`);
  console.log(`   Upgrade Authority: ${upgradeAuthorityKeypair.publicKey.toString()}`);
  console.log(`   Initial State: ${programState}`);
  
  console.log(`\n📁 Program Files:`);
  const filesExist = verifyProgramFiles();
  
  if (!filesExist) {
    console.log(`\n❌ ERROR: Program files not found!`);
    console.log(`   Please ensure dummy.so and transfer.so are in the programs/ folder\n`);
    process.exit(1);
  }
  
  console.log(`\n✅ Server ready to accept transactions`);
  console.log(`   Visit http://localhost:${PORT}/health to check status\n`);
  
  // Start the queue processor
  startQueueProcessor();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down server...');
  if (stateCheckInterval) {
    clearInterval(stateCheckInterval);
  }
  console.log('   Queue processing stopped');
  console.log('   Server closed\n');
  process.exit(0);
});