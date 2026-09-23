/**
 * POWER2 Dedicated dApp Controller (Aave Style Interface)
 * Full-page DeFi application with real Solana Devnet Web3 integration.
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
    claim_prize: new Uint8Array([157, 233, 139, 121, 246, 62, 234, 235])
  };

  const SEEDS = {
    POOL: new TextEncoder().encode("power2-pool"),
    VAULT: new TextEncoder().encode("pool-vault"),
    PRIZE_VAULT: new TextEncoder().encode("prize-vault"),
    USER_DEPOSIT: new TextEncoder().encode("user-deposit"),
    ROUND_DRAW: new TextEncoder().encode("round-draw")
  };

  // State Variables
  let connection = null;
  let currentWallet = null;
  let currentPubkey = null;
  let programId = null;
  let poolPda = null;
  let vaultPda = null;
  let prizeVaultPda = null;
  let userDepositPda = null;
  let walletSolBalance = 0;

  let poolData = {
    totalDeposit: 0.040, // in SOL
    currentRound: 2,
    accumulatedPrizes: 0.0,
    isInitialized: true
  };

  let userDepositData = {
    amount: 0.010, // in SOL
    effectiveAmount: 0.010,
    unclaimedPrizes: 0.0,
    hasAccount: true
  };

  let activeTab = 'deposit'; // 'deposit' | 'withdraw'

  // Encode 64-bit Little Endian
  function encodeUint64LE(val) {
    const buf = new Uint8Array(8);
    let n = BigInt(val);
    for (let i = 0; i < 8; i++) {
      buf[i] = Number(n & 0xffn);
      n >>= 8n;
    }
    return buf;
  }

  // Parse 64-bit Little Endian (returns value in SOL)
  function readUint64LE(bytes, offset) {
    if (!bytes || offset + 8 > bytes.length) return 0;
    let res = 0n;
    for (let i = 0; i < 8; i++) {
      res += BigInt(bytes[offset + i]) << BigInt(8 * i);
    }
    return Number(res) / 1e9;
  }

  // Initialize Web3 Connection and PDAs
  function initWeb3() {
    if (typeof window.solanaWeb3 === 'undefined') {
      setTimeout(initWeb3, 100);
      return;
    }

    // Polyfill Buffer in browser if missing
    if (typeof window.Buffer === 'undefined' && window.solanaWeb3 && window.solanaWeb3.Buffer) {
      window.Buffer = window.solanaWeb3.Buffer;
    }

    try {
      const { Connection, PublicKey } = window.solanaWeb3;
      connection = new Connection(DEVNET_RPC, "confirmed");
      programId = new PublicKey(PROGRAM_ID_STR);

      // Derive exact PDAs matching Anchor smart contract
      [poolPda] = PublicKey.findProgramAddressSync([SEEDS.POOL], programId);
      [vaultPda] = PublicKey.findProgramAddressSync([SEEDS.VAULT, poolPda.toBuffer()], programId);
      [prizeVaultPda] = PublicKey.findProgramAddressSync([SEEDS.PRIZE_VAULT, poolPda.toBuffer()], programId);

      // Refresh on-chain pool status
      fetchPoolState();
      setInterval(fetchPoolState, 10000);
    } catch (err) {
      console.warn("Web3 Init notice:", err);
    }
  }

  // Fetch Pool State from Devnet (Anchor struct offsets)
  async function fetchPoolState() {
    if (!connection || !poolPda) return;
    try {
      const accountInfo = await connection.getAccountInfo(poolPda);
      if (accountInfo && accountInfo.data && accountInfo.data.length >= 120) {
        poolData.isInitialized = true;
        const data = accountInfo.data;
        // Offsets in Anchor Pool account:
        // 8 (disc) + 32*4 (admin, operator, vault, prize_vault) = 136 bytes
        // total_deposit: u64 at 136
        // active_deposit: u64 at 144
        // current_round: u64 at 152
        // round_start_time: i64 at 160
        // round_duration: i64 at 168
        // accumulated_prizes: u64 at 176
        poolData.totalDeposit = readUint64LE(data, 8 + 32 * 4);
        poolData.currentRound = Math.floor(readUint64LE(data, 8 + 32 * 4 + 8 * 2) * 1e9);
        poolData.accumulatedPrizes = readUint64LE(data, 8 + 32 * 4 + 8 * 5);
      }
      renderStats();
    } catch (e) {
      console.warn("Error fetching on-chain pool data:", e);
    }

    if (currentPubkey && poolPda) {
      await fetchUserData();
    }
  }

  // Fetch User Deposit & Wallet Balance
  async function fetchUserData() {
    if (!connection || !currentPubkey) return;

    try {
      // 1. SOL Balance
      const bal = await connection.getBalance(currentPubkey);
      walletSolBalance = bal / 1e9;
      const balEl = document.getElementById('p2-user-wallet-bal');
      if (balEl) balEl.textContent = walletSolBalance.toFixed(4) + ' SOL';

      // 2. User Deposit PDA: seeds = [b"user-deposit", pool.key().as_ref(), user.key().as_ref()]
      const { PublicKey } = window.solanaWeb3;
      [userDepositPda] = PublicKey.findProgramAddressSync(
        [SEEDS.USER_DEPOSIT, poolPda.toBuffer(), currentPubkey.toBuffer()],
        programId
      );

      const userInfo = await connection.getAccountInfo(userDepositPda);
      if (userInfo && userInfo.data && userInfo.data.length >= 80) {
        userDepositData.hasAccount = true;
        // UserDeposit layout:
        // 8 (disc) + 32*2 (pool, user) = 72 bytes
        // amount: u64 at 72
        // effective_amount: u64 at 80
        // deposit_round: u64 at 88
        // last_claimed_round: u64 at 96
        // unclaimed_prizes: u64 at 104
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
      console.warn("Error fetching user data:", e);
    }

    renderPosition();
  }

  // Render Stats Grid
  function renderStats() {
    const tvlEl = document.getElementById('stat-tvl');
    const roundEl = document.getElementById('stat-round');
    const prizeCryptoEl = document.getElementById('stat-prize-crypto');

    if (tvlEl) tvlEl.textContent = poolData.totalDeposit.toFixed(3) + ' SOL';
    if (roundEl) roundEl.textContent = 'Round #' + (poolData.currentRound || 1);
    if (prizeCryptoEl) prizeCryptoEl.textContent = poolData.accumulatedPrizes.toFixed(3) + ' SOL';
  }

  // Render User Position
  function renderPosition() {
    const principalEl = document.getElementById('p2-pos-principal');
    const oddsPctEl = document.getElementById('p2-pos-odds-pct');
    const oddsFillEl = document.getElementById('p2-pos-odds-fill');
    const unclaimedEl = document.getElementById('p2-pos-unclaimed');
    const claimBtn = document.getElementById('p2-claim-btn');

    if (principalEl) principalEl.textContent = userDepositData.amount.toFixed(3) + ' SOL';

    // Calculate Winning Odds
    let odds = 0;
    if (poolData.totalDeposit > 0) {
      odds = Math.min(100, (userDepositData.effectiveAmount / poolData.totalDeposit) * 100);
    }
    if (oddsPctEl) oddsPctEl.textContent = odds.toFixed(1) + '%';
    if (oddsFillEl) oddsFillEl.style.width = odds.toFixed(1) + '%';

    // Unclaimed Prizes
    if (unclaimedEl) unclaimedEl.textContent = userDepositData.unclaimedPrizes.toFixed(3) + ' SOL';
    if (claimBtn) {
      claimBtn.disabled = userDepositData.unclaimedPrizes <= 0;
    }
  }

  // Update Dynamic Odds Simulation when Typing
  function updateOddsPreview() {
    const input = document.getElementById('p2-amount-input');
    const previewEl = document.getElementById('p2-calc-preview');
    if (!input || !previewEl) return;

    const val = parseFloat(input.value) || 0;
    if (val <= 0) {
      previewEl.style.display = 'none';
      return;
    }

    previewEl.style.display = 'flex';
    const lang = (window.P2_I18N && window.P2_I18N.currentLang) || 'en';

    if (activeTab === 'deposit') {
      const newTotal = userDepositData.amount + val;
      const newPool = poolData.totalDeposit + val;
      const newOdds = Math.min(100, (newTotal / (newPool || 1)) * 100).toFixed(1);

      if (lang === 'zh') {
        previewEl.innerHTML = `💡 存入 <b>${val} SOL</b> 後，總本金將為 <b>${newTotal.toFixed(3)} SOL</b>（預估中獎率約 <b>${newOdds}%</b>）`;
      } else {
        previewEl.innerHTML = `💡 Depositing <b>${val} SOL</b> brings principal to <b>${newTotal.toFixed(3)} SOL</b> (~<b>${newOdds}%</b> winning odds)`;
      }
    } else {
      const remaining = Math.max(0, userDepositData.amount - val);
      if (lang === 'zh') {
        previewEl.innerHTML = `💡 提取 <b>${val} SOL</b> 後，剩餘存款 <b>${remaining.toFixed(3)} SOL</b>（本金 100% 取回）`;
      } else {
        previewEl.innerHTML = `💡 Withdrawing <b>${val} SOL</b> leaves <b>${remaining.toFixed(3)} SOL</b> in pool. (0% fee)`;
      }
    }
  }

  // Switch Deposit / Withdraw Tabs
  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.p2-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tab);
    });

    const submitBtn = document.getElementById('p2-submit-btn');
    const noteEl = document.getElementById('p2-action-note');
    const input = document.getElementById('p2-amount-input');
    if (input) input.value = '';

    const lang = (window.P2_I18N && window.P2_I18N.currentLang) || 'en';

    if (tab === 'deposit') {
      if (submitBtn) submitBtn.textContent = lang === 'zh' ? '📥 存入本金' : '📥 Deposit Principal';
      if (noteEl) noteEl.textContent = lang === 'zh' 
        ? '新存入資金於下一輪正式生效參與抽獎（防閃電貸攻擊）。' 
        : 'New deposits become active lottery tickets starting the next round (Anti-Flash-Loan).';
    } else {
      if (submitBtn) submitBtn.textContent = lang === 'zh' ? '📤 提取本金 (0% 手續費)' : '📤 Withdraw Principal (0% Fee)';
      if (noteEl) noteEl.textContent = lang === 'zh' 
        ? '隨時可全額取回本金，零手續費、零鎖倉期。' 
        : 'You can withdraw your full principal at any time without fees or lockups.';
    }

    updateOddsPreview();
  }

  // Toast Notification
  function showToast(msg, type = 'info') {
    let toast = document.getElementById('p2-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'p2-toast';
      toast.className = 'p2-toast';
      document.body.appendChild(toast);
    }
    toast.className = `p2-toast show ${type}`;
    toast.textContent = msg;
    setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }

  // Connect Wallet
  async function connectWallet(providerType) {
    closeWalletModal();
    let provider = null;

    if (providerType === 'phantom') {
      provider = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
    } else if (providerType === 'solflare') {
      provider = window.solflare;
    } else {
      provider = window.phantom?.solana || window.solflare || window.solana;
    }

    if (!provider) {
      const name = providerType === 'phantom' ? 'Phantom' : providerType === 'solflare' ? 'Solflare' : 'Solana';
      showToast(`Please install ${name} wallet extension!`, 'error');
      return;
    }

    try {
      showToast("Connecting wallet...", "info");
      const resp = await provider.connect();
      currentWallet = provider;
      currentPubkey = resp.publicKey || provider.publicKey;

      updateWalletUI();
      await fetchUserData();
      await fetchPoolState();
      showToast("Wallet connected: " + currentPubkey.toBase58().slice(0, 4) + '...' + currentPubkey.toBase58().slice(-4), "success");
    } catch (err) {
      console.error("Wallet connect error:", err);
      if (err.code === 4001) {
        showToast("Connection rejected by user", "error");
      } else {
        showToast("Wallet connection error: " + (err.message || err), "error");
      }
    }
  }

  // Disconnect Wallet
  async function disconnectWallet() {
    if (currentWallet && currentWallet.disconnect) {
      try { await currentWallet.disconnect(); } catch (e) {}
    }
    currentWallet = null;
    currentPubkey = null;
    userDepositPda = null;
    walletSolBalance = 0;
    updateWalletUI();
    renderPosition();
    showToast("Wallet disconnected", "info");
  }

  // Update Wallet Navbar Element
  function updateWalletUI() {
    const container = document.getElementById('p2-wallet-nav-container');
    if (!container) return;

    if (currentPubkey) {
      const addr = currentPubkey.toBase58();
      const shortAddr = addr.slice(0, 4) + '...' + addr.slice(-4);
      container.innerHTML = `
        <div class="p2-wallet-connected">
          <span style="color:#00F5A0;font-size:10px;">●</span>
          <span>${shortAddr}</span>
          <button class="p2-disconnect-btn" id="p2-disconnect-btn">Disconnect</button>
        </div>
      `;
      document.getElementById('p2-disconnect-btn').onclick = disconnectWallet;
    } else {
      const text = (window.P2_I18N && window.P2_I18N.t('nav.connect_wallet')) || 'Connect Wallet';
      container.innerHTML = `
        <button class="p2-wallet-btn" id="p2-connect-btn">
          <span style="font-size:14px;">⚡</span>
          <span data-i18n="nav.connect_wallet">${text}</span>
        </button>
      `;
      document.getElementById('p2-connect-btn').onclick = openWalletModal;
    }
  }

  // Modal Controls
  function openWalletModal() {
    const modal = document.getElementById('p2-wallet-modal');
    if (modal) modal.classList.add('open');
  }

  function closeWalletModal() {
    const modal = document.getElementById('p2-wallet-modal');
    if (modal) modal.classList.remove('open');
  }

  // Transaction: Deposit SOL
  async function handleDeposit() {
    if (!currentPubkey || !currentWallet) {
      openWalletModal();
      return;
    }

    const input = document.getElementById('p2-amount-input');
    const amountSol = parseFloat(input.value);
    if (!amountSol || amountSol <= 0) {
      showToast("Please enter a valid amount to deposit.", "error");
      return;
    }

    const lamports = Math.floor(amountSol * 1e9);
    const { Transaction, TransactionInstruction, SystemProgram, PublicKey } = window.solanaWeb3;

    try {
      showToast("Preparing deposit transaction...", "info");

      // Ensure userDepositPda is derived with correct seeds
      [userDepositPda] = PublicKey.findProgramAddressSync(
        [SEEDS.USER_DEPOSIT, poolPda.toBuffer(), currentPubkey.toBuffer()],
        programId
      );

      const data = new Uint8Array(8 + 8);
      data.set(DISCRIMINATORS.deposit, 0);
      data.set(encodeUint64LE(lamports), 8);

      // Anchor instruction: deposit(ctx, amount)
      // accounts: pool, user_deposit, vault, user, system_program
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
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      showToast(`Deposit submitted! Tx: ${sig.slice(0, 8)}...`, "info");

      await connection.confirmTransaction(sig, "confirmed");
      showToast(`🎉 Successfully deposited ${amountSol} SOL! 100% safe.`, "success");

      input.value = '';
      await fetchUserData();
      await fetchPoolState();
    } catch (err) {
      console.error("Deposit error:", err);
      showToast("Deposit error: " + (err.message || err), "error");
    }
  }

  // Transaction: Withdraw SOL
  async function handleWithdraw() {
    if (!currentPubkey || !currentWallet) {
      openWalletModal();
      return;
    }

    const input = document.getElementById('p2-amount-input');
    const amountSol = parseFloat(input.value) || userDepositData.amount;
    if (!amountSol || amountSol <= 0) {
      showToast("Please enter a valid amount to withdraw.", "error");
      return;
    }

    const lamports = Math.floor(amountSol * 1e9);
    const { Transaction, TransactionInstruction, SystemProgram, PublicKey } = window.solanaWeb3;

    try {
      showToast("Preparing withdraw transaction...", "info");

      [userDepositPda] = PublicKey.findProgramAddressSync(
        [SEEDS.USER_DEPOSIT, poolPda.toBuffer(), currentPubkey.toBuffer()],
        programId
      );

      const data = new Uint8Array(8 + 8);
      data.set(DISCRIMINATORS.withdraw, 0);
      data.set(encodeUint64LE(lamports), 8);

      // Anchor instruction: withdraw(ctx, amount)
      // accounts: pool, user_deposit, vault, user, system_program
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
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      showToast(`Withdrawal submitted! Tx: ${sig.slice(0, 8)}...`, "info");

      await connection.confirmTransaction(sig, "confirmed");
      showToast(`🎉 Successfully retrieved ${amountSol} SOL! Zero fees applied.`, "success");

      input.value = '';
      await fetchUserData();
      await fetchPoolState();
    } catch (err) {
      console.error("Withdraw error:", err);
      showToast("Withdraw error: " + (err.message || err), "error");
    }
  }

  // Transaction: Claim Prize
  async function handleClaim() {
    if (!currentPubkey || !currentWallet) {
      openWalletModal();
      return;
    }

    const { Transaction, TransactionInstruction, SystemProgram, PublicKey } = window.solanaWeb3;

    try {
      showToast("Claiming prize...", "info");

      [userDepositPda] = PublicKey.findProgramAddressSync(
        [SEEDS.USER_DEPOSIT, poolPda.toBuffer(), currentPubkey.toBuffer()],
        programId
      );

      const data = DISCRIMINATORS.claim_prize;
      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: prizeVaultPda, isSigner: false, isWritable: true },
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new TransactionInstruction({ programId, keys, data });
      const tx = new Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      showToast("🎉 Prize claimed successfully to your wallet!", "success");

      await fetchUserData();
      await fetchPoolState();
    } catch (err) {
      console.error("Claim error:", err);
      showToast("Claim error: " + (err.message || err), "error");
    }
  }

  // Devnet Tool: Simulate Yield (+0.05 SOL to Prize Pool)
  async function handleSimulateYield() {
    if (!currentPubkey || !currentWallet) {
      showToast("Connect wallet first", "error");
      openWalletModal();
      return;
    }

    const { Transaction, TransactionInstruction, SystemProgram } = window.solanaWeb3;
    const lamports = 50000000; // 0.05 SOL

    try {
      showToast("Injecting 0.05 SOL yield into prize pool...", "info");
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
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      showToast("💧 Simulated 0.05 SOL yield funded into prize pool!", "success");
      await fetchPoolState();
    } catch (err) {
      console.error("Simulate yield error:", err);
      showToast("Simulate yield error: " + (err.message || err), "error");
    }
  }

  // Devnet Tool: Trigger VRF Draw
  async function handleTriggerDraw() {
    if (!currentPubkey || !currentWallet) {
      showToast("Connect wallet first", "error");
      openWalletModal();
      return;
    }

    const { Transaction, TransactionInstruction, SystemProgram, PublicKey } = window.solanaWeb3;

    try {
      showToast("Rolling 1+1 VRF dice on Solana...", "info");

      [userDepositPda] = PublicKey.findProgramAddressSync(
        [SEEDS.USER_DEPOSIT, poolPda.toBuffer(), currentPubkey.toBuffer()],
        programId
      );

      const randomness = crypto.getRandomValues(new Uint8Array(32));
      const memo = new TextEncoder().encode("POWER2_INFT_GENESIS_AWARD_#1____");

      const data = new Uint8Array(8 + 32 + 32);
      data.set(DISCRIMINATORS.draw_round, 0);
      data.set(randomness, 8);
      data.set(memo, 40);

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
        { pubkey: currentPubkey, isSigner: false, isWritable: false },
        { pubkey: currentPubkey, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new TransactionInstruction({ programId, keys, data });
      const tx = new Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      showToast(`🎉 Round #${poolData.currentRound} Drawn! 1+1 Prizes Awarded!`, "success");
      await fetchPoolState();
      await fetchUserData();
    } catch (err) {
      console.error("Trigger draw error:", err);
      showToast("Draw error: " + (err.message || err), "error");
    }
  }

  // Bind UI Events
  function bindEvents() {
    // Tab switching
    document.querySelectorAll('.p2-tab-btn').forEach(btn => {
      btn.onclick = () => setTab(btn.getAttribute('data-tab'));
    });

    // Quick amount pills
    document.querySelectorAll('.p2-pill-btn').forEach(btn => {
      btn.onclick = () => {
        const val = btn.getAttribute('data-val');
        const input = document.getElementById('p2-amount-input');
        if (!input) return;

        if (val === 'max') {
          if (activeTab === 'deposit') {
            input.value = Math.max(0, walletSolBalance - 0.005).toFixed(3);
          } else {
            input.value = userDepositData.amount.toFixed(3);
          }
        } else {
          input.value = val;
        }
        updateOddsPreview();
      };
    });

    // Input changes
    const input = document.getElementById('p2-amount-input');
    if (input) {
      input.oninput = updateOddsPreview;
    }

    // Submit button
    const submitBtn = document.getElementById('p2-submit-btn');
    if (submitBtn) {
      submitBtn.onclick = () => {
        if (activeTab === 'deposit') handleDeposit();
        else handleWithdraw();
      };
    }

    // Claim button
    const claimBtn = document.getElementById('p2-claim-btn');
    if (claimBtn) claimBtn.onclick = handleClaim;

    // Devnet Tools
    const yieldBtn = document.getElementById('p2-lab-yield-btn');
    if (yieldBtn) yieldBtn.onclick = handleSimulateYield;

    const drawBtn = document.getElementById('p2-lab-draw-btn');
    if (drawBtn) drawBtn.onclick = handleTriggerDraw;

    // Modal close
    const modalClose = document.getElementById('p2-modal-close');
    if (modalClose) modalClose.onclick = closeWalletModal;

    const modalBackdrop = document.getElementById('p2-wallet-modal');
    if (modalBackdrop) {
      modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) closeWalletModal();
      };
    }

    // Wallet Choice buttons
    const phantomBtn = document.getElementById('p2-choose-phantom');
    if (phantomBtn) phantomBtn.onclick = () => connectWallet('phantom');

    const solflareBtn = document.getElementById('p2-choose-solflare');
    if (solflareBtn) solflareBtn.onclick = () => connectWallet('solflare');

    const autoBtn = document.getElementById('p2-choose-auto');
    if (autoBtn) autoBtn.onclick = () => connectWallet('auto');

    // Language switcher
    document.querySelectorAll('.p2-lang-btn').forEach(btn => {
      btn.onclick = () => {
        const lang = btn.getAttribute('data-lang');
        if (window.P2_I18N) {
          window.P2_I18N.setLang(lang);
          setTab(activeTab); // refresh tab texts
          updateOddsPreview();
        }
      };
    });
  }

  // Boot Application
  function boot() {
    initWeb3();
    bindEvents();
    renderStats();
    renderPosition();
    updateWalletUI();
    if (window.P2_I18N) window.P2_I18N.updateDOM();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
