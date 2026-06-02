import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://tatehama-radio.onrender.com');

// 🚀 v3.3.0: 設定ボタン完全復活 ＆ 5色カラーバリエーション（黒、白、青、緑、赤）完全実装！
const APP_VERSION = "v3.3.0";

const languages = {
  ja: {
    title: "館浜電鉄 運行管理無線システム",
    statusLabel: "STATUS:",
    standby: "STANDBY (未接続)",
    online: "ONLINE (複数波独立リンク中)", 
    membersLabel: "全乗務員数:",
    roleLabel: "ROLE:",
    userLabel: "NAME:",
    btnDisconnect: "全回線切断 (右クリックで個別切断)",
    settings: "設定",
    home: "🏠 職種選択に戻る",
    themeSelect: "画面カラーバリエーション",
    themeDark: "黒ベース (Dark)",
    themeLight: "白ベース (Light)",
    themeBlue: "青ベース (Blue)",
    themeGreen: "緑ベース (Green)",
    themeRed: "赤ベース (Red)",
    loginTitle: "乗務員登録 ＆ 職種認証ログイン",
    namePlaceholder: "乗務員名を入力してください",
    codePlaceholder: "特務認証コード入力 (8桁)",
    driver: "運転士",
    signal: "信号係",
    dispatcher: "運転指令員",
    driverPanelTitle: "🚊 運転台列車無線 チャンネル設定",
    driverInputHelp: "テンキーでch番号を入力し、下のボタンで個別に開通させます（定員10名）",
    signalPanelTitle: "🚨 信号所 独立回線開通・連動選択盤",
    dispPanelTitle: "無線通信・社員配置モニター盤",
    btnClearAuth: "⚠️ 全設定クリア（ログアウト）"
  }
};

const signalStationsPage1 = ["館浜", "駒野", "津崎", "浜園", "新野崎", "江ノ原検車区"];
const signalStationsPage2 = ["大道寺", "藤江", "水越", "高見沢", "日野森", "西赤山", "赤山町"];

function App() {
  const [lang, setLang] = useState('ja');
  
  // 🎨 テーマの初期化（5色対応：dark, light, blue, green, red）
  const [theme, setTheme] = useState(() => localStorage.getItem('tatehama_theme') || 'dark');
  const t = languages[lang];

  // 🌐 サーバーのオンライン/オフライン状態
  const [isServerOnline, setIsServerOnline] = useState(false);

  // ログイン・認証管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem('tatehama_crew_name') || '');
  const [authCode, setAuthCode] = useState(() => localStorage.getItem('tatehama_auth_code') || ''); 
  const [selectedRole, setSelectedRole] = useState('driver'); 
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false); 

  // エラー/成功メッセージ
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // 📡 各チャンネルの開通フラグ・ラベル
  const [isCh1Active, setIsCh1Active] = useState(false);
  const [isCh2Active, setIsCh2Active] = useState(false);
  const [isCh3Active, setIsCh3Active] = useState(false);
  const [isCh4Active, setIsCh4Active] = useState(false); 

  const [ch1Label, setCh1Label] = useState('---');
  const [ch2Label, setCh2Label] = useState('---');
  const [ch3Label, setCh3Label] = useState('---');
  const [ch4Label, setCh4Label] = useState('---'); 

  const [inputFreq, setInputFreq] = useState('1');
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });

  // 👥 各無線ごとのリアルタイム人数
  const [globalTotalCount, setGlobalTotalCount] = useState(0); 
  const [countCh1, setCountCh1] = useState(0);
  const [countCh2, setCountCh2] = useState(0);
  const [countCh3, setCountCh3] = useState(0);
  const [countCh4, setCountCh4] = useState(0); 

  // 定員設定
  const limitCh2 = "制限なし"; 
  const [limitCh1, setLimitCh1] = useState(10); 
  const [limitCh3, setLimitCh3] = useState(10); 
  const [limitCh4, setLimitCh4] = useState(8);  

  const [signalPage, setSignalPage] = useState(1);
  const [monitorData, setMonitorData] = useState([]);

  // 🔊 受話ミュート
  const [muteCh1, setMuteCh1] = useState(false);
  const [muteCh2, setMuteCh2] = useState(false);
  const [muteCh3, setMuteCh3] = useState(false);
  const [muteCh4, setMuteCh4] = useState(false); 

  // 🎤 PTT送信状態
  const [isTalkingCh1, setIsTalkingCh1] = useState(false);
  const [isTalkingCh2, setIsTalkingCh2] = useState(false);
  const [isTalkingCh3, setIsTalkingCh3] = useState(false);
  const [isTalkingCh4, setIsTalkingCh4] = useState(false); 

  // ⌨️ キーバインド
  const [pttKeyCh1, setPttKeyCh1] = useState('Space');
  const [pttKeyCh2, setPttKeyCh2] = useState('KeyV');
  const [pttKeyCh3, setPttKeyCh3] = useState('KeyB');
  const [pttKeyCh4, setPttKeyCh4] = useState('KeyN'); 
  
  const [activeCaptureCh, setActiveCaptureCh] = useState(null); 
  
  // 🎯 設定パネルの表示フラグ
  const [showSettings, setShowSettings] = useState(false);

  const [isTyping, setIsTyping] = useState(false);

  // 指令緊急通告
  const [dispatchTarget, setDispatchTarget] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [receivedNotice, setReceivedNotice] = useState(null);
  const audioIntervalRef = useRef(null);

  // 全体接続ステート
  const isConnected = isCh1Active || isCh2Active || isCh3Active || isCh4Active;

  // テーマ切り替え時にローカルストレージへ保存
  useEffect(() => {
    localStorage.setItem('tatehama_theme', theme);
  }, [theme]);

  useEffect(() => {
    const closeMenu = () => setContextMenu({ show: false, x: 0, y: 0 });
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  // 警告音
  const startEmergencyBeep = () => {
    if (audioIntervalRef.current) return;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioIntervalRef.current = setInterval(() => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    }, 300);
  };

  const stopEmergencyBeep = () => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
  };

  // 🌐 WebSocket接続状態の監視
  useEffect(() => {
    setIsServerOnline(socket.connected);
    const onConnect = () => setIsServerOnline(true);
    const onDisconnect = () => setIsServerOnline(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  useEffect(() => {
    socket.on('room-count-update', (data) => {
      if (typeof data === 'object' && data !== null) {
        setGlobalTotalCount(data.total || 0);
        setCountCh1(isCh1Active ? (data.ch1 || 1) : 0);
        setCountCh2(isCh2Active ? (data.ch2 || 1) : 0);
        setCountCh3(isCh3Active ? (data.ch3 || 1) : 0);
        setCountCh4(isCh4Active ? (data.ch4 || 1) : 0);
      } else {
        setGlobalTotalCount(data || 0);
        setCountCh1(isCh1Active ? 1 : 0);
        setCountCh2(isCh2Active ? 1 : 0);
        setCountCh3(isCh3Active ? 1 : 0);
        setCountCh4(isCh4Active ? 1 : 0);
      }
    });

    socket.on('global-crew-monitor-data', (data) => setMonitorData(data));

    socket.on('join-failed', (msg) => {
      setCodeError(`⚠️ 接続エラー: ${msg}`);
    });

    socket.on('join-success', () => {
      setCodeError('');
    });

    socket.on('receive-dispatcher-notice', (data) => {
      if (data.target === '全員' || data.target === userName || userName.includes(data.target)) {
        setReceivedNotice(data);
        startEmergencyBeep();
      }
    });

    return () => {
      socket.off('room-count-update');
      socket.off('global-crew-monitor-data');
      socket.off('join-failed');
      socket.off('join-success');
      socket.off('receive-dispatcher-notice');
    };
  }, [userName, isCh1Active, isCh2Active, isCh3Active, isCh4Active]);

  // キーボード PTT制御
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isTyping) return;
      if (e.code === 'Space') { e.preventDefault(); }

      if (isLoggedIn && !showSettings) {
        if (e.code === pttKeyCh1 && isCh1Active) { e.preventDefault(); setIsTalkingCh1(true); }
        if (e.code === pttKeyCh2 && isCh2Active) { e.preventDefault(); setIsTalkingCh2(true); }
        if (e.code === pttKeyCh3 && isCh3Active && selectedRole !== 'driver') { e.preventDefault(); setIsTalkingCh3(true); }
        if (e.code === pttKeyCh4 && isCh4Active && selectedRole === 'signal') { e.preventDefault(); setIsTalkingCh4(true); }
      }
    };

    const handleKeyUp = (e) => {
      if (isTyping) return;
      if (isLoggedIn && !showSettings) {
        if (e.code === pttKeyCh1) { e.preventDefault(); setIsTalkingCh1(false); }
        if (e.code === pttKeyCh2) { e.preventDefault(); setIsTalkingCh2(false); }
        if (e.code === pttKeyCh3) { e.preventDefault(); setIsTalkingCh3(false); }
        if (e.code === pttKeyCh4) { e.preventDefault(); setIsTalkingCh4(false); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLoggedIn, pttKeyCh1, pttKeyCh2, pttKeyCh3, pttKeyCh4, showSettings, isTyping, selectedRole, isCh1Active, isCh2Active, isCh3Active, isCh4Active]);

  const handleLoginSubmit = () => {
    setNameError(''); setCodeError(''); setSuccessMessage('');
    if (!userName.trim()) { setNameError("※ 乗務員名を入力してください。"); return; }
    const trimmedCode = authCode.trim();

    if (trimmedCode === '88888888') {
      setIsAdminUnlocked(true);
      setSuccessMessage("🔓 管理者認証成功：全職種が選択可能になりました。");
      setAuthCode(''); return; 
    }

    if (isAdminUnlocked) {
      localStorage.setItem('tatehama_crew_name', userName);
      setIsLoggedIn(true); setupRoleLimits(selectedRole);
      socket.emit('user-login', { name: userName, role: selectedRole });
      return;
    }

    let finalRole = 'driver'; 
    if (trimmedCode === '22223333') { finalRole = 'signal'; localStorage.setItem('tatehama_auth_code', trimmedCode); }
    else if (trimmedCode === '44445555') { finalRole = 'dispatcher'; localStorage.setItem('tatehama_auth_code', trimmedCode); }
    else if (trimmedCode !== '') { setCodeError("❌ 認証コードが正しくありません。"); return; }
    else { localStorage.removeItem('tatehama_auth_code'); }

    localStorage.setItem('tatehama_crew_name', userName);
    setSelectedRole(finalRole); setupRoleLimits(finalRole); setIsLoggedIn(true);
    socket.emit('user-login', { name: userName, role: finalRole });
  };

  const setupRoleLimits = (role) => {
    if (role === 'driver') setLimitCh1(10);
    else if (role === 'signal') setLimitCh1(8);
    else if (role === 'dispatcher') setLimitCh1(10);
    setLimitCh3(10);
  };

  const handleGoHome = () => {
    handleDisconnectAll(); stopEmergencyBeep(); setReceivedNotice(null);
    setIsAdminUnlocked(false); setIsLoggedIn(false); setIsTyping(false);
    setUserName(localStorage.getItem('tatehama_crew_name') || '');
    setAuthCode(localStorage.getItem('tatehama_auth_code') || '');
    setSelectedRole('driver');
  };

  const connectChannel1 = () => {
    const chNum = parseInt(inputFreq.trim(), 10);
    if (isNaN(chNum) || chNum < 1 || chNum > 80) {
      setCodeError("❌ 1ch〜80chの範囲で指定してください。"); return;
    }
    if (countCh1 >= limitCh1) {
      setCodeError(`❌ ${chNum}ch は満員（${limitCh1}名）です。`); return;
    }
    const targetFreq = `111.${100 + chNum}`;
    socket.emit('join-frequency', { frequency: targetFreq, displayLabel: `🚊 ${chNum}ch列車無線` });
    setCh1Label(`${chNum}ch 本線波 (${targetFreq} MHz)`);
    setIsCh1Active(true); setCodeError('');
  };

  const connectChannel2 = () => {
    socket.emit('join-frequency', { frequency: '111.000', displayLabel: '全線列車共通受令波' });
    setCh2Label("111.000 MHz (列車共通波)");
    setIsCh2Active(true); setCodeError('');
  };

  const connectChannel3 = () => {
    if (selectedRole === 'driver') return; 
    if (countCh3 >= limitCh3) { setCodeError(`❌ 無線③は満員（${limitCh3}名）です。`); return; }
    socket.emit('join-frequency', { frequency: '111.900', displayLabel: '信号指令連絡波' });
    setCh3Label("111.900 MHz (信号指令連絡波)");
    setIsCh3Active(true); setCodeError('');
  };

  const handleSignalStationConnectCh1 = (stationName) => {
    if (countCh1 >= limitCh1) { setCodeError(`❌ ${stationName}駅VCは満員（${limitCh1}名）です。`); return; }
    const freqCode = `sig_ch1_${stationName}`;
    socket.emit('join-frequency', { frequency: freqCode, displayLabel: `信号構内:${stationName}` });
    setCh1Label(`信号所内連絡VC [${stationName}駅]`);
    setIsCh1Active(true); setCodeError('');
  };

  const handleSignalStationConnectCh4 = (stationName) => {
    if (countCh4 >= limitCh4) { setCodeError(`❌ ${stationName}閉責回線は満員（${limitCh4}名）です。`); return; }
    const freqCode = `sig_ch4_${stationName}`;
    socket.emit('join-frequency', { frequency: freqCode, displayLabel: `閉塞連絡:${stationName}` });
    setCh4Label(`隣駅閉塞連絡波 [${stationName}方面]`);
    setIsCh4Active(true); setCodeError('');
  };

  const handleDisconnectAll = () => {
    socket.emit('leave-frequency');
    setIsCh1Active(false); setIsCh2Active(false); setIsCh3Active(false); setIsCh4Active(false);
    setIsTalkingCh1(false); setIsTalkingCh2(false); setIsTalkingCh3(false); setIsTalkingCh4(false);
    setCh1Label('---'); setCh2Label('---'); setCh3Label('---'); setCh4Label('---');
    setCountCh1(0); setCountCh2(0); setCountCh3(0); setCountCh4(0);
  };

  const handleDisconnectRightClick = (e) => {
    e.preventDefault();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY });
  };

  const handleDisconnectSpecificChannel = (chNum) => {
    if (chNum === 1) { setIsCh1Active(false); setCh1Label('---'); setCountCh1(0); setIsTalkingCh1(false); }
    if (chNum === 2) { setIsCh2Active(false); setCh2Label('---'); setCountCh2(0); setIsTalkingCh2(false); }
    if (chNum === 3) { setIsCh3Active(false); setCh3Label('---'); setCountCh3(0); setIsTalkingCh3(false); }
    if (chNum === 4) { setIsCh4Active(false); setCh4Label('---'); setCountCh4(0); setIsTalkingCh4(false); }
    setContextMenu({ show: false, x: 0, y: 0 });
  };

  const handleSendNotice = () => {
    if (!dispatchTarget.trim() || !dispatchMessage.trim()) return;
    socket.emit('send-dispatcher-notice', { target: dispatchTarget.trim(), message: dispatchMessage.trim(), sender: userName });
    setDispatchMessage('');
  };

  const handleKeypadPress = (num) => {
    if (num === '修正') setInputFreq('');
    else if (inputFreq.length < 2) setInputFreq(inputFreq + num);
  };

  const handleConfirmNotice = () => { stopEmergencyBeep(); setReceivedNotice(null); };
  const getRoleText = (r) => { if (r === 'driver') return t.driver; if (r === 'signal') return t.signal; return t.dispatcher; };

  // 🚪 ログイン前の画面
  if (!isLoggedIn) {
    return (
      <div className={`app-container theme-${theme} login-screen-page-wrapper`}>
        {/* 右上の通信状態モニター ＆ 設定ボタン（onClick復活！） */}
        <div style={{position: 'absolute', top: '20px', right: '30px', zIndex: 10, display: 'flex', alignItems: 'center', gap: '10px'}}>
          <div className={`server-status-pill ${isServerOnline ? 'online' : 'offline'}`}>
            <span className="dot"></span> {isServerOnline ? "WS ONLINE" : "WS OFFLINE"}
          </div>
          <button className="icon-btn" type="button" onClick={() => setShowSettings(true)}>⚙️ {t.settings}</button>
        </div>

        {/* ⚙️ 設定オーバーレイ（5色マルチバリエーション選択対応） */}
        {showSettings && (
          <div className="settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="settings-box" onClick={(e) => e.stopPropagation()}>
              <h3>⚙️ システム環境設定</h3>
              <div style={{marginTop: '15px'}}>
                <label style={{fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px'}}>{t.themeSelect}</label>
                <select value={theme} onChange={(e) => setTheme(e.target.value)} className="lang-select" style={{width: '100%', padding: '8px', background: '#1f242c', color: '#fff', border: '1px solid #30363d', borderRadius: '4px'}}>
                  <option value="dark">{t.themeDark}</option>
                  <option value="light">{t.themeLight}</option>
                  <option value="blue">{t.themeBlue}</option>
                  <option value="green">{t.themeGreen}</option>
                  <option value="red">{t.themeRed}</option>
                </select>
              </div>
              <hr style={{margin: '20px 0', border: 'none', borderTop: '1px solid #30363d'}} />
              <button className="btn-close-custom-panel" type="button" onClick={() => setShowSettings(false)}>設定を閉じる</button>
            </div>
          </div>
        )}

        <div className="login-card-panel">
          <h2>{t.loginTitle}</h2>
          {successMessage && <div className="login-inline-success-box">{successMessage}</div>}
          <div className="login-field-row">
            <label className="field-lbl">👤 乗務員名</label>
            <input type="text" className="crew-name-input-wide" value={userName} onFocus={() => setIsTyping(true)} onBlur={() => setIsTyping(false)} onChange={(e) => { setUserName(e.target.value); setNameError(''); }} placeholder={t.namePlaceholder} />
          </div>
          <div className="login-grid-two-column">
            <div className="login-left-box">
              <label className="field-lbl">🚊 担当職種選択</label>
              {!isAdminUnlocked ? <button className="role-select-card-wide active" type="button">🚊 {t.driver}</button> : (
                <div className="admin-unlocked-menu-list">
                  <button className={`role-select-card-wide ${selectedRole === 'driver' ? 'active' : ''}`} type="button" onClick={() => { setSelectedRole('driver'); setupRoleLimits('driver'); }}>🚊 {t.driver}</button>
                  <button className={`role-select-card-wide ${selectedRole === 'signal' ? 'active' : ''}`} type="button" onClick={() => { setSelectedRole('signal'); setupRoleLimits('signal'); }}>🚨 {t.signal}</button>
                  <button className={`role-select-card-wide ${selectedRole === 'dispatcher' ? 'active' : ''}`} type="button" onClick={() => { setSelectedRole('dispatcher'); setupRoleLimits('dispatcher'); }}>📞 {t.dispatcher}</button>
                </div>
              )}
            </div>
            <div className="login-right-box">
              <label className="field-lbl">🔒 特務認証コード</label>
              <input type="password" className="crew-code-input-wide" value={authCode} disabled={isAdminUnlocked} onFocus={() => setIsTyping(true)} onBlur={() => setIsTyping(false)} onChange={(e) => { setAuthCode(e.target.value.replace(/[^0-9]/g, '')); setCodeError(''); }} placeholder={t.codePlaceholder} maxLength={8} />
              {codeError && <div className="inline-red-error-text">{codeError}</div>}
            </div>
          </div>
          <button className="btn-action-primary start-duty-btn-wide" type="button" onClick={handleLoginSubmit}>乗務開始</button>
        </div>
      </div>
    );
  }

  // 🎛️ ログイン（乗務開始）後のメイン画面
  return (
    <div className={`app-container theme-${theme}`}>
      <header className="app-header">
        <h1>{t.title} <span className="version-badge-tag">{APP_VERSION}</span></h1>
        <div className="header-controls">
          <div className={`server-status-pill ${isServerOnline ? 'online' : 'offline'}`}>
            <span className="dot"></span> {isServerOnline ? "WS ONLINE" : "WS OFFLINE"}
          </div>
          <button className="icon-btn home-btn" type="button" onClick={handleGoHome}>{t.home}</button>
          {/* メイン画面側の設定ボタンクリック処理も完全復旧！ */}
          <button className="icon-btn" type="button" onClick={() => setShowSettings(true)}>⚙️ {t.settings}</button>
        </div>
      </header>

      {/* ⚙️ メイン画面側 設定オーバーレイ */}
      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-box" onClick={(e) => e.stopPropagation()}>
            <h3>⚙️ システム環境設定</h3>
            <div style={{marginTop: '15px'}}>
              <label style={{fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px'}}>{t.themeSelect}</label>
              <select value={theme} onChange={(e) => setTheme(e.target.value)} className="lang-select" style={{width: '100%', padding: '8px', background: '#1f242c', color: '#fff', border: '1px solid #30363d', borderRadius: '4px'}}>
                <option value="dark">{t.themeDark}</option>
                <option value="light">{t.themeLight}</option>
                <option value="blue">{t.themeBlue}</option>
                <option value="green">{t.themeGreen}</option>
                <option value="red">{t.themeRed}</option>
              </select>
            </div>
            <hr style={{margin: '20px 0', border: 'none', borderTop: '1px solid #30363d'}} />
            <button className="btn-close-custom-panel" type="button" onClick={() => setShowSettings(false)}>設定を閉じる</button>
          </div>
        </div>
      )}

      {contextMenu.show && (
        <div className="custom-disconnect-context-menu" style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}>
          <div className="menu-header-title">独立回線切断選択</div>
          {isCh1Active && <button type="button" className="menu-item-btn item-ch1" onClick={() => handleDisconnectSpecificChannel(1)}>無線① を切断</button>}
          {isCh2Active && <button type="button" className="menu-item-btn item-ch2" onClick={() => handleDisconnectSpecificChannel(2)}>無線② を切断</button>}
          {isCh3Active && selectedRole !== 'driver' && <button type="button" className="menu-item-btn item-ch3" onClick={() => handleDisconnectSpecificChannel(3)}>無線③ を切断</button>}
          {isCh4Active && selectedRole === 'signal' && <button type="button" className="menu-item-btn item-ch4" onClick={() => handleDisconnectSpecificChannel(4)}>無線④ を切断</button>}
        </div>
      )}

      {receivedNotice && (
        <div className="emergency-notice-overlay">
          <div className="emergency-notice-box">
            <div className="notice-blink-header">⚠️ 緊急運行通告</div>
            <button className="btn-notice-confirm" onClick={handleConfirmNotice}>了解</button>
          </div>
        </div>
      )}

      <div className="main-cockpit-grid">
        <div className="cockpit-left-monitor">
          <div className="radio-display-lcd" style={{gap: '6px', padding: '12px'}}>
            <div className="lcd-line"><span className="lcd-lbl">{t.statusLabel}</span><span className={`lcd-val ${isConnected ? 'on' : 'off'}`}>{isConnected ? "ONLINE (独立受令中)" : t.standby}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.userLabel}</span><span className="lcd-val highlights">{userName}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.roleLabel}</span><span className="lcd-val role-name-color-lcd">{getRoleText(selectedRole)}</span></div>
            
            {/* 無線① */}
            <div>
              <div className="lcd-line" style={{border: 'none'}}>
                <span className="lcd-lbl">📡 無線① [構内連絡]:</span>
                <span className="lcd-channel-members-tag" style={{color: countCh1 >= limitCh1 ? '#ff7b72' : '#58a6ff'}}>
                  👥 {isCh1Active ? `${countCh1} / ${limitCh1}名` : `0 / ${limitCh1}名`}
                </span>
              </div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val val-mainch" style={{fontSize: '14px', color: !isCh1Active ? '#555' : muteCh1 ? '#768390' : '#39d353'}}>{!isCh1Active ? "--- (未接続)" : muteCh1 ? "--- (MUTE)" : ch1Label}</span>
                <button type="button" disabled={!isCh1Active} onClick={() => setMuteCh1(!muteCh1)} className="lcd-mute-sub-btn">{muteCh1 ? "🔇" : "🔊"}</button>
              </div>
            </div>

            {/* 無線② */}
            <div style={{borderTop: '1px dashed #30363d', paddingTop: '4px'}}>
              <div className="lcd-line" style={{border: 'none'}}>
                <span className="lcd-lbl" style={{color: '#ff9800'}}>📻 無線② [列車共通波]:</span>
                <span className="lcd-channel-members-tag" style={{color: '#8b949e'}}>👥 {isCh2Active ? `${countCh2} / ${limitCh2}` : `0 / ${limitCh2}`}</span>
              </div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val" style={{fontSize: '14px', color: !isCh2Active ? '#555' : muteCh2 ? '#768390' : '#ffb74d'}}>{!isCh2Active ? "--- (未接続)" : muteCh2 ? "--- (MUTE)" : ch2Label}</span>
                <button type="button" disabled={!isCh2Active} onClick={() => setMuteCh2(!muteCh2)} className="lcd-mute-sub-btn">{muteCh2 ? "🔇" : "🔊"}</button>
              </div>
            </div>

            {/* 無線③ */}
            {selectedRole !== 'driver' && (
              <div style={{borderTop: '1px dashed #30363d', paddingTop: '4px'}}>
                <div className="lcd-line" style={{border: 'none'}}>
                  <span className="lcd-lbl" style={{color: '#00d2ff'}}>📡 無線③ [信号指令連絡]:</span>
                  <span className="lcd-channel-members-tag" style={{color: countCh3 >= limitCh3 ? '#ff7b72' : '#58a6ff'}}>👥 {isCh3Active ? `${countCh3} / ${limitCh3}名` : `0 / ${limitCh3}名`}</span>
                </div>
                <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                  <span className="lcd-val" style={{fontSize: '14px', color: !isCh3Active ? '#555' : muteCh3 ? '#768390' : '#88d8ff'}}>{!isCh3Active ? "--- (未接続)" : muteCh3 ? "--- (MUTE)" : ch3Label}</span>
                  <button type="button" disabled={!isCh3Active} onClick={() => setMuteCh3(!muteCh3)} className="lcd-mute-sub-btn">{muteCh3 ? "🔇" : "🔊"}</button>
                </div>
              </div>
            )}

            {/* 無線④ */}
            {selectedRole === 'signal' && (
              <div style={{borderTop: '1px dashed #30363d', paddingTop: '4px'}}>
                <div className="lcd-line" style={{border: 'none'}}>
                  <span className="lcd-lbl" style={{color: '#e06c75'}}>🔒 無線④ [隣駅閉塞連絡]:</span>
                  <span className="lcd-channel-members-tag" style={{color: countCh4 >= limitCh4 ? '#ff7b72' : '#e5c07b'}}>👥 {isCh4Active ? `${countCh4} / ${limitCh4}名` : `0 / ${limitCh4}名`}</span>
                </div>
                <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                  <span className="lcd-val" style={{fontSize: '14px', color: !isCh4Active ? '#555' : muteCh4 ? '#768390' : '#e06c75'}}>{!isCh4Active ? "--- (未接続)" : muteCh4 ? "--- (MUTE)" : ch4Label}</span>
                  <button type="button" disabled={!isCh4Active} onClick={() => setMuteCh4(!muteCh4)} className="lcd-mute-sub-btn">{muteCh4 ? "🔇" : "🔊"}</button>
                </div>
              </div>
            )}

            <div className="lcd-line" style={{borderTop: '2px solid #30363d', paddingTop: '4px'}}><span className="lcd-lbl">{t.membersLabel}</span><span className="lcd-val green-lcd-text">{isConnected ? `${globalTotalCount} 名` : '---'}</span></div>
          </div>

          <div className="in-call-controls" style={{marginTop: '10px'}}>
            <button onClick={handleDisconnectAll} onContextMenu={handleDisconnectRightClick} className="btn-cockpit danger" type="button" style={{cursor: 'context-menu', opacity: isConnected ? 1 : 0.6}}>
              {t.btnDisconnect}
            </button>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px'}}>
              <button className={`ptt-hardware-button ptt-hardware-ch1 ${isTalkingCh1 ? 'active' : ''} ${!isCh1Active ? 'disabled-lock' : ''}`} type="button" onMouseDown={() => isCh1Active && setIsTalkingCh1(true)} onMouseUp={() => setIsTalkingCh1(false)}>
                {isTalkingCh1 ? "✦ ① 本線/構内 送話中 ✦" : `① 構内連絡送信 [${pttKeyCh1}] ${!isCh1Active ? '(未入線)' : ''}`}
              </button>

              <button className={`ptt-hardware-button ptt-hardware-ch2 ${isTalkingCh2 ? 'active' : ''} ${!isCh2Active ? 'disabled-lock' : ''}`} type="button" onMouseDown={() => isCh2Active && setIsTalkingCh2(true)} onMouseUp={() => setIsTalkingCh2(false)}>
                {isTalkingCh2 ? "✦ ② 共通波 送話中 ✦" : `② 共通波送信 [${pttKeyCh2}] ${!isCh2Active ? '(未入線)' : ''}`}
              </button>

              {selectedRole !== 'driver' && (
                <button className={`ptt-hardware-button ptt-hardware-ch3 ${isTalkingCh3 ? 'active' : ''} ${!isCh3Active ? 'disabled-lock' : ''}`} type="button" onMouseDown={() => isCh3Active && setIsTalkingCh3(true)} onMouseUp={() => setIsTalkingCh3(false)}>
                  {isTalkingCh3 ? "✦ ③ 連絡波 送話中 ✦" : `③ 連絡線送信 [${pttKeyCh3}] ${!isCh3Active ? '(未入線)' : ''}`}
                </button>
              )}

              {selectedRole === 'signal' && (
                <button className={`ptt-hardware-button ptt-hardware-ch4 ${isTalkingCh4 ? 'active' : ''} ${!isCh4Active ? 'disabled-lock' : ''}`} type="button" style={{borderLeft: '4px solid #e06c75'}} onMouseDown={() => isCh4Active && setIsTalkingCh4(true)} onMouseUp={() => setIsTalkingCh4(false)}>
                  {isTalkingCh4 ? "✦ ④ 閉塞波 送話中 ✦" : `④ 隣駅閉塞連絡送信 [${pttKeyCh4}] ${!isCh4Active ? '(未入線)' : ''}`}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="cockpit-right-panel">
          <div className="right-panel-scroll-box" style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
            
            {/* 運転士 */}
            {selectedRole === 'driver' && (
              <div className="sub-panel-card">
                <h3>{t.driverPanelTitle}</h3>
                <p className="help-text">{t.driverInputHelp}</p>
                {codeError && <div className="inline-red-error-text" style={{margin:'5px 0'}}>{codeError}</div>}
                <input type="text" className="freq-digit-input" value={inputFreq} readOnly style={{textAlign: 'center', fontSize: '24px'}} />
                <div className="screen-num-keypad" style={{maxWidth: '240px', margin: '8px auto'}}>
                  {[1,2,3,4,5,6,7,8,9,0,'修正'].map((n) => (
                    <button key={n} type="button" className="btn-key-digit" onClick={() => handleKeypadPress(n)}>{n}</button>
                  ))}
                </div>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px'}}>
                  <button type="button" className="btn-action-primary" style={{background: isCh1Active ? '#2c3e50' : '#1f618d'}} onClick={connectChannel1}>①本線 開通</button>
                  <button type="button" className="btn-action-primary" style={{background: isCh2Active ? '#2c3e50' : '#d35400'}} onClick={connectChannel2}>②共通波 開通</button>
                </div>
              </div>
            )}

            {/* 信号係 */}
            {selectedRole === 'signal' && (
              <div className="sub-panel-card">
                <h3>{t.signalPanelTitle} (Page {signalPage}/2)</h3>
                <p className="help-text" style={{color: '#ff7b72', fontWeight: 'bold'}}>👉 各駅ボタンの 左[①開通] で構内VC、右[④閉塞] で隣駅閉塞波に個別リンク</p>
                {codeError && <div className="inline-red-error-text" style={{margin:'5px 0'}}>{codeError}</div>}
                
                <div className="signal-split-buttons-grid">
                  {(signalPage === 1 ? signalStationsPage1 : signalStationsPage2).map(st => (
                    <div key={st} className="station-split-row-block">
                      <button type="button" className="btn-station-part-left" onClick={() => handleSignalStationConnectCh1(st)}>
                        🚉 {st}駅 (①)
                      </button>
                      <button type="button" className="btn-station-part-right" onClick={() => handleSignalStationConnectCh4(st)}>
                        🔒 閉塞 (④)
                      </button>
                    </div>
                  ))}
                </div>

                <div className="pager-nav-bar" style={{margin:'8px 0'}}>
                  <button type="button" onClick={() => setSignalPage(1)} disabled={signalPage === 1}>◀ Page 1</button>
                  <button type="button" onClick={() => setSignalPage(2)} disabled={signalPage === 2}>Page 2 ▶</button>
                </div>
                
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid #30363d', paddingTop: '10px'}}>
                  <button type="button" className="btn-action-primary" style={{background: isCh2Active ? '#2c3e50' : '#d35400', fontSize:'12px'}} onClick={connectChannel2}>②共通波 接続</button>
                  <button type="button" className="btn-action-primary" style={{background: isCh3Active ? '#2c3e50' : '#2980b9', fontSize:'12px'}} onClick={connectChannel3}>③指令連絡 接続</button>
                </div>
              </div>
            )}

            {/* 運転指令員 */}
            {selectedRole === 'dispatcher' && (
              <div className="sub-panel-card">
                <h3>📞 指令独立回線割当盤</h3>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px'}}>
                  <button type="button" className="btn-action-primary" style={{fontSize:'12px', background: isCh1Active ? '#2c3e50' : '#27ae60'}} onClick={connectChannel1}>①本線({inputFreq}ch)</button>
                  <button type="button" className="btn-action-primary" style={{fontSize:'12px', background: isCh2Active ? '#2c3e50' : '#d35400'}} onClick={connectChannel2}>②共通波リンク</button>
                  <button type="button" className="btn-action-primary" style={{fontSize:'12px', background: isCh3Active ? '#2c3e50' : '#2980b9'}} onClick={connectChannel3}>③連絡波開通</button>
                </div>
                <div style={{marginTop:'10px'}}>
                  <input type="text" className="freq-digit-input" value={inputFreq} readOnly style={{fontSize:'16px', padding:'4px'}} />
                  <div className="screen-num-keypad" style={{gridTemplateColumns:'repeat(6, 1fr)', gap:'4px', marginTop:'5px'}}>
                    {[1,2,3,4,5,6,7,8,9,0,'修正'].map(n => <button key={n} className="btn-key-digit" style={{padding:'4px 0', fontSize:'12px'}} onClick={() => handleKeypadPress(n)}>{n}</button>)}
                  </div>
                </div>
              </div>
            )}

            {/* 指令通告 */}
            {selectedRole === 'dispatcher' && (
              <div className="sub-panel-card" style={{marginTop: '0px'}}>
                <h3>📝 列車運行通告送信盤</h3>
                <input type="text" style={{width: '100%', padding: '6px', background: '#010409', color: '#fff', border: '1px solid #30363d' }} value={dispatchTarget} onChange={(e) => setDispatchTarget(e.target.value)} placeholder="送信先" />
                <textarea style={{width: '100%', height: '40px', marginTop:'5px', background: '#010409', color: '#fff', border: '1px solid #30363d'}} value={dispatchMessage} onChange={(e) => setDispatchMessage(e.target.value)} placeholder="通告内容" />
                <button className="btn-action-primary" style={{marginTop: '5px', background: '#da5b0b'}} type="button" onClick={handleSendNotice}>⚡ 通告一斉送信 ⚡</button>
              </div>
            )}

            <div className="dispatcher-monitor-board" style={{marginTop: '0px'}}>
              <h3>🖥️ {t.dispPanelTitle}</h3>
              <div className="monitor-table-container">
                <table className="monitor-table">
                  <thead><tr><th>乗務員名</th><th>担当</th><th>位置</th></tr></thead>
                  <tbody>
                    {monitorData.map((user) => (
                      <tr key={user.id}><td>{user.name}</td><td>{getRoleText(user.role)}</td><td>{user.location}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      </div>
      
      {/* ⚠️ 全設定クリアフッター */}
      <div style={{position: 'absolute', bottom: '8px', right: '15px', zIndex: 5}}>
        <button className="btn-logout-clear-mini" type="button" onClick={handleClearAllStorage}>{t.btnClearAuth}</button>
      </div>
    </div>
  );
}

export default App;