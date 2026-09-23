/**
 * POWER2 Landing Page Initializer
 * Injects Language Switcher and "Use Power2" CTA button slightly below the top navbar.
 * Safe, non-blocking translation without recursive MutationObservers.
 */
(function() {
  'use strict';

  var NAV_MAP = {
    en: {
      "Prize ( 1 + 1 )": "Prize ( 1 + 1 )",
      "Roadmap": "Roadmap",
      "Community": "Community",
      "Whitepaper": "Whitepaper",
      "雙重獎項 ( 1 + 1 )": "Prize ( 1 + 1 )",
      "路線圖": "Roadmap",
      "社群": "Community",
      "白皮書": "Whitepaper"
    },
    zh: {
      "Prize ( 1 + 1 )": "雙重獎項 ( 1 + 1 )",
      "Roadmap": "路線圖",
      "Community": "社群",
      "Whitepaper": "白皮書",
      "雙重獎項 ( 1 + 1 )": "雙重獎項 ( 1 + 1 )",
      "路線圖": "路線圖",
      "社群": "社群",
      "白皮書": "白皮書"
    }
  };

  function translateNavItems(lang) {
    var map = NAV_MAP[lang] || NAV_MAP.en;
    var links = document.querySelectorAll('li, a');
    links.forEach(function(el) {
      if (el.children.length === 0) {
        var text = (el.textContent || '').trim();
        if (map[text] && map[text] !== text) {
          el.textContent = map[text];
        }
      }
    });

    var ctaText = document.getElementById('p2-cta-label');
    if (ctaText) {
      ctaText.textContent = lang === 'zh' ? '進入 Power2' : 'Use Power2';
    }
  }

  function initLanding() {
    if (document.getElementById('p2-landing-actions')) return;

    var bar = document.createElement('div');
    bar.className = 'p2-landing-action-bar';
    bar.id = 'p2-landing-actions';

    var currentLang = (window.P2_I18N && window.P2_I18N.currentLang) || localStorage.getItem('p2_lang') || 'en';
    var isSubpath = window.location.pathname.startsWith('/p-2');
    var appUrl = isSubpath ? '/p-2/app/' : './app/';

    bar.innerHTML = `
      <div class="p2-lang-switch">
        <button type="button" class="p2-lang-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
        <button type="button" class="p2-lang-btn ${currentLang === 'zh' ? 'active' : ''}" data-lang="zh">繁中</button>
      </div>
      <a href="${appUrl}" class="p2-use-app-btn" id="p2-launch-btn">
        <span class="p2-pulse-dot" style="background:#00F5A0; width:8px; height:8px; border-radius:50%; box-shadow:0 0 8px #00F5A0;"></span>
        <span id="p2-cta-label">${currentLang === 'zh' ? '進入 Power2' : 'Use Power2'}</span>
        <span class="arrow">→</span>
      </a>
    `;

    document.body.appendChild(bar);

    // Event listeners for lang switch
    bar.querySelectorAll('.p2-lang-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var lang = this.getAttribute('data-lang');
        bar.querySelectorAll('.p2-lang-btn').forEach(function(b) {
          b.classList.toggle('active', b.getAttribute('data-lang') === lang);
        });
        if (window.P2_I18N) {
          window.P2_I18N.setLang(lang);
        }
        translateNavItems(lang);
      });
    });

    // Translate once after React finishes rendering
    setTimeout(function() {
      translateNavItems(currentLang);
    }, 1000);
    setTimeout(function() {
      translateNavItems(currentLang);
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanding);
  } else {
    initLanding();
  }
})();
