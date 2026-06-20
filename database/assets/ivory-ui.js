(function () {
  var body = document.body;
  var navToggle = document.querySelector('[data-nav-toggle]');
  var sidebarToggle = document.querySelector('[data-sidebar-toggle]');
  var panel = document.querySelector('[data-translate-panel]');
  var authModal = document.querySelector('[data-auth-modal]');
  var authOpeners = Array.prototype.slice.call(document.querySelectorAll('[data-auth-open]'));
  var authClosers = Array.prototype.slice.call(document.querySelectorAll('[data-auth-close]'));
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

  function switchAuthTab(view) {
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

    switchAuthTab(view || 'login');
    authModal.classList.add('is-visible');
    authModal.setAttribute('aria-hidden', 'false');
    body.style.overflow = 'hidden';
  }

  function closeAuthModal() {
    if (!authModal) {
      return;
    }

    authModal.classList.remove('is-visible');
    authModal.setAttribute('aria-hidden', 'true');
    body.style.overflow = '';
  }

  function getApiBase() {
    if (window.location.protocol === 'file:') {
      return 'http://127.0.0.1:3000';
    }

    if (window.location.origin === 'null') {
      return 'http://127.0.0.1:3000';
    }

    return window.location.origin;
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

  authClosers.forEach(function (closer) {
    closer.addEventListener('click', function () {
      closeAuthModal();
    });
  });

  authTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      switchAuthTab(tab.getAttribute('data-auth-tab'));
    });
  });

  window.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && authModal && authModal.classList.contains('is-visible')) {
      closeAuthModal();
    }
  });

  authForms.forEach(function (form) {
    form.addEventListener('submit', async function (event) {
      var feedback = form.querySelector('[data-auth-feedback]');
      var formType = form.getAttribute('data-auth-form');
      var endpoint = formType === 'register' ? '/api/auth/register' : '/api/auth/login';
      var submitButton = form.querySelector('button[type="submit"]');
      var submitLabel = submitButton ? submitButton.textContent : '';
      var keepDisabled = false;
      var payload;

      event.preventDefault();

      if (!feedback) {
        return;
      }

      payload = Object.fromEntries(new FormData(form).entries());
      feedback.classList.remove('is-error', 'is-visible');
      feedback.textContent = 'Processing request...';
      feedback.classList.add('is-visible');

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = formType === 'register' ? 'Creating account...' : 'Signing in...';
      }

      try {
        var response = await fetch(getApiBase() + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        var result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.message || 'Authentication request failed.');
        }

        if (result.user) {
          localStorage.setItem('ivoryCapitalUser', JSON.stringify(result.user));
        }

        feedback.classList.remove('is-error');
        feedback.textContent = result.message || 'Authentication successful.';
        feedback.classList.add('is-visible');
        keepDisabled = true;

        setTimeout(function () {
          window.location.href = result.redirectTo || (getApiBase() + '/server/dashboard/');
        }, 800);
      } catch (error) {
        feedback.classList.add('is-error', 'is-visible');
        feedback.textContent = error.message || 'Unable to reach the authentication service.';
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = submitLabel;
        }
      }

      if (!keepDisabled && submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
    });
  });

  function safeParseJson(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function getStoredUser() {
    if (!window.localStorage) {
      return null;
    }

    return safeParseJson(window.localStorage.getItem('ivoryCapitalUser'));
  }

  function setStoredUser(user) {
    if (!window.localStorage || !user) {
      return;
    }

    window.localStorage.setItem('ivoryCapitalUser', JSON.stringify(user));
  }

  function normalizePathname(pathname) {
    if (!pathname) {
      return '/';
    }

    return pathname.endsWith('/') ? pathname : pathname + '/';
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function formatNumber(value, fractionDigits) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits
    });
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    }).format(new Date(value));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[character];
    });
  }

  function getDashboardUserId() {
    var storedUser = getStoredUser();
    var queryUserId = Number(new URLSearchParams(window.location.search).get('userId'));

    if (Number.isInteger(queryUserId) && queryUserId > 0) {
      return queryUserId;
    }

    if (storedUser && Number(storedUser.id) > 0) {
      return Number(storedUser.id);
    }

    return null;
  }

  function renderDashboardNotice(title, message) {
    var dashboardMain = document.querySelector('.dashboard-main');
    var existingNotice = document.querySelector('[data-dashboard-notice]');

    if (!dashboardMain || existingNotice) {
      return;
    }

    var notice = document.createElement('article');
    notice.className = 'notice-card';
    notice.setAttribute('data-dashboard-notice', 'true');
    notice.innerHTML = '' +
      '<div class="panel-kicker">' + escapeHtml(title) + '</div>' +
      '<h3>Live data unavailable</h3>' +
      '<p>' + escapeHtml(message) + '</p>';
    dashboardMain.prepend(notice);
  }

  function clearDashboardNotice() {
    var existingNotice = document.querySelector('[data-dashboard-notice]');

    if (existingNotice && existingNotice.parentNode) {
      existingNotice.parentNode.removeChild(existingNotice);
    }
  }

  function isLocalDevelopmentHost() {
    return window.location.protocol === 'file:' || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
  }

  function ensurePageFeedback() {
    var dashboardMain = document.querySelector('.dashboard-main');
    var feedback = document.querySelector('[data-page-feedback]');

    if (!dashboardMain) {
      return null;
    }

    if (!feedback) {
      feedback = document.createElement('p');
      feedback.className = 'auth-feedback';
      feedback.setAttribute('data-page-feedback', 'true');
      dashboardMain.prepend(feedback);
    }

    return feedback;
  }

  function setPageFeedback(message, isError) {
    var feedback = ensurePageFeedback();

    if (!feedback) {
      return;
    }

    feedback.classList.remove('is-error', 'is-visible');
    feedback.textContent = '';

    if (!message) {
      return;
    }

    feedback.textContent = message;
    feedback.classList.add('is-visible');

    if (isError) {
      feedback.classList.add('is-error');
    }
  }

  function ensureDashboardShellEnhancements() {
    var shell = document.querySelector('.dashboard-shell');
    var topbarInner;
    var topbarLead;
    var titleBlock;
    var sidebarLinks;
    var operationsLink;
    var notificationsLink;
    var backdrop;
    var toggleButton;
    var pathname = normalizePathname(window.location.pathname);

    if (!shell) {
      return;
    }

    sidebarLinks = shell.querySelector('.sidebar-links');
    if (sidebarLinks && !sidebarLinks.querySelector('[data-operations-link]') && !sidebarLinks.querySelector('a[href*="/operations/"]')) {
      operationsLink = document.createElement('a');
      operationsLink.className = 'dashboard-link' + (pathname === '/server/operations/' ? ' is-active' : '');
      operationsLink.href = getApiBase() + '/server/operations/';
      operationsLink.setAttribute('data-operations-link', 'true');
      operationsLink.innerHTML = '<span class="dot"></span><span>Operations</span>';
      notificationsLink = sidebarLinks.querySelector('a[href*="notifications"]');

      if (notificationsLink && notificationsLink.nextSibling) {
        sidebarLinks.insertBefore(operationsLink, notificationsLink.nextSibling);
      } else {
        sidebarLinks.appendChild(operationsLink);
      }
    }

    topbarInner = shell.querySelector('.dashboard-topbar-inner');
    if (topbarInner) {
      topbarLead = topbarInner.querySelector('.dashboard-topbar-lead');
      titleBlock = topbarLead ? topbarLead.querySelector('div') : topbarInner.firstElementChild;

      if (!topbarLead && titleBlock) {
        topbarLead = document.createElement('div');
        topbarLead.className = 'dashboard-topbar-lead';
        topbarInner.insertBefore(topbarLead, titleBlock);
        topbarLead.appendChild(titleBlock);
      }

      if (topbarLead && !topbarLead.querySelector('[data-sidebar-toggle]')) {
        toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'sidebar-toggle';
        toggleButton.setAttribute('data-sidebar-toggle', 'true');
        toggleButton.setAttribute('aria-label', 'Toggle dashboard sidebar');
        toggleButton.textContent = 'Menu';
        toggleButton.addEventListener('click', function () {
          body.classList.toggle('sidebar-open');
        });
        topbarLead.insertBefore(toggleButton, topbarLead.firstChild);
      }
    }

    backdrop = document.querySelector('[data-dashboard-backdrop]');
    if (!backdrop) {
      backdrop = document.createElement('button');
      backdrop.type = 'button';
      backdrop.className = 'dashboard-backdrop';
      backdrop.setAttribute('data-dashboard-backdrop', 'true');
      backdrop.setAttribute('aria-label', 'Close dashboard sidebar');
      backdrop.addEventListener('click', function () {
        body.classList.remove('sidebar-open');
      });
      body.appendChild(backdrop);
    }
  }

  function renderTableMeta(value) {
    if (!value) {
      return '';
    }

    return '<span class="table-meta">' + escapeHtml(value) + '</span>';
  }

  function renderActivitySummary(activity) {
    var transaction = activity && activity.transaction;
    var notification = activity && activity.notification;
    var summaryParts = [];

    if (!transaction) {
      return '';
    }

    summaryParts.push('Reference ' + transaction.referenceCode + ' is now stored in your Neon-backed ledger.');
    if (transaction.destinationReference) {
      summaryParts.push('Destination: ' + transaction.destinationReference + '.');
    }
    if (notification && notification.title) {
      summaryParts.push('Notification: ' + notification.title + '.');
    }

    return '' +
      '<article class="notice-card">' +
        '<div class="panel-kicker">Activity confirmation</div>' +
        '<h3>' + escapeHtml(transaction.entryType + ' recorded') + '</h3>' +
        '<p>' + escapeHtml(summaryParts.join(' ')) + '</p>' +
        '<div class="button-row">' +
          '<span class="inline-pill"><strong>Status</strong><span>' + escapeHtml(transaction.status) + '</span></span>' +
          '<span class="inline-pill"><strong>Amount</strong><span>' + formatCurrency(transaction.amount) + '</span></span>' +
          '<span class="inline-pill"><strong>Reference</strong><span>' + escapeHtml(transaction.referenceCode || 'Pending') + '</span></span>' +
        '</div>' +
      '</article>';
  }

  function setActionSummary(form, activity) {
    var panel = form.closest('.panel');
    var summary;

    if (!panel) {
      return;
    }

    summary = panel.querySelector('[data-action-summary]');
    if (!summary) {
      summary = document.createElement('div');
      summary.className = 'activity-summary';
      summary.setAttribute('data-action-summary', 'true');
      panel.appendChild(summary);
    }

    summary.innerHTML = renderActivitySummary(activity);
  }

  function setOperationsActivitySummary(activity) {
    var target = document.querySelector('[data-operations-activity]');

    if (!target) {
      return;
    }

    target.innerHTML = renderActivitySummary(activity);
  }

  function renderTransactionRows(transactions) {
    if (!transactions.length) {
      return '<tr><td colspan="4"><div class="empty-state">No live activity has been recorded yet.</div></td></tr>';
    }

    return transactions.map(function (transaction) {
      return '' +
        '<tr>' +
          '<td><strong>' + escapeHtml(transaction.assetCode) + '</strong>' + renderTableMeta(transaction.referenceCode) + '</td>' +
          '<td>' + escapeHtml(transaction.entryType) + renderTableMeta(transaction.notes) + '</td>' +
          '<td>' + escapeHtml(transaction.status) + renderTableMeta(transaction.approvedAt ? 'Approved ' + formatDate(transaction.approvedAt) : '') + '</td>' +
          '<td>' + formatCurrency(transaction.amount) + renderTableMeta(transaction.destinationReference) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderLedgerRows(transactions) {
    if (!transactions.length) {
      return '<tr><td colspan="4"><div class="empty-state">No ledger history is available yet.</div></td></tr>';
    }

    return transactions.map(function (transaction) {
      return '' +
        '<tr>' +
          '<td>' + formatDate(transaction.createdAt) + renderTableMeta(transaction.referenceCode) + '</td>' +
          '<td>' + escapeHtml(transaction.entryType + ' · ' + transaction.assetCode) + renderTableMeta(transaction.destinationReference || transaction.notes) + '</td>' +
          '<td>' + escapeHtml(transaction.status) + renderTableMeta(transaction.approvedAt ? 'Approved ' + formatDate(transaction.approvedAt) : '') + '</td>' +
          '<td>' + formatCurrency(transaction.amount) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderNotificationItems(notifications, options) {
    var showActions = options && options.showActions;

    if (!notifications.length) {
      return '<div class="empty-state">No notifications are waiting for action.</div>';
    }

    return notifications.map(function (notification) {
      var kicker = notification.isUnread ? 'Unread' : notification.category;
      var actionMarkup = showActions && notification.isUnread
        ? '<div class="notice-card-actions"><button class="button button-secondary inline-action" type="button" data-notification-read="' + String(notification.id) + '">Mark read</button></div>'
        : '';
      return '' +
        '<article class="notice-card">' +
          '<div class="panel-kicker">' + escapeHtml(kicker) + '</div>' +
          '<h3>' + escapeHtml(notification.title) + '</h3>' +
          '<p>' + escapeHtml(notification.body) + '</p>' +
          renderTableMeta((notification.referenceCode || 'No reference') + (notification.readAt ? ' · Read ' + formatDate(notification.readAt) : ' · Awaiting acknowledgement')) +
          actionMarkup +
        '</article>';
    }).join('');
  }

  function renderOperationsRows(transactions) {
    if (!transactions.length) {
      return '<tr><td colspan="5"><div class="empty-state">No withdrawals are waiting for manual approval.</div></td></tr>';
    }

    return transactions.map(function (transaction) {
      var actionMarkup = transaction.status === 'Review'
        ? '<div class="table-action-group"><button class="button button-secondary inline-action" type="button" data-approve-withdrawal="' + String(transaction.id) + '">Approve</button></div>'
        : renderTableMeta('Approved ' + formatDate(transaction.approvedAt || transaction.createdAt));

      return '' +
        '<tr>' +
          '<td><strong>' + escapeHtml(transaction.referenceCode || 'Pending') + '</strong>' + renderTableMeta(formatDate(transaction.createdAt)) + '</td>' +
          '<td>' + escapeHtml(transaction.assetCode) + renderTableMeta(transaction.destinationReference || 'Settlement reference pending') + '</td>' +
          '<td>' + escapeHtml(transaction.status) + '</td>' +
          '<td>' + formatCurrency(transaction.amount) + '</td>' +
          '<td>' + actionMarkup + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderAllocationCards(allocations) {
    return allocations.map(function (allocation) {
      var badge = allocation.assetGroup.split(' ').map(function (part) {
        return part.charAt(0);
      }).join('').slice(0, 3).toUpperCase();

      return '' +
        '<article class="card">' +
          '<div class="icon-badge">' + escapeHtml(badge) + '</div>' +
          '<h3>' + escapeHtml(allocation.assetGroup) + '</h3>' +
          '<p>' + formatNumber(allocation.allocationPct, 0) + '% allocation. ' + escapeHtml(allocation.description) + '</p>' +
        '</article>';
    }).join('');
  }

  function renderWalletCards(wallets) {
    return wallets.map(function (wallet) {
      var primaryValue = wallet.assetCode === 'USDT'
        ? formatCurrency(wallet.balance)
        : formatNumber(wallet.balance, wallet.assetCode === 'BTC' ? 6 : 4) + ' ' + wallet.assetCode;

      return '' +
        '<div class="metric-card">' +
          '<strong>' + primaryValue + '</strong>' +
          '<span>' + escapeHtml(wallet.assetName + ' · ' + formatCurrency(wallet.usdValue)) + '</span>' +
        '</div>';
    }).join('');
  }

  function renderWalletFundingList(wallets) {
    return wallets.map(function (wallet) {
      return '' +
        '<li>' +
          '<strong>' + escapeHtml(wallet.assetCode + ' · ' + wallet.network) + '</strong>' +
          '<span>' + escapeHtml(wallet.walletAddress) + '</span>' +
        '</li>';
    }).join('');
  }

  function renderDashboardHome(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var primaryPanel = document.querySelector('.panel-grid .panel:first-child');
    var summaryCards = primaryPanel ? primaryPanel.querySelectorAll('.metric-card') : [];
    var actionPanel = document.querySelector('.panel-grid .panel:last-child');
    var actionList = actionPanel ? actionPanel.querySelector('.notice-list') : null;
    var tableBody = document.querySelector('.table-shell tbody');
    var latestReference = data.transactions.length ? data.transactions[0].referenceCode : null;

    if (heading) {
      heading.textContent = data.user.firstName + "'s dashboard";
    }

    if (intro) {
      intro.textContent = 'Live account data for ' + data.user.email + '. ' + data.profile.riskProfile + ' profile with the ' + data.profile.strategyLane + ' strategy lane loaded from Neon.';
    }

    if (primaryPanel) {
      primaryPanel.querySelector('h2').textContent = formatCurrency(data.profile.totalBalance);
      primaryPanel.querySelector('p').textContent = 'Neon-backed balance across forex, crypto, and managed strategies. Withdrawal limit: ' + formatCurrency(data.profile.withdrawalLimit) + '.';
    }

    if (summaryCards.length >= 3) {
      summaryCards[0].querySelector('strong').textContent = formatCurrency(data.profile.availableCash);
      summaryCards[0].querySelector('span').textContent = 'Available cash';
      summaryCards[1].querySelector('strong').textContent = formatCurrency(data.profile.activeInvestments);
      summaryCards[1].querySelector('span').textContent = 'Active investments';
      summaryCards[2].querySelector('strong').textContent = formatCurrency(data.profile.protectedReserves);
      summaryCards[2].querySelector('span').textContent = 'Protected reserves';
    }

    if (actionPanel) {
      actionPanel.querySelector('h3').textContent = 'Next steps for ' + data.user.firstName;
    }

    if (actionList) {
      actionList.innerHTML = [
        data.operations.pendingWithdrawals + ' withdrawals currently await operations review.',
        data.operations.unreadNotifications + ' notifications still need acknowledgement.',
        latestReference ? 'Latest recorded reference: ' + latestReference + '.' : 'A new reference will appear after the next live action.'
      ].map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join('');
    }

    if (tableBody) {
      tableBody.innerHTML = renderTransactionRows(data.transactions.slice(0, 6));
    }
  }

  function renderWalletPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var firstPanel = document.querySelector('.summary-grid article:first-child');
    var secondPanel = document.querySelector('.summary-grid article:last-child');
    var walletCards = firstPanel ? firstPanel.querySelector('.card-grid') : null;
    var walletParagraphs = secondPanel ? secondPanel.querySelectorAll('p') : [];
    var firstPanelDescription = null;
    var primaryWallet = data.wallets.find(function (wallet) { return wallet.assetCode === 'USDT'; }) || data.wallets[0];

    if (heading) {
      heading.textContent = data.user.firstName + "'s wallet";
    }

    if (intro) {
      intro.textContent = 'Wallet balances, addresses, and funding readiness loaded from Neon for ' + data.user.email + '.';
    }

    if (firstPanel) {
      firstPanelDescription = firstPanel.querySelector('p');
      if (!firstPanelDescription) {
        firstPanelDescription = document.createElement('p');
        firstPanel.insertBefore(firstPanelDescription, walletCards || null);
      }

      firstPanel.querySelector('h2').textContent = formatCurrency(data.profile.totalBalance);
      firstPanelDescription.textContent = 'Available cash of ' + formatCurrency(data.profile.availableCash) + ' distributed across ' + data.wallets.length + ' funded assets.';
    }

    if (walletCards) {
      walletCards.innerHTML = renderWalletCards(data.wallets);
    }

    if (secondPanel && primaryWallet) {
      secondPanel.querySelector('h3').textContent = primaryWallet.assetName + ' wallet';
      if (walletParagraphs[0]) {
        walletParagraphs[0].textContent = primaryWallet.network + ' address: ' + primaryWallet.walletAddress;
      }
      if (walletParagraphs[1]) {
        walletParagraphs[1].textContent = 'Current USD value: ' + formatCurrency(primaryWallet.usdValue) + '. Withdrawal limit: ' + formatCurrency(data.profile.withdrawalLimit) + '.';
      }
    }
  }

  function renderHistoryPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var tableBody = document.querySelector('.table-shell tbody');

    if (heading) {
      heading.textContent = data.user.firstName + "'s history";
    }

    if (intro) {
      intro.textContent = 'Showing the latest ' + data.transactions.length + ' Neon-backed account movements for ' + data.user.email + ', including live reference tracking.';
    }

    if (tableBody) {
      tableBody.innerHTML = renderLedgerRows(data.transactions);
    }
  }

  function renderMinePage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var panels = document.querySelectorAll('.summary-grid .panel');

    if (heading) {
      heading.textContent = data.user.firstName + "'s mining desk";
    }

    if (intro) {
      intro.textContent = 'Projected mining data loaded from Neon. Current lane: ' + data.profile.strategyLane + '.';
    }

    if (panels.length >= 2) {
      panels[0].querySelector('h2').textContent = 'Projected ' + formatNumber(data.profile.miningProjection, 6) + ' BTC';
      panels[0].querySelector('p').textContent = 'Hash output is aligned to the ' + data.profile.strategyLane + ' strategy with a ' + data.profile.riskProfile + ' risk profile.';
      panels[1].querySelector('h3').textContent = 'KYC status: ' + data.kyc.status;
      panels[1].querySelector('p').textContent = data.kyc.nextStep;
    }
  }

  function renderPortfolioPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var grid = document.querySelector('.card-grid');

    if (heading) {
      heading.textContent = data.user.firstName + "'s portfolio";
    }

    if (intro) {
      intro.textContent = 'Portfolio allocation is loaded from Neon with a total balance of ' + formatCurrency(data.profile.totalBalance) + '.';
    }

    if (grid) {
      grid.innerHTML = renderAllocationCards(data.allocations);
    }
  }

  function renderInvestPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var grid = document.querySelector('.card-grid');

    if (heading) {
      heading.textContent = data.user.firstName + "'s investment desk";
    }

    if (intro) {
      intro.textContent = 'Recommended strategy lane: ' + data.profile.strategyLane + '. Available cash ready for deployment: ' + formatCurrency(data.profile.availableCash) + '.';
    }

    if (grid) {
      grid.innerHTML = '' +
        '<article class="card"><div class="icon-badge">L1</div><h3>' + escapeHtml(data.profile.strategyLane) + '</h3><p>' + escapeHtml(data.profile.riskProfile) + ' risk profile with ' + formatCurrency(data.profile.activeInvestments) + ' currently deployed.</p></article>' +
        '<article class="card"><div class="icon-badge">L2</div><h3>Available deployment</h3><p>' + formatCurrency(data.profile.availableCash) + ' remains liquid for new allocations or top-ups.</p></article>' +
        '<article class="card"><div class="icon-badge">L3</div><h3>Protected reserves</h3><p>' + formatCurrency(data.profile.protectedReserves) + ' remains protected for lower-volatility capital management.</p></article>';
    }
  }

  function renderTopUpPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var panels = document.querySelectorAll('.split-grid .panel');

    if (heading) {
      heading.textContent = 'Top up for ' + data.user.firstName;
    }

    if (intro) {
      intro.textContent = 'Funding routes loaded from Neon-backed wallet data. Every submission creates a tracked reference inside your account ledger.';
    }

    if (panels.length >= 2) {
      panels[0].querySelector('h2').textContent = 'Deposit instructions for ' + data.user.firstName;
      panels[0].querySelector('p').textContent = 'Use the wallet addresses below and confirm the correct network before submitting a funding notice.';
      panels[0].querySelector('.notice-list').innerHTML = renderWalletFundingList(data.wallets);
      panels[1].querySelector('p').textContent = 'Support can reference ' + data.user.email + ' for account-specific funding help. Current strategy lane: ' + data.profile.strategyLane + '.';
    }
  }

  function renderWithdrawPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var panels = document.querySelectorAll('.summary-grid .panel');

    if (heading) {
      heading.textContent = 'Withdraw for ' + data.user.firstName;
    }

    if (intro) {
      intro.textContent = 'Withdrawal status is tied to your Neon-backed account profile, reference tracking, and current KYC review state.';
    }

    if (panels.length >= 2) {
      panels[0].querySelector('h2').textContent = formatCurrency(data.profile.withdrawalLimit) + ' limit';
      panels[0].querySelector('p').textContent = 'Current KYC status: ' + data.kyc.status + '. Available cash: ' + formatCurrency(data.profile.availableCash) + '.';
      panels[1].querySelector('h3').textContent = data.kyc.status === 'verified' ? 'Withdrawals ready' : 'Complete KYC first';
      panels[1].querySelector('p').textContent = data.kyc.nextStep;
    }
  }

  function renderSettingsPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var panels = document.querySelectorAll('.split-grid .panel');

    if (heading) {
      heading.textContent = data.user.firstName + "'s settings";
    }

    if (intro) {
      intro.textContent = 'Profile settings are now sourced from the Neon-backed account profile for ' + data.user.email + '.';
    }

    if (panels.length >= 2) {
      panels[0].querySelector('h2').textContent = data.user.firstName + ' ' + data.user.lastName;
      panels[0].querySelector('p').textContent = data.user.email + ' · ' + (data.user.country || 'Country not set') + ' · Member since ' + formatDate(data.user.createdAt) + '.';
      panels[1].querySelector('h3').textContent = data.profile.riskProfile + ' profile';
      panels[1].querySelector('p').textContent = 'Strategy lane: ' + data.profile.strategyLane + '. Withdrawal limit: ' + formatCurrency(data.profile.withdrawalLimit) + '. ' + (data.integrations.neonAuthConfigured ? 'Neon Auth endpoints are configured for this workspace.' : 'Neon Auth is not configured in the local environment yet.') ;
    }
  }

  function renderKycPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var stack = document.querySelector('.stack');

    if (heading) {
      heading.textContent = data.user.firstName + "'s KYC review";
    }

    if (intro) {
      intro.textContent = 'KYC status is loaded directly from Neon. Current state: ' + data.kyc.status + '.';
    }

    if (stack) {
      stack.innerHTML = '' +
        '<article class="notice-card"><div class="panel-kicker">Status</div><h3>' + escapeHtml(data.kyc.status.toUpperCase()) + '</h3><p>' + escapeHtml(data.kyc.status === 'verified' ? 'Verification is complete and higher withdrawal limits are available.' : 'Verification is still in progress.') + '</p></article>' +
        '<article class="notice-card"><div class="panel-kicker">Documents</div><h3>' + escapeHtml(String(data.kyc.submittedDocuments)) + ' submitted</h3><p>' + escapeHtml(data.kyc.status === 'verified' ? 'Compliance review finished on ' + formatDate(data.kyc.reviewedAt || new Date()) + '.' : 'Continue uploading the requested compliance files.') + '</p></article>' +
        '<article class="notice-card"><div class="panel-kicker">Next step</div><h3>Action required</h3><p>' + escapeHtml(data.kyc.nextStep) + '</p></article>';
    }
  }

  function renderNotificationsPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var stack = document.querySelector('.stack');
    var toolbar = document.querySelector('[data-notifications-toolbar]');
    var topbarInner = document.querySelector('.dashboard-topbar-inner');
    var unreadCount = data.notifications.filter(function (notification) {
      return notification.isUnread;
    }).length;

    if (heading) {
      heading.textContent = data.user.firstName + "'s notifications";
    }

    if (intro) {
      intro.textContent = 'Loaded ' + data.notifications.length + ' notifications from Neon, with ' + unreadCount + ' unread items.';
    }

    if (!toolbar && topbarInner) {
      toolbar = document.createElement('div');
      toolbar.className = 'chip-row';
      toolbar.setAttribute('data-notifications-toolbar', 'true');
      topbarInner.appendChild(toolbar);
    }

    if (toolbar) {
      toolbar.innerHTML = '' +
        '<button class="button button-secondary inline-action" type="button" data-mark-all-read="true"' + (unreadCount ? '' : ' disabled') + '>Mark all read</button>' +
        '<a class="button button-primary inline-action" href="' + escapeHtml(getApiBase() + '/server/operations/') + '">Operations</a>';
    }

    if (stack) {
      stack.innerHTML = renderNotificationItems(data.notifications, { showActions: true });
    }
  }

  function renderOperationsPage(data) {
    var heading = document.querySelector('.dashboard-topbar h1');
    var intro = document.querySelector('.dashboard-topbar p');
    var overviewPanel = document.querySelector('[data-operations-overview]');
    var integrationsPanel = document.querySelector('[data-operations-integrations]');
    var withdrawalsBody = document.querySelector('[data-operations-withdrawals]');
    var notificationsStack = document.querySelector('[data-operations-notifications]');
    var topbarInner = document.querySelector('.dashboard-topbar-inner');
    var toolbar = document.querySelector('[data-operations-toolbar]');
    var pendingWithdrawals = data.transactions.filter(function (transaction) {
      return transaction.entryType === 'Withdrawal' && transaction.status === 'Review';
    });
    var unreadNotifications = data.notifications.filter(function (notification) {
      return notification.isUnread;
    });

    if (heading) {
      heading.textContent = data.user.firstName + "'s operations desk";
    }

    if (intro) {
      intro.textContent = 'Approve reviewed withdrawals, acknowledge notifications, and monitor Neon integration status from one back-office route.';
    }

    if (!toolbar && topbarInner) {
      toolbar = document.createElement('div');
      toolbar.className = 'chip-row';
      toolbar.setAttribute('data-operations-toolbar', 'true');
      topbarInner.appendChild(toolbar);
    }

    if (toolbar) {
      toolbar.innerHTML = '' +
        '<button class="button button-secondary inline-action" type="button" data-mark-all-read="true"' + (unreadNotifications.length ? '' : ' disabled') + '>Mark all read</button>' +
        '<a class="button button-primary inline-action" href="' + escapeHtml(getApiBase() + '/server/notifications/') + '">Notification center</a>';
    }

    if (overviewPanel) {
      overviewPanel.innerHTML = '' +
        '<div class="panel-kicker">Operations snapshot</div>' +
        '<h2>Back-office controls</h2>' +
        '<p>Review pending withdrawals, keep notifications current, and track the latest ledger reference from your Neon-backed account activity.</p>' +
        '<div class="summary-grid">' +
          '<div class="metric-card"><strong>' + String(pendingWithdrawals.length) + '</strong><span>Pending withdrawals</span></div>' +
          '<div class="metric-card"><strong>' + String(unreadNotifications.length) + '</strong><span>Unread notices</span></div>' +
          '<div class="metric-card"><strong>' + escapeHtml(data.operations.lastReference || 'Pending') + '</strong><span>Latest reference</span></div>' +
        '</div>';
    }

    if (integrationsPanel) {
      integrationsPanel.innerHTML = '' +
        '<div class="panel-kicker">Neon integration</div>' +
        '<h3>' + escapeHtml(data.integrations.neonAuthConfigured ? 'Neon Auth configured' : 'Database bridge active') + '</h3>' +
        '<p>' + escapeHtml(data.integrations.neonAuthConfigured
          ? 'Auth URL and JWKS are loaded from the environment, while dashboard data continues to hydrate directly from your Neon PostgreSQL project.'
          : 'Dashboard data is syncing directly with Neon PostgreSQL. Add Neon Auth URLs to enable external auth status reporting here.') + '</p>' +
        '<div class="button-row">' +
          '<span class="inline-pill"><strong>Auth</strong><span>' + escapeHtml(data.integrations.authMode) + '</span></span>' +
          '<span class="inline-pill"><strong>REST</strong><span>' + escapeHtml(data.integrations.apiUrl ? 'Configured' : 'Not set') + '</span></span>' +
        '</div>';
    }

    if (withdrawalsBody) {
      withdrawalsBody.innerHTML = renderOperationsRows(pendingWithdrawals);
    }

    if (notificationsStack) {
      notificationsStack.innerHTML = renderNotificationItems(unreadNotifications, { showActions: true });
    }

    if (window.__ivoryLastOperationActivity) {
      setOperationsActivitySummary(window.__ivoryLastOperationActivity);
    }
  }

  var dashboardRenderers = {
    '/server/dashboard/': renderDashboardHome,
    '/server/wallet/': renderWalletPage,
    '/server/history/': renderHistoryPage,
    '/server/mine/': renderMinePage,
    '/server/portfolio/': renderPortfolioPage,
    '/server/invest/': renderInvestPage,
    '/server/topup/': renderTopUpPage,
    '/server/withdraw/': renderWithdrawPage,
    '/server/user_settings/': renderSettingsPage,
    '/server/user_settings/kyc/': renderKycPage,
    '/server/notifications/': renderNotificationsPage,
    '/server/operations/': renderOperationsPage
  };

  async function loadDashboardData() {
    var pathname = normalizePathname(window.location.pathname);
    var dashboardUserId = getDashboardUserId();
    var renderer = dashboardRenderers[pathname];
    var response;
    var result;

    if (!renderer) {
      return null;
    }

    if (!dashboardUserId) {
      renderDashboardNotice('Authentication', 'Sign in through the login or register flow to load live account data into the dashboard.');
      return null;
    }

    response = await fetch(getApiBase() + '/api/dashboard/bootstrap?userId=' + encodeURIComponent(dashboardUserId));
    result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.message || 'Unable to load dashboard data.');
    }

    clearDashboardNotice();
    setStoredUser(result.user);
    window.__ivoryDashboardData = result;
    renderer(result);
    return result;
  }

  function setDashboardActionFeedback(form, message, isError) {
    var feedback = form.querySelector('[data-action-feedback]');

    if (!feedback) {
      return;
    }

    feedback.classList.remove('is-error', 'is-visible');
    if (!message) {
      return;
    }

    feedback.textContent = message;
    feedback.classList.add('is-visible');

    if (isError) {
      feedback.classList.add('is-error');
    }
  }

  function setDashboardActionPending(form, isPending) {
    Array.prototype.slice.call(form.querySelectorAll('button, input, select, textarea')).forEach(function (field) {
      field.disabled = isPending;
    });
  }

  function initializeDashboardActions() {
    var actionForms = Array.prototype.slice.call(document.querySelectorAll('[data-dashboard-action]'));

    actionForms.forEach(function (form) {
      form.addEventListener('submit', async function (event) {
        var action = form.getAttribute('data-dashboard-action');
        var dashboardUserId = getDashboardUserId();
        var payload;
        var response;
        var result;

        event.preventDefault();

        if (!dashboardUserId) {
          setDashboardActionFeedback(form, 'Sign in to submit live account actions.', true);
          return;
        }

        payload = Object.fromEntries(new FormData(form).entries());
        payload.userId = dashboardUserId;
        setDashboardActionPending(form, true);
        setDashboardActionFeedback(form, 'Submitting live account action...', false);

        try {
          response = await fetch(getApiBase() + '/api/dashboard/' + encodeURIComponent(action), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          result = await response.json();

          if (!response.ok || !result.ok) {
            throw new Error(result.message || 'Unable to save the account action.');
          }

          form.reset();
          setDashboardActionFeedback(form, result.message || 'Account action recorded.', false);

          try {
            await loadDashboardData();
            setActionSummary(form, result.activity);
          } catch (refreshError) {
            renderDashboardNotice('Dashboard data', refreshError.message || 'The action was recorded, but the latest dashboard data could not be reloaded.');
          }
        } catch (error) {
          setDashboardActionFeedback(form, error.message || 'Unable to save the account action.', true);
        } finally {
          setDashboardActionPending(form, false);
        }
      });
    });
  }

  function initializeDashboardOperations() {
    document.addEventListener('click', async function (event) {
      var actionButton = event.target.closest('[data-approve-withdrawal], [data-notification-read], [data-mark-all-read]');
      var dashboardUserId = getDashboardUserId();
      var endpoint = '';
      var payload = null;
      var response;
      var result;

      if (!actionButton) {
        return;
      }

      event.preventDefault();

      if (!dashboardUserId) {
        setPageFeedback('Sign in to manage operations updates.', true);
        return;
      }

      if (actionButton.hasAttribute('data-approve-withdrawal')) {
        endpoint = '/api/dashboard/withdrawals/approve';
        payload = {
          userId: dashboardUserId,
          transactionId: Number(actionButton.getAttribute('data-approve-withdrawal'))
        };
      } else if (actionButton.hasAttribute('data-notification-read')) {
        endpoint = '/api/dashboard/notifications/read';
        payload = {
          userId: dashboardUserId,
          notificationId: Number(actionButton.getAttribute('data-notification-read'))
        };
      } else if (actionButton.hasAttribute('data-mark-all-read')) {
        endpoint = '/api/dashboard/notifications/read';
        payload = {
          userId: dashboardUserId,
          markAll: true
        };
      }

      actionButton.disabled = true;
      setPageFeedback('Updating live operations state...', false);

      try {
        response = await fetch(getApiBase() + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.message || 'Unable to update the requested record.');
        }

        window.__ivoryLastOperationActivity = result.activity || null;
        await loadDashboardData();
        setPageFeedback(result.message || 'Operations update recorded.', false);

        if (result.activity) {
          setOperationsActivitySummary(result.activity);
        }
      } catch (error) {
        setPageFeedback(error.message || 'Unable to update the requested record.', true);
      } finally {
        actionButton.disabled = false;
      }
    });
  }

  async function initializeDashboardData() {
    try {
      await loadDashboardData();
    } catch (error) {
      renderDashboardNotice('Dashboard data', error.message || 'Unable to load dashboard data right now.');
    }
  }

  ensureDashboardShellEnhancements();
  initializeDashboardActions();
  initializeDashboardOperations();
  initializeDashboardData();

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

  if (isLocalDevelopmentHost()) {
    var translatorMount = document.getElementById('google_language_translator');

    if (translatorMount && !translatorMount.textContent.trim()) {
      translatorMount.innerHTML = '<p class="form-note">Translation tools are disabled on local previews.</p>';
    }
  } else {
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
  }
}());
