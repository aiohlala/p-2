/**
 * POWER2 i18n Translation Dictionary
 * Supports English (en) and Traditional Chinese (zh-TW)
 */
window.P2_I18N = {
  currentLang: localStorage.getItem('p2_lang') || 'en',

  translations: {
    en: {
      // Nav & Common
      "nav.prize": "Prize ( 1 + 1 )",
      "nav.roadmap": "Roadmap",
      "nav.community": "Community",
      "nav.whitepaper": "Whitepaper",
      "nav.use_app": "Use Power2",
      "nav.back_home": "← Home",
      "nav.connect_wallet": "Connect Wallet",
      "nav.disconnect": "Disconnect",

      // Landing Hero & Section
      "hero.title": "POWER2 NO-LOSS CUBE",
      "hero.subtitle": "WIN 1 + 1 PRIZES, EVERY SINGLE DAY",
      "hero.cta": "Launch App (Use Power2)",

      // dApp Header & Stats
      "app.title": "POWER2 NO-LOSS LOTTO",
      "app.desc": "Save tokens with 100% principal protection and win dual 1+1 prizes every round.",
      "stats.tvl": "Total Pool TVL",
      "stats.round": "Current Round",
      "stats.prize_crypto": "1+1 Crypto Prize",
      "stats.prize_nft": "1+1 Bonus Prize",
      "stats.nft_value": "Exclusive iNFT 🎨",
      "stats.round_active": "ACTIVE",

      // User Position
      "user.principal": "My Deposited Principal",
      "user.guarantee": "100% No-Loss Guaranteed",
      "user.odds": "Winning Odds",
      "user.unclaimed": "Unclaimed Prizes",
      "user.claim_btn": "🏆 Claim Prize",

      // Actions Tabs & Forms
      "tab.deposit": "📥 Deposit SOL",
      "tab.withdraw": "📤 Withdraw SOL",
      "form.amount_placeholder": "Amount (e.g. 0.05)",
      "form.balance": "Wallet Balance",
      "form.max": "MAX",
      "form.deposit_btn": "Deposit Principal",
      "form.withdraw_btn": "Withdraw Principal (0% Fee)",
      "form.deposit_note": "New deposits become active lottery tickets starting the next round (Anti-Flash-Loan).",
      "form.withdraw_note": "You can withdraw your full principal at any time without fees or lockups.",

      // Security Badges
      "sec.anti_flash": "Anti-Flash-Loan & Checked Math protected on Solana. Zero loss risk.",
      "sec.charity": "1% net interest automatically donated to animal charities.",

      // Devnet Lab
      "devnet.title": "🧪 Devnet Testing Tools",
      "devnet.cluster": "Cluster: Devnet",
      "devnet.init": "⚙️ Init Pool",
      "devnet.yield": "💧 Simulate Yield (+0.05 SOL)",
      "devnet.draw": "🎲 Trigger Draw (VRF)",

      // Wallet selection
      "wallet.select_title": "Connect your Solana Wallet:",
      "wallet.phantom": "Phantom",
      "wallet.solflare": "Solflare",
      "wallet.auto": "Auto-Detect Default",
      "wallet.not_connected": "No Wallet Connected",
      "wallet.please_connect": "Please connect your wallet to view balance and participate."
    },
    zh: {
      // Nav & Common
      "nav.prize": "雙重獎項 ( 1 + 1 )",
      "nav.roadmap": "路線圖",
      "nav.community": "社群",
      "nav.whitepaper": "白皮書",
      "nav.use_app": "進入 Power2 App",
      "nav.back_home": "← 返回官網",
      "nav.connect_wallet": "連接錢包",
      "nav.disconnect": "斷開連線",

      // Landing Hero & Section
      "hero.title": "POWER2 無損魔方",
      "hero.subtitle": "每日贏取 1 + 1 雙重獎項，本金 100% 零損失",
      "hero.cta": "進入 Power2 (Use Power2)",

      // dApp Header & Stats
      "app.title": "POWER2 無損雙重樂透",
      "app.desc": "存入代幣賺取利息，享受 100% 本金保障，每輪抽 1+1 加密貨幣與獨家 NFT 雙獎。",
      "stats.tvl": "資金池總鎖倉量 (TVL)",
      "stats.round": "當前開獎輪次",
      "stats.prize_crypto": "1+1 加密貨幣獎池",
      "stats.prize_nft": "1+1 加碼獎品",
      "stats.nft_value": "獨家創世 iNFT 🎨",
      "stats.round_active": "進行中",

      // User Position
      "user.principal": "我的存款本金",
      "user.guarantee": "100% 零本金損失保障",
      "user.odds": "中獎機率",
      "user.unclaimed": "待領取獎金",
      "user.claim_btn": "🏆 領取中獎獎金",

      // Actions Tabs & Forms
      "tab.deposit": "📥 存入 SOL",
      "tab.withdraw": "📤 提取 SOL",
      "form.amount_placeholder": "輸入數量 (如 0.05)",
      "form.balance": "錢包可用餘額",
      "form.max": "最大",
      "form.deposit_btn": "存入本金",
      "form.withdraw_btn": "提取本金 (零手續費)",
      "form.deposit_note": "新存入資金於下一輪正式生效參與抽獎（防閃電貸攻擊）。",
      "form.withdraw_note": "隨時可全額取回本金，零手續費、零鎖倉期。",

      // Security Badges
      "sec.anti_flash": "Solana 鏈上防閃電貸與安全溢出保護，本金絕無虧損風險。",
      "sec.charity": "開獎利息 1% 自動撥入動物慈善基金。",

      // Devnet Lab
      "devnet.title": "🧪 Devnet 測試工具箱",
      "devnet.cluster": "網絡: Solana Devnet",
      "devnet.init": "⚙️ 初始化獎池",
      "devnet.yield": "💧 注入模擬利息 (+0.05 SOL)",
      "devnet.draw": "🎲 執行隨機開獎 (VRF)",

      // Wallet selection
      "wallet.select_title": "請選擇 Solana 錢包連接：",
      "wallet.phantom": "Phantom 錢包",
      "wallet.solflare": "Solflare 錢包",
      "wallet.auto": "自動偵測預設錢包",
      "wallet.not_connected": "尚未連接錢包",
      "wallet.please_connect": "請先連接錢包以查看存款與參與抽獎。"
    }
  },

  t: function(key) {
    var lang = this.currentLang === 'zh' ? 'zh' : 'en';
    return (this.translations[lang] && this.translations[lang][key]) || 
           (this.translations['en'] && this.translations['en'][key]) || key;
  },

  setLang: function(lang) {
    this.currentLang = lang;
    localStorage.setItem('p2_lang', lang);
    this.updateDOM();
  },

  updateDOM: function() {
    var self = this;
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      var text = self.t(key);
      if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
        el.setAttribute('placeholder', text);
      } else {
        el.textContent = text;
      }
    });

    // Update active state on lang switcher buttons
    document.querySelectorAll('.p2-lang-btn').forEach(function(btn) {
      var btnLang = btn.getAttribute('data-lang');
      if (btnLang === self.currentLang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }
};
