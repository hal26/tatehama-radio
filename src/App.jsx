import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('https://tatehama-radio.onrender.com');

// 🚀 v3.1.7: 中国語の誤混入を完全撤去！純国産の日本語仕様に修正
const APP_VERSION = "v3.1.7";

const languages = {
  ja: {
    title: "館浜電鉄 運行管理無線システム",
    statusLabel: "STATUS:",
    standby: "STANDBY (未接続)",
    online: "ONLINE (複数波独立リンク中)", 
    onlineDisp: "ONLINE (指令統制モード)",
    membersLabel: "全乗務員数:",
    roleLabel: "ROLE:",
    userLabel: "NAME:",
    btnDisconnect: "全回線切断 (右クリックで個別切断)",
    settings: "設定",
    home: "🏠 職種選択に戻る",
    themeSelect: "画面テーマ (Theme)",
    themeDark: "黒ベース (Dark)",
    themeLight: "白ベース (Light)",
    audioInputLabel: "マイク入力デバイス (🎤)",
    audioOutputLabel: "スピーカー出力デバイス (🔊)",
    loginTitle: "乗務員登録 ＆ 職種認証ログイン",
    namePlaceholder: "乗務員名を入力してください",
    codePlaceholder: "特務認証コード入力 (8桁)",
    driver: "運転士",
    signal: "信号係",
    dispatcher: "運転指令員",
    btnLogin: "乗務開始",
    driverPanelTitle: "🚊 運転台列車無線 チャンネル設定",
    driverInputHelp: "テンキーでch番号を入力し、下のボタンで個別に開通させます（定員10名）",
    signalPanelTitle: "🚨 信号所VC 独立受令選択",
    dispPanelTitle: "無線通信・社員配置モニター盤",
    btnClearAuth: "⚠️ 全設定クリア（ログアウト）"
  }
};

const signalStationsPage1 = ["館浜", "駒野", "津崎", "浜園", "新野崎", "江ノ原検車区"];
const signalStationsPage2 = ["大道寺", "藤江", "水越", "高見沢", "日野森", "西赤山", "赤山町"];

function App() {
  const [lang, setLang] = useState('ja');
  const [theme, setTheme] = useState(() => localStorage.getItem('tatehama_theme') || 'dark');
  const t = languages[lang];

  // ログイン・認証
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState(() => localStorage.getItem('tatehama_crew_name') || '');
  const [authCode, setAuthCode] = useState(() => localStorage.getItem('tatehama_auth_code') || ''); 
  const [selectedRole, setSelectedRole] = useState('driver'); 
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false); 

  // エラー/成功メッセージ
  const [nameError, setNameError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // 各チャンネルの開通フラグ・ラベル
  const [isCh1Active, setIsCh1Active] = useState(false);
  const [isCh2Active, setIsCh2Active] = useState(false);
  const [isCh3Active, setIsCh3Active] = useState(false);

  const [ch1Label, setCh1Label] = useState('---');
  const [ch2Label, setCh2Label] = useState('---');
  const [ch3Label, setCh3Label] = useState('---');

  const [inputFreq, setInputFreq] = useState('1');
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });

  // 👥 各無線ごとのリアルタイム人数
  const [globalTotalCount, setGlobalTotalCount] = useState(0); 
  const [countCh1, setCountCh1] = useState(0);
  const [countCh2, setCountCh2] = useState(0);
  const [countCh3, setCountCh3] = useState(0);

  // 定員設定
  const limitCh2 = "制限なし"; 
  const [limitCh1, setLimitCh1] = useState(10); 
  const [limitCh3, setLimitCh3] = useState(10); 

  const [signalPage, setSignalPage] = useState(1);
  const [monitorData, setMonitorData] = useState([]);

  // 🔊 受話ミュート
  const [muteCh1, setMuteCh1] = useState(false);
  const [muteCh2, setMuteCh2] = useState(false);
  const [muteCh3, setMuteCh3] = useState(false);

  // 🎤 PTT送信状態
  const [isTalkingCh1, setIsTalkingCh1] = useState(false);
  const [isTalkingCh2, setIsTalkingCh2] = useState(false);
  const [isTalkingCh3, setIsTalkingCh3] = useState(false);

  // ⌨️ キーバインド
  const [pttKeyCh1, setPttKeyCh1] = useState('Space');
  const [pttKeyCh2, setPttKeyCh2] = useState('KeyV');
  const [pttKeyCh3, setPttKeyCh3] = useState('KeyB');
  
  const [activeCaptureCh, setActiveCaptureCh] = useState(null); 
  const [showSettings, setShowSettings] = useState(false);
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedInput, setSelectedInput] = useState('');
  const [selectedOutput, setSelectedOutput] = useState('');

  const [isTyping, setIsTyping] = useState(false);

  // 指令緊急通告
  const [dispatchTarget, setDispatchTarget] = useState('');
  const [dispatchMessage, setDispatchMessage] = useState('');
  const [receivedNotice, setReceivedNotice] = useState(null);
  const audioIntervalRef = useRef(null);

  // 全体接続ステート
  const isConnected = isCh1Active || isCh2Active || isCh3Active;

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

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => {
        navigator.mediaDevices.enumerateDevices().then(devices => {
          const inputs = devices.filter(d => d.kind === 'audioinput');
          const outputs = devices.filter(d => d.kind === 'audiooutput');
          setAudioInputs(inputs);
          setAudioOutputs(outputs);
          if (inputs.length > 0) setSelectedInput(inputs[0].deviceId);
          if (outputs.length > 0) setSelectedOutput(outputs[0].deviceId);
        });
      })
      .catch(err => console.error("デバイス取得失敗:", err));
  }, []);

  useEffect(() => {
    socket.on('room-count-update', (data) => {
      if (typeof data === 'object' && data !== null) {
        setGlobalTotalCount(data.total || 0);
        setCountCh1(isCh1Active ? (data.ch1 || 1) : 0);
        setCountCh2(isCh2Active ? (data.ch2 || 1) : 0);
        setCountCh3(isCh3Active ? (data.ch3 || 1) : 0);
      } else {
        setGlobalTotalCount(data || 0);
        setCountCh1(isCh1Active ? 1 : 0);
        setCountCh2(isCh2Active ? 1 : 0);
        setCountCh3(isCh3Active ? 1 : 0);
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
  }, [userName, isCh1Active, isCh2Active, isCh3Active]);

  // キーボード PTT制御
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (activeCaptureCh !== null) {
        e.preventDefault();
        if (activeCaptureCh === 1) setPttKeyCh1(e.code);
        if (activeCaptureCh === 2) setPttKeyCh2(e.code);
        if (activeCaptureCh === 3) setPttKeyCh3(e.code);
        setActiveCaptureCh(null);
        return;
      }

      if (isTyping) return;
      if (e.code === 'Space') { e.preventDefault(); }

      if (isLoggedIn && !showSettings) {
        if (e.code === pttKeyCh1 && isCh1Active) { e.preventDefault(); setIsTalkingCh1(true); }
        if (e.code === pttKeyCh2 && isCh2Active) { e.preventDefault(); setIsTalkingCh2(true); }
        if (e.code === pttKeyCh3 && isCh3Active && selectedRole !== 'driver') { e.preventDefault(); setIsTalkingCh3(true); }
      }
    };

    const handleKeyUp = (e) => {
      if (isTyping) return;
      if (isLoggedIn && !showSettings) {
        if (e.code === pttKeyCh1) { e.preventDefault(); setIsTalkingCh1(false); }
        if (e.code === pttKeyCh2) { e.preventDefault(); setIsTalkingCh2(false); }
        if (e.code === pttKeyCh3) { e.preventDefault(); setIsTalkingCh3(false); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLoggedIn, pttKeyCh1, pttKeyCh2, pttKeyCh3, activeCaptureCh, showSettings, isTyping, selectedRole, isCh1Active, isCh2Active, isCh3Active]);

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

  const handleClearAllStorage = () => {
    handleDisconnectAll(); stopEmergencyBeep(); setReceivedNotice(null);
    localStorage.clear(); setUserName(''); setAuthCode(''); setIsAdminUnlocked(false);
    setSelectedRole('driver'); setIsLoggedIn(false); setTheme('dark'); setIsTyping(false);
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
    setIsCh1Active(true);
    setCodeError('');
  };

  const connectChannel2 = () => {
    socket.emit('join-frequency', { frequency: '111.000', displayLabel: '全線列車共通受令波' });
    setCh2Label("111.000 MHz (列車共通波)");
    setIsCh2Active(true);
    setCodeError('');
  };

  const connectChannel3 = () => {
    if (selectedRole === 'driver') return; 
    if (countCh3 >= limitCh3) {
      setCodeError(`❌ 無線③は満員（${limitCh3}名）です。`); return;
    }
    socket.emit('join-frequency', { frequency: '111.900', displayLabel: '信号指令連絡波' });
    setCh3Label("111.900 MHz (信号指令連絡波)");
    setIsCh3Active(true);
    setCodeError('');
  };

  const handleSignalStationConnect = (stationName) => {
    if (countCh1 >= limitCh1) {
      setCodeError(`❌ ${stationName}駅VCは満員（${limitCh1}名）です。`); return;
    }
    const freqCode = `sig_${stationName}`;
    socket.emit('join-frequency', { frequency: freqCode, displayLabel: `信号:${stationName}` });
    setCh1Label(`信号所内連絡VC [${stationName}駅]`);
    setIsCh1Active(true);
    setCodeError('');
  };

  const handleDisconnectAll = () => {
    socket.emit('leave-frequency');
    setIsCh1Active(false); setIsCh2Active(false); setIsCh3Active(false);
    setIsTalkingCh1(false); setIsTalkingCh2(false); setIsTalkingCh3(false);
    setCh1Label('---'); setCh2Label('---'); setCh3Label('---');
    setCountCh1(0); setCountCh2(0); setCountCh3(0);
  };

  const handleDisconnectRightClick = (e) => {
    e.preventDefault();
    setContextMenu({ show: true, x: e.clientX, y: e.clientY });
  };

  const handleDisconnectSpecificChannel = (chNum) => {
    if (chNum === 1) { setIsCh1Active(false); setCh1Label('---'); setCountCh1(0); setIsTalkingCh1(false); }
    if (chNum === 2) { setIsCh2Active(false); setCh2Label('---'); setCountCh2(0); setIsTalkingCh2(false); }
    if (chNum === 3) { setIsCh3Active(false); setCh3Label('---'); setCountCh3(0); setIsTalkingCh3(false); }
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

  if (!isLoggedIn) {
    return (
      <div className={`app-container theme-${theme} login-screen-page-wrapper`}>
        <div style={{position: 'absolute', top: '20px', right: '30px', zIndex: 10}}>
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>⚙️ {t.settings}</button>
        </div>
        {showSettings && (
          <div className="settings-overlay">
            <div className="settings-box">
              <h3>⚙️ {t.settings}</h3>
              <select value={theme} onChange={(e) => setTheme(e.target.value)} className="lang-select">
                <option value="dark">{t.themeDark}</option>
                <option value="light">{t.themeLight}</option>
              </select>
              <hr /><button className="btn-close" onClick={() => setShowSettings(false)}>X</button>
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

  return (
    <div className={`app-container theme-${theme}`}>
      <header className="app-header">
        <h1>{t.title} <span className="version-badge-tag">{APP_VERSION}</span></h1>
        <div className="header-controls">
          <button className="icon-btn home-btn" type="button" onClick={handleGoHome}>{t.home}</button>
          <button className="icon-btn" type="button" onClick={() => setShowSettings(!showSettings)}>⚙️ {t.settings}</button>
        </div>
      </header>

      {contextMenu.show && (
        <div className="custom-disconnect-context-menu" style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}>
          <div className="menu-header-title">独立回線切断選択 (右クリックメニュー)</div>
          {isCh1Active && <button type="button" className="menu-item-btn item-ch1" onClick={() => handleDisconnectSpecificChannel(1)}>無線① を切断</button>}
          {isCh2Active && <button type="button" className="menu-item-btn item-ch2" onClick={() => handleDisconnectSpecificChannel(2)}>無線② を切断</button>}
          {isCh3Active && tyrannyRole !== 'driver' && <button type="button" className="menu-item-btn item-ch3" onClick={() => handleDisconnectSpecificChannel(3)}>無線③ を切断</button>}
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
          <div className="radio-display-lcd" style={{gap: '8px', padding: '15px'}}>
            <div className="lcd-line"><span className="lcd-lbl">{t.statusLabel}</span><span className={`lcd-val ${isConnected ? 'on' : 'off'}`}>{isConnected ? "ONLINE (独立受令中)" : t.standby}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.userLabel}</span><span className="lcd-val highlights">{userName}</span></div>
            <div className="lcd-line"><span className="lcd-lbl">{t.roleLabel}</span><span className="lcd-val role-name-color-lcd">{getRoleText(selectedRole)}</span></div>
            
            {/* 無線① */}
            <div>
              <div className="lcd-line" style={{border: 'none'}}>
                <span className="lcd-lbl">📡 無線① [MAIN]:</span>
                <span className="lcd-channel-members-tag" style={{color: countCh1 >= limitCh1 ? '#ff7b72' : '#58a6ff'}}>
                  👥 {isCh1Active ? `${countCh1} / ${limitCh1}名` : `0 / ${limitCh1}名`}
                </span>
              </div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val val-mainch" style={{fontSize: '15px', color: !isCh1Active ? '#555' : muteCh1 ? '#768390' : '#39d353'}}>{!isCh1Active ? "--- (未接続)" : muteCh1 ? "--- (MUTE)" : ch1Label}</span>
                <button type="button" disabled={!isCh1Active} onClick={() => setMuteCh1(!muteCh1)} className="lcd-mute-sub-btn">{muteCh1 ? "🔇" : "🔊"}</button>
              </div>
            </div>

            {/* 無線② */}
            <div style={{borderTop: '1px dashed #30363d', paddingTop: '5px'}}>
              <div className="lcd-line" style={{border: 'none'}}>
                <span className="lcd-lbl" style={{color: '#ff9800'}}>📻 無線② [共通通報波]:</span>
                <span className="lcd-channel-members-tag" style={{color: '#8b949e'}}>👥 {isCh2Active ? `${countCh2} / ${limitCh2}` : `0 / ${limitCh2}`}</span>
              </div>
              <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                <span className="lcd-val" style={{fontSize: '14px', color: !isCh2Active ? '#555' : muteCh2 ? '#768390' : '#ffb74d'}}>{!isCh2Active ? "--- (未接続)" : muteCh2 ? "--- (MUTE)" : ch2Label}</span>
                <button type="button" disabled={!isCh2Active} onClick={() => setMuteCh2(!muteCh2)} className="lcd-mute-sub-btn">{muteCh2 ? "🔇" : "🔊"}</button>
              </div>
            </div>

            {/* 無線③ */}
            {selectedRole !== 'driver' ? (
              <div style={{borderTop: '1px dashed #30363d', paddingTop: '5px'}}>
                <div className="lcd-line" style={{border: 'none'}}>
                  <span className="lcd-lbl" style={{color: '#00d2ff'}}>📡 無線③ [信号指令連絡]:</span>
                  <span className="lcd-channel-members-tag" style={{color: countCh3 >= limitCh3 ? '#ff7b72' : '#58a6ff'}}>👥 {isCh3Active ? `${countCh3} / ${limitCh3}名` : `0 / ${limitCh3}名`}</span>
                </div>
                <div className="lcd-line" style={{border: 'none', alignItems: 'center'}}>
                  <span className="lcd-val" style={{fontSize: '14px', color: !isCh3Active ? '#555' : muteCh3 ? '#768390' : '#88d8ff'}}>{!isCh3Active ? "--- (未接続)" : muteCh3 ? "--- (MUTE)" : ch3Label}</span>
                  <button type="button" disabled={!isCh3Active} onClick={() => setMuteCh3(!muteCh3)} className="lcd-mute-sub-btn">{muteCh3 ? "🔇" : "🔊"}</button>
                </div>
              </div>
            ) : (
              <div style={{borderTop: '1px dashed #30363d', paddingTop: '5px', color: '#6e7681', fontSize: '11px', textAlign: 'center'}}>🔒 無線③ 運転士制限対象波</div>
            )}

            <div className="lcd-line" style={{borderTop: '2px solid #30363d', paddingTop: '5px'}}><span className="lcd-lbl">{t.membersLabel}</span><span className="lcd-val green-lcd-text">{isConnected ? `${globalTotalCount} 名` : '---'}</span></div>
          </div>

          <div className="in-call-controls" style={{marginTop: '10px'}}>
            <button onClick={handleDisconnectAll} onContextMenu={handleDisconnectRightClick} className="btn-cockpit danger" type="button" style={{cursor: 'context-menu', opacity: isConnected ? 1 : 0.6}}>
              {t.btnDisconnect}
            </button>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px'}}>
              <button 
                className={`ptt-hardware-button ptt-hardware-ch1 ${isTalkingCh1 ? 'active' : ''} ${!isCh1Active ? 'disabled-lock' : ''}`} 
                type="button" 
                onMouseDown={() => isCh1Active && setIsTalkingCh1(true)} 
                onMouseUp={() => setIsTalkingCh1(false)}
              >
                {isTalkingCh1 ? "✦ ① 本線波 送話中 ✦" : `① 列車本線送信 [${pttKeyCh1}] ${!isCh1Active ? '(未入線)' : ''}`}
              </button>

              <button 
                className={`ptt-hardware-button ptt-hardware-ch2 ${isTalkingCh2 ? 'active' : ''} ${!isCh2Active ? 'disabled-lock' : ''}`} 
                type="button" 
                onMouseDown={() => isCh2Active && setIsTalkingCh2(true)} 
                onMouseUp={() => setIsTalkingCh2(false)}
              >
                {isTalkingCh2 ? "✦ ② 共通波 送話中 ✦" : `② 共通波送信 [${pttKeyCh2}] ${!isCh2Active ? '(未入線)' : ''}`}
              </button>

              {selectedRole !== 'driver' && (
                <button 
                  className={`ptt-hardware-button ptt-hardware-ch3 ${isTalkingCh3 ? 'active' : ''} ${!isCh3Active ? 'disabled-lock' : ''}`} 
                  type="button" 
                  onMouseDown={() => isCh3Active && setIsTalkingCh3(true)} 
                  onMouseUp={() => setIsTalkingCh3(false)}
                >
                  {isTalkingCh3 ? "✦ ③ 連絡波 送話中 ✦" : `③ 連絡線送信 [${pttKeyCh3}] ${!isCh3Active ? '(未入線)' : ''}`}
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
                  <button type="button" className="btn-action-primary" style={{background: isCh1Active ? '#2c3e50' : '#1f618d'}} onClick={connectChannel1}>
                    {isCh1Active ? "①本線 ch更新入線" : "①本線 ch開通"}
                  </button>
                  <button type="button" className="btn-action-primary" style={{background: isCh2Active ? '#2c3e50' : '#d35400'}} onClick={connectChannel2}>
                    {isCh2Active ? "②共通波 接続中" : "②共通波 開通"}
                  </button>
                </div>
              </div>
            )}

            {/* 信号係 */}
            {selectedRole === 'signal' && (
              <div className="sub-panel-card">
                <h3>{t.signalPanelTitle} (Page {signalPage}/2)</h3>
                <div className="signal-buttons-grid">
                  {(signalPage === 1 ? signalStationsPage1 : signalStationsPage2).map(st => (
                    <button key={st} className="btn-station-select" type="button" style={{background: isCh1Active ? '#2c3e50' : ''}} onClick={() => handleSignalStationConnect(st)}>🚉 {st}駅VC開通</button>
                  ))}
                </div>
                <div className="pager-nav-bar" style={{margin:'5px 0'}}><button type="button" onClick={() => setSignalPage(1)}>P1</button><button type="button" onClick={() => setSignalPage(2)}>P2</button></div>
                
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px'}}>
                  <button type="button" className="btn-action-primary" style={{background: isCh2Active ? '#2c3e50' : '#d35400'}} onClick={connectChannel2}>②共通波 開通</button>
                  <button type="button" className="btn-action-primary" style={{background: isCh3Active ? '#2c3e50' : '#2980b9'}} onClick={connectChannel3}>③連絡波 開通</button>
                </div>
              </div>
            )}

            {/* 💡 運転指令員：中国語を完全に排除した日本国内版 */}
            {selectedRole === 'dispatcher' && (
              <div className="sub-panel-card">
                <h3>📞 指令独立回線割当盤</h3>
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px'}}>
                  <button type="button" className="btn-action-primary" style={{fontSize:'12px', background: isCh1Active ? '#2c3e50' : '#27ae60'}} onClick={connectChannel1}>①本線({inputFreq}ch)</button>
                  <button type="button" className="btn-action-primary" style={{fontSize:'12px', background: isCh2Active ? '#2c3e50' : '#d35400'}} onClick={connectChannel2}>②共通波リンク</button>
                  <button type="button" className="btn-action-primary" style={{fontSize:'12px', background: isCh3Active ? '#2c3e50' : '#2980b9'}} onClick={connectChannel3}>③連絡波開通</button>
                </div>
                <div style={{marginTop:'10px'}}>
                  <input type="text" className="freq-digit-input" value={inputFreq} readOnly style={{fontSize:'16px', padding:'4px'} /* image_e3a8db.png 基準 */} />
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
                <input type="text" style={{width: '100%', padding: '6px', background: '#010409', color: '#fff', border: '1px solid #30363d'}} value={dispatchTarget} onChange={(e) => setDispatchTarget(e.target.value)} placeholder="送信先" />
                <textarea style={{width: '100%', height: '40px', marginTop:'5px', background: '#010409', color: '#fff', border: '1px solid #30363d'}} value={dispatchMessage} onChange={(e) => setDispatchMessage(e.target.value)} placeholder="通告内容" />
                <button className="btn-action-primary" style={{marginTop: '5px', background: '#da5b0b'}} type="button" onClick={handleSendNotice}>⚡ 通告一斉送信 ⚡</button>
              </div>
            )}

            {/* モニター */}
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
    </div>
  );
}

export default App;