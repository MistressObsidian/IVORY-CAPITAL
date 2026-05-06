(function () {
  var body = document.body;
  var navToggle = document.querySelector('[data-nav-toggle]');
  var sidebarToggle = document.querySelector('[data-sidebar-toggle]');
  var panel = document.querySelector('[data-translate-panel]');
  var authModal = document.querySelector('[data-auth-modal]');
  var authOpeners = Array.prototype.slice.call(document.querySelectorAll('[data-auth-open]'));
  var authTabs = Array.prototype.slice.call(document.querySelectorAll('[data-auth-tab]'));
  var authPanels = Array.prototype.slice.call(document.querySelectorAll('[data-auth-panel]'));
  var authForms = Array.prototype.slice.call(document.querySelectorAll('[data-auth-form]'));
  var translateButtons = Array.prototype.slice.call(document.querySelectorAll('[data-translate-toggle]'));

  if (navToggle) {
    navToggle.addEventListener('click', function () {
      body.classList.toggle('nav-open');
    });
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function () {
      body.classList.toggle('sidebar-open');
    });
  }

  function setAuthView(view) {
    if (!authModal) {
      return;
    }

    authTabs.forEach(function (tab) {
      var active = tab.getAttribute('data-auth-tab') === view;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    authPanels.forEach(function (panelNode) {
      var active = panelNode.getAttribute('data-auth-panel') === view;
      panelNode.classList.toggle('is-active', active);
    });
  }

  function openAuthModal(view) {
    if (!authModal) {
      return;
    }

    setAuthView(view || 'login');
    authModal.classList.add('is-open');
    authModal.setAttribute('aria-hidden', 'false');
    body.classList.add('modal-open');
  }

  function closeAuthModal() {
    if (!authModal) {
      return;
    }

    authModal.classList.remove('is-open');
    authModal.setAttribute('aria-hidden', 'true');
    body.classList.remove('modal-open');
  }

  authOpeners.forEach(function (opener) {
    opener.addEventListener('click', function (event) {
      if (!authModal) {
        return;
      }

      event.preventDefault();
      openAuthModal(opener.getAttribute('data-auth-open'));
    });
  });

  authTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      setAuthView(tab.getAttribute('data-auth-tab'));
    });
  });

  if (authModal) {
    authModal.addEventListener('click', function (event) {
      if (event.target.hasAttribute('data-auth-close')) {
        closeAuthModal();
      }
    });
  }

  authForms.forEach(function (form) {
    form.addEventListener('submit', function (event) {
      var feedback = form.querySelector('[data-auth-feedback]');
      event.preventDefault();

      if (!feedback) {
        return;
      }

      feedback.textContent = form.getAttribute('data-auth-form') === 'login'
        ? 'Login popup is active and ready for backend wiring. You can now connect this form to your live auth route.'
        : 'Registration popup is active and ready for onboarding logic. You can now connect this form to your live create-account route.';
      feedback.classList.add('is-visible');
    });
  });

  function closeTranslatePanel() {
    if (panel) {
      panel.classList.remove('is-open');
    }
  }

  if (translateButtons.length && panel) {
    translateButtons.forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        panel.classList.toggle('is-open');
      });
    });

    document.addEventListener('click', function (event) {
      var clickedButton = translateButtons.some(function (button) {
        return button === event.target || button.contains(event.target);
      });

      if (!clickedButton && !panel.contains(event.target)) {
        closeTranslatePanel();
      }
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      body.classList.remove('nav-open');
      body.classList.remove('sidebar-open');
      closeTranslatePanel();
      closeAuthModal();
    }
  });

  if (!window.GoogleLanguageTranslatorInit) {
    window.GoogleLanguageTranslatorInit = function () {
      if (!window.google || !window.google.translate) {
        return;
      }
      new window.google.translate.TranslateElement({
        pageLanguage: 'en',
        autoDisplay: false,
        includedLanguages: 'af,sq,am,ar,hy,az,eu,be,bn,bs,bg,ca,ceb,ny,zh-CN,zh-TW,co,hr,cs,da,nl,en,eo,et,tl,fi,fr,fy,gl,ka,de,el,gu,ht,ha,haw,iw,hi,hmn,hu,is,ig,id,ga,it,ja,jw,kn,kk,km,ko,ku,ky,lo,la,lv,lt,lb,mk,mg,ml,ms,mt,mi,mr,mn,my,ne,no,ps,fa,pl,pt,pa,ro,ru,sr,sn,st,sd,si,sk,sl,sm,gd,so,es,su,sw,sv,tg,ta,te,th,tr,uk,ur,uz,vi,cy,xh,yi,yo,zu'
      }, 'google_language_translator');
    };
  }

  if (!document.querySelector('script[data-ivory-translate]')) {
    var translateScript = document.createElement('script');
    translateScript.src = 'https://translate.google.com/translate_a/element.js?cb=GoogleLanguageTranslatorInit';
    translateScript.async = true;
    translateScript.setAttribute('data-ivory-translate', 'true');
    document.head.appendChild(translateScript);
  }

  if (!window.__ivorySmartsuppBooted) {
    window.__ivorySmartsuppBooted = true;
    window._smartsupp = window._smartsupp || {};
    window._smartsupp.key = '5fd4930c27a59c7ea8e9f62211c10dd41c54db5e';
    window.smartsupp = window.smartsupp || (function (documentRef) {
      var api = function () { api._.push(arguments); };
      api._ = [];
      var firstScript = documentRef.getElementsByTagName('script')[0];
      var script = documentRef.createElement('script');
      script.type = 'text/javascript';
      script.charset = 'utf-8';
      script.async = true;
      script.src = 'https://www.smartsuppchat.com/loader.js?';
      firstScript.parentNode.insertBefore(script, firstScript);
      return api;
    }(document));
  }
}());
