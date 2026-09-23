/**
 * POWER2 Solana Web3 dApp Adapter
 * Provides seamless wallet connection, on-chain state inspection, and transaction execution
 * for the No-Loss Dual-Lotto Protocol.
 */
(function() {
  'use strict';

  // Constants & Config
  const PROGRAM_ID_STR = "FuRWS3WnfcUnPWFfibVX35ThjPsQG5tVpHjRScsrmZ8j";
  const DEVNET_RPC = "https://api.devnet.solana.com";

  // Instruction Discriminators (sha256("global:<name>")[..8])
  const DISCRIMINATORS = {
    initialize_pool: new Uint8Array([95, 180, 10, 172, 84, 174, 232, 40]),
    deposit: new Uint8Array([242, 35, 198, 137, 82, 225, 242, 182]),
    withdraw: new Uint8Array([183, 18, 70, 156, 148, 109, 161, 34]),
    fund_prize: new Uint8Array([243, 117, 119, 184, 213, 156, 93, 153]),
    draw_round: new Uint8Array([193, 98, 43, 206, 179, 168, 227, 135]),
    claim_prize: new Uint8Array([157, 233, 139, 121, 246, 62, 234, 235]),
    toggle_pause: new Uint8Array([238, 237, 206, 27, 255, 95, 123, 229])
  };

  const SEEDS = {
    POOL: new TextEncoder().encode("power2-pool"),
    VAULT: new TextEncoder().encode("pool-vault"),
    PRIZE_VAULT: new TextEncoder().encode("prize-vault"),
    USER_DEPOSIT: new TextEncoder().encode("user-deposit"),
    ROUND_DRAW: new TextEncoder().encode("round-draw")
  };

  // State
  let connection = null;
  let currentWallet = null;
  let currentPubkey = null;
  let programId = null;
  let poolPda = null;
  let vaultPda = null;
  let prizeVaultPda = null;
  let userDepositPda = null;

  let poolData = {
    totalDeposit: 0,
    currentRound: 1,
    accumulatedPrizes: 0,
    isInitialized: false
  };

  let userDepositData = {
    amount: 0,
    effectiveAmount: 0,
    unclaimedPrizes: 0,
    hasAccount: false
  };

  // Wait for solanaWeb3 to load
  function initWeb3() {
    if (typeof window.solanaWeb3 === 'undefined') {
      setTimeout(initWeb3, 100);
      return;
    }
    const { Connection, PublicKey } = window.solanaWeb3;
    connection = new Connection(DEVNET_RPC, "confirmed");
    programId = new PublicKey(PROGRAM_ID_STR);

    // Derive PDAs
    [poolPda] = PublicKey.findProgramAddressSync([SEEDS.POOL], programId);
    [vaultPda] = PublicKey.findProgramAddressSync([SEEDS.VAULT, poolPda.toBuffer()], programId);
    [prizeVaultPda] = PublicKey.findProgramAddressSync([SEEDS.PRIZE_VAULT, poolPda.toBuffer()], programId);

    buildUI();
    fetchPoolState();
    setInterval(fetchPoolState, 10000);
  }

  // Parse 64-bit Little Endian
  function readUint64LE(bytes, offset) {
    let res = 0n;
    for (let i = 0; i < 8; i++) {
      res += BigInt(bytes[offset + i]) << BigInt(8 * i);
    }
    return Number(res) / 1e9; // in SOL
  }

  // Fetch On-chain Pool State
  async function fetchPoolState() {
    if (!connection || !poolPda) return;
    try {
      const info = await connection.getAccountInfo(poolPda);
      if (info && info.data && info.data.length >= 120) {
        poolData.isInitialized = true;
        const data = info.data;
        poolData.totalDeposit = readUint64LE(data, 8 + 32 * 4);
        poolData.currentRound = Number(readUint64LE(data, 8 + 32 * 4 + 8 * 2) * 1e9);
        poolData.accumulatedPrizes = readUint64LE(data, 8 + 32 * 4 + 8 * 5);
      } else {
        poolData.isInitialized = false;
      }
    } catch (e) {
      console.warn("Error fetching pool state:", e);
    }

    if (currentPubkey && poolPda) {
      try {
        const { PublicKey } = window.solanaWeb3;
        [userDepositPda] = PublicKey.findProgramAddressSync(
          [SEEDS.USER_DEPOSIT, poolPda.toBuffer(), currentPubkey.toBuffer()],
          programId
        );
        const userInfo = await connection.getAccountInfo(userDepositPda);
        if (userInfo && userInfo.data && userInfo.data.length >= 80) {
          userDepositData.hasAccount = true;
          userDepositData.amount = readUint64LE(userInfo.data, 8 + 32 * 2);
          userDepositData.effectiveAmount = readUint64LE(userInfo.data, 8 + 32 * 2 + 8);
          userDepositData.unclaimedPrizes = readUint64LE(userInfo.data, 8 + 32 * 2 + 8 * 4);
        } else {
          userDepositData.hasAccount = false;
          userDepositData.amount = 0;
          userDepositData.effectiveAmount = 0;
          userDepositData.unclaimedPrizes = 0;
        }
      } catch (e) {
        console.warn("Error fetching user deposit state:", e);
      }
    }

    updateUI();
  }

  // UI Building
  function buildUI() {
    // 1. Floating Launcher HUD (Bottom Right)
    const launcher = document.createElement("div");
    launcher.className = "p2-hud-launcher";
    launcher.id = "p2-launcher";
    launcher.innerHTML = `
      <div class="badge">Solana Devnet</div>
      <div style="font-weight: 700; font-size: 14px; letter-spacing: -0.2px;">⚡ POWER2 DAPP</div>
    `;
    launcher.onclick = openModal;
    document.body.appendChild(launcher);

    // 2. Modal Overlay
    const modal = document.createElement("div");
    modal.className = "p2-modal-overlay";
    modal.id = "p2-modal";
    modal.innerHTML = `
      <div class="p2-card">
        <div class="p2-card-header">
          <h3>
            <span style="font-size: 22px;">🎲</span> POWER2 No-Loss Lotto
          </h3>
          <button class="p2-close-btn" id="p2-close">&times;</button>
        </div>
        <div class="p2-card-body">
          <div class="p2-stats-grid">
            <div class="p2-stat-box">
              <span class="p2-stat-label">Total Pool TVL</span>
              <span class="p2-stat-val" id="p2-tvl">0.00 SOL</span>
            </div>
            <div class="p2-stat-box">
              <span class="p2-stat-label">Current Round</span>
              <span class="p2-stat-val" id="p2-round">Round #1</span>
            </div>
            <div class="p2-stat-box highlight">
              <span class="p2-stat-label">1+1 Crypto Prize</span>
              <span class="p2-stat-val gradient" id="p2-prize">0.00 SOL</span>
            </div>
            <div class="p2-stat-box highlight">
              <span class="p2-stat-label">1+1 Bonus Prize</span>
              <span class="p2-stat-val" style="font-size: 16px; color: var(--p2-cyan); padding-top: 4px;">Exclusive iNFT 🎨</span>
            </div>
          </div>

          <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--p2-border); border-radius: 16px; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span class="p2-stat-label">My Deposited Principal</span>
              <span style="font-size: 12px; color: var(--p2-green); font-weight: 600;">100% No-Loss Guaranteed</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
              <span style="font-size: 26px; font-weight: 800; color: #fff;" id="p2-my-deposit">0.00 SOL</span>
              <span style="font-size: 13px; color: var(--p2-cyan); font-weight: 600;" id="p2-my-odds">Odds: 0%</span>
            </div>
            <div style="font-size: 12px; color: var(--p2-text-dim); margin-top: 4px;" id="p2-unclaimed-wrap">
              Unclaimed Prizes: <strong style="color: #FF0080;" id="p2-unclaimed">0.00 SOL</strong>
            </div>
          </div>

          <div class="p2-action-group">
            <div class="p2-input-wrap">
              <input type="number" step="0.05" min="0.01" class="p2-input" id="p2-amount-input" placeholder="Amount (e.g. 0.1)" />
              <span class="p2-input-token">SOL</span>
            </div>
            <div class="p2-btn-row">
              <button class="p2-btn p2-btn-primary" id="p2-deposit-btn">📥 Deposit</button>
              <button class="p2-btn p2-btn-secondary" id="p2-withdraw-btn">📤 Withdraw</button>
            </div>
            <button class="p2-btn p2-btn-primary" id="p2-claim-btn" style="background: linear-gradient(135deg, #00F5A0, #00F2FE); color: #000; display: none;">
              🏆 Claim Prize (<span id="p2-claim-amount">0</span> SOL)
            </button>
          </div>

          <div class="p2-security-badge">
            <span>🛡️</span>
            <span>Anti-Flash-Loan & Checked Math protected on Solana. Zero loss risk.</span>
          </div>

          <!-- Devnet Testing Console -->
          <div class="p2-devnet-box">
            <div class="p2-devnet-title">
              <span>🧪 Devnet Test Tools</span>
              <span style="font-size: 10px; color: var(--p2-text-dim);">Cluster: Devnet</span>
            </div>
            <div class="p2-devnet-row">
              <button class="p2-devnet-btn" id="p2-init-pool-btn" style="display: none;">⚙️ Init Pool</button>
              <button class="p2-devnet-btn" id="p2-yield-btn">💧 Simulate Yield (+0.1 SOL)</button>
              <button class="p2-devnet-btn" id="p2-draw-btn">🎲 Trigger Draw (VRF)</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Event Listeners
    document.getElementById("p2-close").onclick = closeModal;
    modal.onclick = (e) => { if (e.target === modal) closeModal(); };

    document.getElementById("p2-deposit-btn").onclick = handleDeposit;
    document.getElementById("p2-withdraw-btn").onclick = handleWithdraw;
    document.getElementById("p2-claim-btn").onclick = handleClaimPrize;
    document.getElementById("p2-init-pool-btn").onclick = handleInitPool;
    document.getElementById("p2-yield-btn").onclick = handleSimulateYield;
    document.getElementById("p2-draw-btn").onclick = handleTriggerDraw;

    // Insert Header Connect Button once DOM is fully populated
    injectHeaderButton();
  }

  function injectHeaderButton() {
    let headerBtn = document.getElementById("p2-header-btn");
    if (!headerBtn) {
      headerBtn = document.createElement("button");
      headerBtn.className = "p2-wallet-btn";
      headerBtn.id = "p2-header-btn";
      headerBtn.innerHTML = `<span class="dot"></span> <span>Connect Wallet</span>`;
      headerBtn.style.position = "fixed";
      headerBtn.style.top = "18px";
      headerBtn.style.right = "24px";
      headerBtn.onclick = handleWalletToggle;
      document.body.appendChild(headerBtn);
    }
  }

  function openModal() {
    document.getElementById("p2-modal").classList.add("active");
    if (!currentPubkey) {
      connectWallet();
    }
  }

  function closeModal() {
    document.getElementById("p2-modal").classList.remove("active");
  }

  function showToast(msg, type = "success") {
    let toast = document.getElementById("p2-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "p2-toast";
      toast.className = "p2-toast";
      document.body.appendChild(toast);
    }
    toast.className = `p2-toast ${type} active`;
    toast.textContent = msg;
    setTimeout(() => {
      toast.classList.remove("active");
    }, 4500);
  }

  // Update UI Elements with Latest On-Chain Data
  function updateUI() {
    const tvlEl = document.getElementById("p2-tvl");
    const roundEl = document.getElementById("p2-round");
    const prizeEl = document.getElementById("p2-prize");
    const myDepositEl = document.getElementById("p2-my-deposit");
    const myOddsEl = document.getElementById("p2-my-odds");
    const unclaimedEl = document.getElementById("p2-unclaimed");
    const claimBtn = document.getElementById("p2-claim-btn");
    const claimAmountEl = document.getElementById("p2-claim-amount");
    const initBtn = document.getElementById("p2-init-pool-btn");

    if (tvlEl) tvlEl.textContent = `${poolData.totalDeposit.toFixed(3)} SOL`;
    if (roundEl) roundEl.textContent = `Round #${poolData.currentRound}`;
    if (prizeEl) prizeEl.textContent = `${poolData.accumulatedPrizes.toFixed(3)} SOL`;

    if (myDepositEl) myDepositEl.textContent = `${userDepositData.amount.toFixed(3)} SOL`;

    // Compute winning odds
    if (myOddsEl) {
      if (poolData.totalDeposit > 0 && userDepositData.amount > 0) {
        const odds = (userDepositData.amount / poolData.totalDeposit) * 100;
        myOddsEl.textContent = `Odds: ${odds.toFixed(1)}%`;
      } else {
        myOddsEl.textContent = `Odds: 0%`;
      }
    }

    if (unclaimedEl) unclaimedEl.textContent = `${userDepositData.unclaimedPrizes.toFixed(3)} SOL`;

    if (claimBtn) {
      if (userDepositData.unclaimedPrizes > 0) {
        claimBtn.style.display = "flex";
        if (claimAmountEl) claimAmountEl.textContent = userDepositData.unclaimedPrizes.toFixed(3);
      } else {
        claimBtn.style.display = "none";
      }
    }

    if (initBtn) {
      initBtn.style.display = poolData.isInitialized ? "none" : "inline-block";
    }

    // Header Button Update
    const headerBtn = document.getElementById("p2-header-btn");
    if (headerBtn) {
      if (currentPubkey) {
        const addr = currentPubkey.toBase58();
        const shortAddr = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
        headerBtn.innerHTML = `<span class="dot"></span> <span>${shortAddr}</span>`;
      } else {
        headerBtn.innerHTML = `<span class="dot"></span> <span>Connect Wallet</span>`;
      }
    }
  }

  // Wallet Connection
  async function connectWallet() {
    const provider = window.phantom?.solana || window.solana;
    if (!provider) {
      showToast("Please install Phantom or Solflare wallet!", "error");
      window.open("https://phantom.app/", "_blank");
      return;
    }
    try {
      const resp = await provider.connect();
      currentPubkey = resp.publicKey;
      currentWallet = provider;
      showToast(`Connected: ${currentPubkey.toBase58().slice(0, 6)}...`);
      fetchPoolState();
    } catch (err) {
      console.error("Wallet connect error:", err);
      showToast("Wallet connection rejected", "error");
    }
  }

  function handleWalletToggle() {
    if (!currentPubkey) {
      connectWallet();
    } else {
      openModal();
    }
  }

  // Encode Uint64 LE into 8 bytes
  function encodeUint64LE(num) {
    const buf = new Uint8Array(8);
    const big = BigInt(num);
    for (let i = 0; i < 8; i++) {
      buf[i] = Number((big >> BigInt(8 * i)) & 0xffn);
    }
    return buf;
  }

  // Handle Deposit
  async function handleDeposit() {
    if (!currentPubkey || !currentWallet) {
      await connectWallet();
      if (!currentPubkey) return;
    }

    const input = document.getElementById("p2-amount-input");
    const solVal = parseFloat(input.value);
    if (!solVal || solVal <= 0) {
      showToast("Please enter a valid SOL amount to deposit", "error");
      return;
    }

    const lamports = Math.floor(solVal * 1e9);
    const { Transaction, TransactionInstruction, SystemProgram } = window.solanaWeb3;

    try {
      showToast("Preparing deposit transaction...");
      const data = new Uint8Array(8 + 8);
      data.set(DISCRIMINATORS.deposit, 0);
      data.set(encodeUint64LE(lamports), 8);

      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new TransactionInstruction({ programId, keys, data });
      const tx = new Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      showToast(`Deposit submitted! Tx: ${signature.slice(0, 8)}...`);

      await connection.confirmTransaction(signature, "confirmed");
      showToast(`Successfully deposited ${solVal} SOL! 100% No-Loss principal stored.`);
      input.value = "";
      fetchPoolState();
    } catch (err) {
      console.error("Deposit error:", err);
      showToast(`Deposit failed: ${err.message || err}`, "error");
    }
  }

  // Handle Withdraw
  async function handleWithdraw() {
    if (!currentPubkey || !currentWallet) {
      await connectWallet();
      return;
    }

    const input = document.getElementById("p2-amount-input");
    const solVal = parseFloat(input.value) || userDepositData.amount;
    if (!solVal || solVal <= 0) {
      showToast("Enter amount to withdraw", "error");
      return;
    }

    const lamports = Math.floor(solVal * 1e9);
    const { Transaction, TransactionInstruction, SystemProgram } = window.solanaWeb3;

    try {
      showToast("Preparing withdrawal transaction...");
      const data = new Uint8Array(8 + 8);
      data.set(DISCRIMINATORS.withdraw, 0);
      data.set(encodeUint64LE(lamports), 8);

      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new TransactionInstruction({ programId, keys, data });
      const tx = new Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      showToast(`Withdrawal submitted! Tx: ${signature.slice(0, 8)}...`);

      await connection.confirmTransaction(signature, "confirmed");
      showToast(`Withdrew ${solVal} SOL back to wallet with 0% fees!`);
      input.value = "";
      fetchPoolState();
    } catch (err) {
      console.error("Withdraw error:", err);
      showToast(`Withdraw failed: ${err.message || err}`, "error");
    }
  }

  // Handle Claim Prize
  async function handleClaimPrize() {
    if (!currentPubkey || !currentWallet) return;
    const { Transaction, TransactionInstruction, SystemProgram } = window.solanaWeb3;

    try {
      showToast("Claiming your prize...");
      const data = DISCRIMINATORS.claim_prize;
      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: prizeVaultPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new TransactionInstruction({ programId, keys, data });
      const tx = new Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, "confirmed");
      showToast(`Prize claimed and transferred to your wallet!`);
      fetchPoolState();
    } catch (err) {
      console.error("Claim prize error:", err);
      showToast(`Claim failed: ${err.message || err}`, "error");
    }
  }

  // Handle Init Pool (Devnet testing)
  async function handleInitPool() {
    if (!currentPubkey || !currentWallet) {
      await connectWallet();
      return;
    }
    const { Transaction, TransactionInstruction, SystemProgram } = window.solanaWeb3;
    try {
      showToast("Initializing Power2 Pool...");
      const data = new Uint8Array(8 + 8 + 32);
      data.set(DISCRIMINATORS.initialize_pool, 0);
      data.set(encodeUint64LE(86400), 8); // 1 day round
      data.set(currentPubkey.toBuffer(), 16); // charity recipient is creator on devnet

      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: prizeVaultPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new TransactionInstruction({ programId, keys, data });
      const tx = new Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, "confirmed");
      showToast("Pool initialized successfully on Solana Devnet!");
      fetchPoolState();
    } catch (err) {
      console.error("Init pool error:", err);
      showToast(`Init failed: ${err.message || err}`, "error");
    }
  }

  // Handle Simulate Yield
  async function handleSimulateYield() {
    if (!currentPubkey || !currentWallet) {
      await connectWallet();
      return;
    }
    const { Transaction, TransactionInstruction, SystemProgram } = window.solanaWeb3;
    const lamports = 100000000; // 0.1 SOL

    try {
      showToast("Injecting 0.1 SOL yield to prize pool...");
      const data = new Uint8Array(8 + 8);
      data.set(DISCRIMINATORS.fund_prize, 0);
      data.set(encodeUint64LE(lamports), 8);

      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: prizeVaultPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new TransactionInstruction({ programId, keys, data });
      const tx = new Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, "confirmed");
      showToast("Simulated yield funded into prize pool!");
      fetchPoolState();
    } catch (err) {
      console.error("Fund prize error:", err);
      showToast(`Fund yield failed: ${err.message || err}`, "error");
    }
  }

  // Handle Trigger Draw (VRF)
  async function handleTriggerDraw() {
    if (!currentPubkey || !currentWallet) {
      await connectWallet();
      return;
    }
    const { Transaction, TransactionInstruction, SystemProgram, PublicKey } = window.solanaWeb3;

    try {
      showToast("Rolling 1+1 VRF dice on Solana...");
      const randomness = crypto.getRandomValues(new Uint8Array(32));
      const memo = new TextEncoder().encode("POWER2_INFT_GENESIS_AWARD_#1____");

      const data = new Uint8Array(8 + 32 + 32);
      data.set(DISCRIMINATORS.draw_round, 0);
      data.set(randomness, 8);
      data.set(memo, 40);

      // Derive round draw PDA
      const roundBytes = encodeUint64LE(poolData.currentRound);
      const [roundDrawPda] = PublicKey.findProgramAddressSync(
        [SEEDS.ROUND_DRAW, poolPda.toBuffer(), roundBytes],
        programId
      );

      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: roundDrawPda, isSigner: false, isWritable: true },
        { pubkey: prizeVaultPda, isSigner: false, isWritable: true },
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: false, isWritable: false }, // winner
        { pubkey: currentPubkey, isSigner: false, isWritable: true }, // charity recipient
        { pubkey: currentPubkey, isSigner: true, isWritable: true }, // authority
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new TransactionInstruction({ programId, keys, data });
      const tx = new Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(signature, "confirmed");
      showToast(`🎉 Round #${poolData.currentRound} Drawn! 1+1 Prizes Awarded!`);
      fetchPoolState();
    } catch (err) {
      console.error("Draw round error:", err);
      showToast(`Draw failed: ${err.message || err}`, "error");
    }
  }

  // Initialize once loaded
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWeb3);
  } else {
    initWeb3();
  }
})();
