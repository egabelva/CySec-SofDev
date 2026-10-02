(() => {
  'use strict';

  const TOTAL = 250;
  const DB_NAME = 'roadmap250';
  const STORE = 'progress';

  // ===== Elemen =====
  const $ = (id) => document.getElementById(id);
  const screens = {
    login: $('screen-login'),
    module: $('screen-module'),
    done: $('screen-done'),
    fatal: $('screen-fatal'),
  };
  const topbar = $('topbar');

  // ===== State (hanya di memori; login selalu diminta ulang) =====
  let db = null;
  let modules = [];
  let userId = null;
  let nextModule = 1; // modul aktif = progress tersimpan
  let viewing = 1;    // modul yang sedang dilihat
  let saving = false;

  // ===== IndexedDB =====
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('Browser ini tidak mendukung IndexedDB.'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Gagal membuka penyimpanan.'));
      req.onblocked = () => reject(new Error('Penyimpanan sedang terkunci. Tutup tab lain lalu muat ulang.'));
    });
  }

  function readNext(id) {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      req.onsuccess = () => {
        const row = req.result;
        const n = row && Number.isInteger(row.next) ? row.next : 1;
        resolve(Math.min(Math.max(n, 1), TOTAL + 1));
      };
      req.onerror = () => reject(req.error);
    });
  }

  function writeNext(id, next) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ id, next });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  // ===== Tampilan =====
  function show(name) {
    Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
    topbar.hidden = !(name === 'module' || name === 'done');
  }

  function fatal(message) {
    $('fatal-message').textContent = message;
    show('fatal');
  }

  function renderModule() {
    const m = modules[viewing - 1];

    $('mod-title').textContent = m.judul;
    $('mod-counter').textContent = 'MODUL ' + m.nomor + ' / ' + TOTAL;
    $('mod-fokus').textContent = m.fokus;
    $('mod-materi').textContent = m.materi;
    $('mod-praktik').textContent = m.praktik;
    $('mod-hasil').textContent = m.hasil;

    const status = $('mod-status');
    const hint = $('mod-hint');
    const isActive = viewing === nextModule;

    status.classList.toggle('is-active', isActive);
    if (isActive) {
      status.textContent = 'Modul aktif';
      hint.textContent = '';
    } else if (viewing < nextModule) {
      status.textContent = 'Sudah selesai';
      hint.textContent = 'Hanya bisa dibaca. Modul aktif kamu adalah Modul ' + nextModule + '.';
    } else {
      status.textContent = 'Belum dikerjakan';
      hint.textContent = 'Hanya bisa dibaca. Modul aktif kamu adalah Modul ' + nextModule + '.';
    }

    $('mod-error').textContent = '';
    $('btn-prev').disabled = viewing <= 1;
    $('btn-next').disabled = viewing >= TOTAL;
    $('btn-done').disabled = !isActive || saving;
    $('user-label').textContent = 'ID ' + userId;
  }

  function renderCurrent() {
    if (nextModule > TOTAL) {
      show('done');
      $('user-label').textContent = 'ID ' + userId;
      $('done-title').focus();
      return;
    }
    show('module');
    renderModule();
  }

  // ===== Login / keluar =====
  async function login(id) {
    const err = $('login-error');
    err.textContent = '';
    try {
      nextModule = await readNext(id);
    } catch (e) {
      err.textContent = 'Gagal membaca progress. Muat ulang halaman lalu coba lagi.';
      return;
    }
    userId = id;
    viewing = Math.min(nextModule, TOTAL);
    renderCurrent();
    if (nextModule <= TOTAL) $('mod-title').focus();
  }

  function logout() {
    userId = null;
    nextModule = 1;
    viewing = 1;
    $('login-id').value = '';
    $('login-error').textContent = '';
    show('login');
    $('login-id').focus();
  }

  // ===== Selesai & Lanjut =====
  const dialog = $('confirm-dialog');

  function askConfirm() {
    $('confirm-text').textContent =
      'Modul ' + nextModule + ' akan ditandai selesai dan Modul ' +
      (nextModule < TOTAL ? nextModule + 1 : 'berikutnya') + (nextModule < TOTAL ? ' dibuka.' : ' tidak ada (ini modul terakhir).');
    dialog.showModal();
  }

  async function confirmDone() {
    if (saving || viewing !== nextModule) { dialog.close(); return; }
    saving = true;
    $('confirm-ok').disabled = true;
    $('btn-done').disabled = true;
    const target = nextModule + 1;
    try {
      await writeNext(userId, target);
      nextModule = target;
      viewing = Math.min(nextModule, TOTAL);
      dialog.close();
      saving = false;
      $('confirm-ok').disabled = false;
      renderCurrent();
      if (nextModule <= TOTAL) $('mod-title').focus();
    } catch (e) {
      dialog.close();
      saving = false;
      $('confirm-ok').disabled = false;
      renderModule();
      $('mod-error').textContent = 'Progress gagal disimpan. Coba klik Selesai & Lanjut lagi.';
    }
  }

  // ===== Event =====
  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const val = $('login-id').value.trim();
    if (!/^[1-9]$/.test(val)) {
      $('login-error').textContent = 'ID tidak valid. Masukkan angka 1 sampai 9.';
      $('login-id').select();
      return;
    }
    login(Number(val));
  });

  $('login-id').addEventListener('input', () => { $('login-error').textContent = ''; });

  $('btn-logout').addEventListener('click', logout);
  $('btn-done-logout').addEventListener('click', logout);

  $('btn-prev').addEventListener('click', () => {
    if (viewing > 1) { viewing -= 1; renderModule(); }
  });
  $('btn-next').addEventListener('click', () => {
    if (viewing < TOTAL) { viewing += 1; renderModule(); }
  });

  $('btn-done').addEventListener('click', () => {
    if (viewing === nextModule && !saving) askConfirm();
  });
  $('confirm-ok').addEventListener('click', confirmDone);
  $('confirm-cancel').addEventListener('click', () => dialog.close());

  // ===== Mulai =====
  async function init() {
    try {
      const res = await fetch('modules.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      modules = await res.json();
      if (!Array.isArray(modules) || modules.length !== TOTAL) {
        throw new Error('Data modul tidak lengkap.');
      }
    } catch (e) {
      fatal('Data modul gagal dimuat. Jika file dibuka langsung dari komputer, jalankan lewat server lokal (mis. Live Server di VS Code) atau buka lewat GitHub Pages.');
      return;
    }

    try {
      db = await openDb();
    } catch (e) {
      fatal('Penyimpanan progress tidak bisa dipakai: ' + e.message + ' Jangan gunakan mode privat/incognito.');
      return;
    }

    show('login');
    $('login-id').focus();
  }

  init();
})();
