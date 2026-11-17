/* Temp Mail — frontend logic.
   IMPORTANT: the browser NEVER calls api.mail.tm directly (CORS only allows
   the https://mail.tm origin). Every request goes through our own /api proxy. */

(function () {
  'use strict';

  var LS_KEY = 'tempmail_saved';
  var REFRESH_MS = 15000;

  var current = null; // { address, password, id, token }
  var domains = [];
  var refreshTimer = null;

  var $ = function (id) { return document.getElementById(id); };

  var elAddress = $('emailAddress');
  var elStatus = $('statusMsg');
  var elInboxEmpty = $('inboxEmpty');
  var elInboxList = $('inboxList');
  var elInboxCount = $('inboxCount');
  var elMailView = $('mailView');
  var elSavedList = $('savedList');
  var elSavedEmpty = $('savedEmpty');

  /* ---------- helpers ---------- */

  function setStatus(msg) {
    elStatus.textContent = msg || '';
  }

  function randomString(len, chars) {
    var out = '';
    for (var i = 0; i < len; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function randomName() {
    return 'user' + randomString(6, 'abcdefghijklmnopqrstuvwxyz0123456789');
  }

  function randomPassword() {
    return randomString(16, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  }

  // mail.tm strips dots from custom names, so we clean them here too.
  function cleanName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function copyText(text, doneMsg) {
    function done() { setStatus(doneMsg || 'Copied to clipboard.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // mail.tm returns a collection as {"hydra:member": [...]} for JSON-LD
  // requests, or as a plain [...] array for plain JSON requests.
  // Accept both shapes so the inbox and domain list never come up empty
  // just because of content negotiation.
  function membersOf(data) {
    if (Array.isArray(data)) return data;
    return (data && data['hydra:member']) || [];
  }

  function api(path, options) {
    options = options || {};
    options.headers = options.headers || {};
    if (current && current.token) {
      options.headers.Authorization = 'Bearer ' + current.token;
    }
    if (options.body && typeof options.body !== 'string') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    return fetch('/api' + path, options);
  }

  /* ---------- saved addresses (localStorage) ---------- */

  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function storeSaved(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) { /* storage full or unavailable — ignore */ }
  }

  function rememberAccount(acc) {
    var list = loadSaved().filter(function (a) { return a.address !== acc.address; });
    list.unshift({ address: acc.address, password: acc.password, id: acc.id });
    storeSaved(list.slice(0, 10));
    renderSaved();
  }

  function renderSaved() {
    var list = loadSaved();
    elSavedList.innerHTML = '';
    elSavedEmpty.style.display = list.length ? 'none' : '';
    list.forEach(function (acc) {
      var li = document.createElement('li');
      if (current && acc.address === current.address) li.className = 'active';
      var label = document.createElement('span');
      label.textContent = acc.address;
      var del = document.createElement('button');
      del.className = 'saved-del';
      del.type = 'button';
      del.textContent = '✕';
      del.title = 'Remove from this list';
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        storeSaved(loadSaved().filter(function (a) { return a.address !== acc.address; }));
        renderSaved();
      });
      li.appendChild(label);
      li.appendChild(del);
      li.addEventListener('click', function () { switchTo(acc); });
      elSavedList.appendChild(li);
    });
  }

  /* ---------- domains ---------- */

  function loadDomains() {
    return fetch('/api/domains')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var members = membersOf(data);
        domains = members.filter(function (d) { return d.isActive; }).map(function (d) { return d.domain; });
        var sel = $('domainSelect');
        sel.innerHTML = '';
        if (!domains.length) {
          var opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No domain available right now';
          sel.appendChild(opt);
          return;
        }
        domains.forEach(function (d) {
          var o = document.createElement('option');
          o.value = d;
          o.textContent = d;
          sel.appendChild(o);
        });
      })
      .catch(function () {
        setStatus('Could not load the domain list. Please refresh the page.');
      });
  }

  /* ---------- accounts ---------- */

  function getToken(acc) {
    return api('/token', { method: 'POST', body: { address: acc.address, password: acc.password } })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.status !== 200 || !res.body.token) {
          throw new Error((res.body && (res.body.message || res.body.detail)) || 'Could not sign in.');
        }
        acc.token = res.body.token;
        return acc;
      });
  }

  function createAccount(name) {
    var domain = $('domainSelect').value || domains[0];
    if (!domain) {
      setStatus('No domain is available right now. Please try again later.');
      return Promise.reject(new Error('no domain'));
    }
    var clean = cleanName(name);
    var localPart = clean || randomName();
    var address = localPart + '@' + domain;
    var password = randomPassword();
    setStatus('Creating your address…');
    return api('/accounts', { method: 'POST', body: { address: address, password: password } })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.status === 422 || res.status === 400) {
          // Address already taken — try a different random name once.
          if (clean) throw new Error('That name is already taken. Try a different name.');
          return createAccount('');
        }
        if (res.status !== 201 && res.status !== 200) {
          throw new Error((res.body && (res.body.message || res.body.detail)) || 'Could not create the address.');
        }
        var acc = { address: address, password: password, id: res.body.id };
        return getToken(acc);
      })
      .then(function (acc) {
        setCurrent(acc);
        rememberAccount(acc);
        setStatus('Your new address is ready.');
        return acc;
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : 'Something went wrong. Please try again.');
        throw err;
      });
  }

  function setCurrent(acc) {
    current = acc;
    elAddress.textContent = acc.address;
    renderSaved();
    hideMail();
    loadInbox();
    restartAutoRefresh();
  }

  function switchTo(saved) {
    setStatus('Switching to ' + saved.address + '…');
    var acc = { address: saved.address, password: saved.password, id: saved.id };
    getToken(acc)
      .then(function (a) {
        setCurrent(a);
        setStatus('Switched to ' + a.address + '.');
      })
      .catch(function () {
        setStatus('Could not sign in to that address. It may have expired — creating a new one.');
        createAccount('');
      });
  }

  /* ---------- inbox ---------- */

  function loadInbox() {
    if (!current || !current.token) return;
    api('/messages')
      .then(function (r) {
        if (r.status === 401) {
          // Token expired — sign in again once, then retry.
          return getToken(current).then(function () { return api('/messages'); });
        }
        return r;
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var list = membersOf(data);
        renderInbox(list);
      })
      .catch(function () {
        setStatus('Could not load the inbox. Check your connection and press Refresh.');
      });
  }

  function renderInbox(list) {
    elInboxCount.textContent = list.length + (list.length === 1 ? ' message' : ' messages');
    elInboxEmpty.style.display = list.length ? 'none' : '';
    elInboxList.hidden = !list.length;
    elInboxList.innerHTML = '';
    list.forEach(function (m) {
      var li = document.createElement('li');
      if (!m.seen) li.className = 'unseen';
      var icon = document.createElement('span');
      icon.className = 'msg-icon';
      icon.textContent = ((m.from && m.from.name) || (m.from && m.from.address) || '?').charAt(0).toUpperCase();
      var main = document.createElement('div');
      main.className = 'msg-main';
      var subj = document.createElement('div');
      subj.className = 'msg-subject';
      subj.textContent = m.subject || '(No subject)';
      var from = document.createElement('div');
      from.className = 'msg-from';
      from.textContent = (m.from && (m.from.address || m.from.name)) || '';
      main.appendChild(subj);
      main.appendChild(from);
      var date = document.createElement('span');
      date.className = 'msg-date';
      date.textContent = m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      li.appendChild(icon);
      li.appendChild(main);
      li.appendChild(date);
      li.addEventListener('click', function () { openMessage(m.id); });
      elInboxList.appendChild(li);
    });
  }

  function extractCode(text) {
    if (!text) return null;
    var m = String(text).match(/\b\d{4,8}\b/);
    return m ? m[0] : null;
  }

  function openMessage(id) {
    api('/message?id=' + encodeURIComponent(id))
      .then(function (r) { return r.json(); })
      .then(function (m) {
        $('mailSubject').textContent = m.subject || '(No subject)';
        $('mailFrom').textContent = (m.from && (m.from.address || m.from.name)) || '';
        $('mailDate').textContent = m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
        var text = m.text || '';
        var code = extractCode(text);
        var codeBox = $('codeBox');
        if (code) {
          codeBox.hidden = false;
          $('codeValue').textContent = code;
        } else {
          codeBox.hidden = true;
        }
        var body = $('mailBody');
        if (text) {
          body.textContent = text;
        } else if (m.html && m.html.length) {
          // Render the HTML part with scripts and event handlers stripped.
          var clean = String(m.html[0])
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/\son\w+="[^"]*"/gi, '')
            .replace(/\son\w+='[^']*'/gi, '');
          body.innerHTML = clean;
        } else {
          body.textContent = '(This message has no readable content.)';
        }
        elMailView.hidden = false;
        elMailView.scrollIntoView({ behavior: 'smooth', block: 'start' });
        loadInbox(); // refresh seen state
      })
      .catch(function () {
        setStatus('Could not open that message. Please try again.');
      });
  }

  function hideMail() {
    elMailView.hidden = true;
  }

  /* ---------- auto refresh ---------- */

  function restartAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadInbox, REFRESH_MS);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) loadInbox();
  });

  /* ---------- toolbar ---------- */

  $('copyBtn').addEventListener('click', function () {
    if (current) copyText(current.address, 'Address copied to clipboard.');
  });
  $('copyPill').addEventListener('click', function () {
    if (current) copyText(current.address, 'Address copied to clipboard.');
  });
  $('refreshBtn').addEventListener('click', function () {
    setStatus('Refreshing inbox…');
    loadInbox();
    setTimeout(function () { setStatus('Inbox refreshed.'); }, 600);
  });
  $('changeBtn').addEventListener('click', function () {
    var input = $('customName');
    if (!cleanName(input.value)) {
      input.focus();
      setStatus('Type a name above, then press Change — or use "Create custom address".');
      return;
    }
    createAccount(input.value);
  });
  $('newBtn').addEventListener('click', function () { createAccount(''); });
  $('deleteBtn').addEventListener('click', function () {
    if (!current || !current.id) return;
    if (!window.confirm('Delete this address? Its inbox will be gone for good.')) return;
    api('/account?id=' + encodeURIComponent(current.id), { method: 'DELETE' })
      .catch(function () { /* server delete may fail; still drop it locally */ })
      .then(function () {
        storeSaved(loadSaved().filter(function (a) { return a.address !== current.address; }));
        current = null;
        elAddress.textContent = 'Creating your address…';
        createAccount('');
      });
  });
  $('customBtn').addEventListener('click', function () {
    createAccount($('customName').value);
  });
  $('closeMail').addEventListener('click', hideMail);
  $('copyCodeBtn').addEventListener('click', function () {
    copyText($('codeValue').textContent, 'Verification code copied.');
  });

  /* ---------- start ---------- */

  loadDomains().then(function () {
    var saved = loadSaved();
    if (saved.length) {
      switchTo(saved[0]);
    } else {
      createAccount('');
    }
  });
  renderSaved();
})();
