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
    USER_DEPOSIT: new TextEncoder().encode("user-deposit")
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
    totalDeposit: 40000000, // 0.040 SOL fallback
    currentRound: 2,
    accumulatedPrizes: 0,
    isInitialized: true
  };

  let userDepositData = {
    amount: 10000000, // 0.010 SOL default
    effectiveAmount: 10000000,
    unclaimedPrizes: 0,
    hasAccount: true
  };

  let activeTab = 'deposit'; // 'deposit' | 'withdraw'

  // Initialize Web3 Connection and PDAs
  function initWeb3() {
    if (typeof window.solanaWeb3 === 'undefined') {
      setTimeout(initWeb3, 150);
      return;
    }

    try {
      connection = new window.solanaWeb3.Connection(DEVNET_RPC, "confirmed");
      programId = new window.solanaWeb3.PublicKey(PROGRAM_ID_STR);

      poolPda = window.solanaWeb3.PublicKey.findProgramAddressSync([SEEDS.POOL], programId)[0];
      vaultPda = window.solanaWeb3.PublicKey.findProgramAddressSync([SEEDS.VAULT], programId)[0];
      prizeVaultPda = window.solanaWeb3.PublicKey.findProgramAddressSync([SEEDS.PRIZE_VAULT], programId)[0];

      // Refresh on-chain pool status
      fetchPoolOnChain();
    } catch (err) {
      console.warn("Web3 Init notice:", err);
    }
  }

  // Fetch Pool State from Devnet
  async function fetchPoolOnChain() {
    if (!connection || !poolPda) return;
    try {
      const accountInfo = await connection.getAccountInfo(poolPda);
      if (accountInfo && accountInfo.data.length >= 72) {
        const view = new DataView(accountInfo.data.buffer, accountInfo.data.byteOffset, accountInfo.data.byteLength);
        poolData.totalDeposit = Number(view.getBigUint64(40, true));
        poolData.currentRound = Number(view.getBigUint64(48, true));
        poolData.accumulatedPrizes = Number(view.getBigUint64(56, true));
        poolData.isInitialized = true;
      }
      renderStats();
    } catch (e) {
      console.warn("Error fetching on-chain pool data:", e);
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

      // 2. User Deposit PDA
      userDepositPda = window.solanaWeb3.PublicKey.findProgramAddressSync(
        [SEEDS.USER_DEPOSIT, currentPubkey.toBuffer()],
        programId
      )[0];

      const acc = await connection.getAccountInfo(userDepositPda);
      if (acc && acc.data.length >= 72) {
        const view = new DataView(acc.data.buffer, acc.data.byteOffset, acc.data.byteLength);
        userDepositData.amount = Number(view.getBigUint64(40, true));
        userDepositData.effectiveAmount = Number(view.getBigUint64(48, true));
        userDepositData.unclaimedPrizes = Number(view.getBigUint64(64, true));
        userDepositData.hasAccount = true;
      } else {
        userDepositData.amount = 0;
        userDepositData.effectiveAmount = 0;
        userDepositData.unclaimedPrizes = 0;
        userDepositData.hasAccount = false;
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

    if (tvlEl) tvlEl.textContent = (poolData.totalDeposit / 1e9).toFixed(3) + ' SOL';
    if (roundEl) roundEl.textContent = 'Round #' + poolData.currentRound;
    if (prizeCryptoEl) prizeCryptoEl.textContent = (poolData.accumulatedPrizes / 1e9).toFixed(3) + ' SOL';
  }

  // Render User Position
  function renderPosition() {
    const principalEl = document.getElementById('p2-pos-principal');
    const oddsPctEl = document.getElementById('p2-pos-odds-pct');
    const oddsFillEl = document.getElementById('p2-pos-odds-fill');
    const unclaimedEl = document.getElementById('p2-pos-unclaimed');
    const claimBtn = document.getElementById('p2-claim-btn');

    const principalSol = userDepositData.amount / 1e9;
    if (principalEl) principalEl.textContent = principalSol.toFixed(3) + ' SOL';

    // Calculate Winning Odds
    let odds = 0;
    if (poolData.totalDeposit > 0) {
      odds = Math.min(100, (userDepositData.effectiveAmount / poolData.totalDeposit) * 100);
    }
    if (oddsPctEl) oddsPctEl.textContent = odds.toFixed(1) + '%';
    if (oddsFillEl) oddsFillEl.style.width = odds.toFixed(1) + '%';

    // Unclaimed Prizes
    const unclaimedSol = userDepositData.unclaimedPrizes / 1e9;
    if (unclaimedEl) unclaimedEl.textContent = unclaimedSol.toFixed(3) + ' SOL';
    if (claimBtn) {
      claimBtn.disabled = unclaimedSol <= 0;
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
      const newTotal = (userDepositData.amount / 1e9) + val;
      const newPool = (poolData.totalDeposit / 1e9) + val;
      const newOdds = Math.min(100, (newTotal / newPool) * 100).toFixed(1);

      if (lang === 'zh') {
        previewEl.innerHTML = `💡 存入 <b>${val} SOL</b> 後，總本金將為 <b>${newTotal.toFixed(3)} SOL</b>（預估中獎率約 <b>${newOdds}%</b>）`;
      } else {
        previewEl.innerHTML = `💡 Depositing <b>${val} SOL</b> brings principal to <b>${newTotal.toFixed(3)} SOL</b> (~<b>${newOdds}%</b> winning odds)`;
      }
    } else {
      const remaining = Math.max(0, (userDepositData.amount / 1e9) - val);
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
      await fetchPoolOnChain();
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

    try {
      showToast("Preparing deposit transaction...", "info");
      const data = new Uint8Array(16);
      data.set(DISCRIMINATORS.deposit, 0);
      const view = new DataView(data.buffer);
      view.setBigUint64(8, BigInt(lamports), true);

      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: window.solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new window.solanaWeb3.TransactionInstruction({
        programId,
        keys,
        data
      });

      const tx = new window.solanaWeb3.Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      showToast(`Transaction sent! Waiting confirmation... (Sig: ${sig.slice(0, 8)}...)`, "info");

      await connection.confirmTransaction(sig, "confirmed");
      showToast(`🎉 Successfully deposited ${amountSol} SOL! 100% safe.`, "success");

      input.value = '';
      await fetchUserData();
      await fetchPoolOnChain();
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
    const amountSol = parseFloat(input.value);
    if (!amountSol || amountSol <= 0) {
      showToast("Please enter a valid amount to withdraw.", "error");
      return;
    }

    const lamports = Math.floor(amountSol * 1e9);

    try {
      showToast("Preparing withdraw transaction...", "info");
      const data = new Uint8Array(16);
      data.set(DISCRIMINATORS.withdraw, 0);
      const view = new DataView(data.buffer);
      view.setBigUint64(8, BigInt(lamports), true);

      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: window.solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new window.solanaWeb3.TransactionInstruction({
        programId,
        keys,
        data
      });

      const tx = new window.solanaWeb3.Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      showToast(`Transaction sent! Waiting confirmation... (Sig: ${sig.slice(0, 8)}...)`, "info");

      await connection.confirmTransaction(sig, "confirmed");
      showToast(`🎉 Successfully retrieved ${amountSol} SOL! Zero fees applied.`, "success");

      input.value = '';
      await fetchUserData();
      await fetchPoolOnChain();
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

    try {
      showToast("Claiming prize...", "info");
      const data = DISCRIMINATORS.claim_prize;
      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: prizeVaultPda, isSigner: false, isWritable: true },
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true },
        { pubkey: window.solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new window.solanaWeb3.TransactionInstruction({
        programId,
        keys,
        data
      });

      const tx = new window.solanaWeb3.Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      showToast("🎉 Prize claimed successfully to your wallet!", "success");

      await fetchUserData();
      await fetchPoolOnChain();
    } catch (err) {
      console.error("Claim error:", err);
      showToast("Claim error: " + (err.message || err), "error");
    }
  }

  // Devnet Tool: Simulate Yield (+0.05 SOL to Prize Pool)
  async function handleSimulateYield() {
    if (!currentPubkey || !currentWallet) {
      openWalletModal();
      return;
    }

    try {
      showToast("Simulating 0.05 SOL yield transfer...", "info");
      const lamports = 50000000; // 0.05 SOL
      const tx = new window.solanaWeb3.Transaction().add(
        window.solanaWeb3.SystemProgram.transfer({
          fromPubkey: currentPubkey,
          toPubkey: prizeVaultPda,
          lamports
        })
      );
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      showToast("💧 Added +0.05 SOL simulated yield to Prize Vault!", "success");
      await fetchPoolOnChain();
    } catch (err) {
      console.error("Simulate yield error:", err);
      showToast("Simulate yield error: " + (err.message || err), "error");
    }
  }

  // Devnet Tool: Trigger VRF Draw
  async function handleTriggerDraw() {
    if (!currentPubkey || !currentWallet) {
      openWalletModal();
      return;
    }

    try {
      showToast("Triggering VRF Random Draw...", "info");
      const roundDrawPda = window.solanaWeb3.PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("round-draw"), new Uint8Array(new BigUint64Array([BigInt(poolData.currentRound)]).buffer)],
        programId
      )[0];

      const charityWallet = new window.solanaWeb3.PublicKey("11111111111111111111111111111111");

      const data = DISCRIMINATORS.draw_round;
      const keys = [
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: prizeVaultPda, isSigner: false, isWritable: true },
        { pubkey: roundDrawPda, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: false, isWritable: true }, // Winner account
        { pubkey: userDepositPda, isSigner: false, isWritable: true },
        { pubkey: charityWallet, isSigner: false, isWritable: true },
        { pubkey: currentPubkey, isSigner: true, isWritable: true }, // Operator
        { pubkey: window.solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false }
      ];

      const ix = new window.solanaWeb3.TransactionInstruction({
        programId,
        keys,
        data
      });

      const tx = new window.solanaWeb3.Transaction().add(ix);
      tx.feePayer = currentPubkey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const signedTx = await currentWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      showToast("🎲 VRF Round Draw executed! Round has advanced.", "success");
      await fetchPoolOnChain();
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
            input.value = (userDepositData.amount / 1e9).toFixed(3);
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
