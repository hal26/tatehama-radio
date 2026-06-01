import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// ご自身のRenderのURL、または手元テスト用URL
const socket = io('https://tatehama-radio.onrender.com');

const languages = {
  ja: {
    title: "館浜電鉄",
    statusLabel: "STATUS:",
    standby: "STANDBY (未接続)",
    online: "ONLINE (接続中)",
    freqLabel: "FREQ:",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    roleLabel: "ROLE:",
    tx: "■ TX (送信中)",
    rx: "□ RX (受信待機)",
    inputLabel: "周波数入力 (数字6桁まで)",
    btnConnect: "接続開始",
    btnMuteOn: "マイク消音",
    btnMuteOff: "マイクON",
    btnDisconnect: "回線切断",
    pttReady: "● PTT (長押しで送話)",
    pttActive: "✦ 送話中 (PTT ON) ✦",
    settings: "設定",
    langSelect: "言語選択 (Language)",
    themeSelect: "画面テーマ (Theme)",
    themeDark: "黒ベース (Dark)",
    themeLight: "白ベース (Light)",
    keybindLabel: "PTTキー設定 (キーを押してください)",
    adminPanelTitle: "⚠️ 管理者指令コンソール",
    kickBtn: "強制切断",
    muteBtn: "強制消音",
    blockBtn: "アクセスブロック",
    loginTitle: "職種を選択して乗務開始",
    driver: "運転士",
    signal: "信号",
    dispatcher: "司令 (管理者)",
    btnLogin: "ログイン"
  },
  en: {
    title: "Tatehama Railway",
    statusLabel: "STATUS:",
    standby: "STANDBY (DISCONNECTED)",
    online: "ONLINE (CONNECTED)",
    freqLabel: "FREQ:",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    roleLabel: "ROLE:",
    tx: "■ TX (TRANSMITTING)",
    rx: "□ RX (LISTENING)",
    inputLabel: "Frequency (Up to 6 digits)",
    btnConnect: "CONNECT",
    btnMuteOn: "MUTE MIC",
    btnMuteOff: "UNMUTE MIC",
    btnDisconnect: "DISCONNECT",
    pttReady: "● PUSH TO TALK (PTT)",
    pttActive: "✦ TRANSMITTING (PTT ON) ✦",
    settings: "Settings",
    langSelect: "Language Select",
    themeSelect: "Screen Theme",
    themeDark: "Dark Base",
    themeLight: "Light Base",
    keybindLabel: "PTT Keybind (Press any key)",
    adminPanelTitle: "⚠️ Admin Command Console",
    kickBtn: "FORCE KICK",
    muteBtn: "FORCE MUTE",
    blockBtn: "BLOCK USER",
    loginTitle: "Select your role to login",
    driver: "Driver",
    signal: "Signalman",
    dispatcher: "Dispatcher (Admin)",
    btnLogin: "LOGIN"
  }
};

function App() {
  const [lang, setLang] = useState('ja');
  const [theme, setTheme] = useState('dark'); // 'dark' または 'light'
  const t = languages[lang];

  // ログイン・職種管理
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedRole, setSelectedRole] = useState('driver'); // driver, signal, dispatcher
  const [isAdmin, setIsAdmin] = useState(false);

  // 無線状態管理
  const [frequency, setFrequency] = useState('123450');
  const [displayFreq, setDisplayFreq] = useState('123.450 MHz');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  // ⚙️設定関連
  const [showSettings, setShowSettings] = useState(false);
  const [pttKey, setPttKey] = useState('Space'); // デフォルトはスペースキー
  const [isListeningKey, setIsListeningKey] = useState(false); // キーバインド収集中フラグ

  // 通常イベントの監視（人数更新）
  useEffect(() => {
    socket.on('room-count-update', (count) => {
      setConnectedCount(count);
    });
    return () => socket.off('room-count-update');
  }, []);

  // 管理者遠隔指令の監視
  useEffect(() => {
    socket.on('admin-force-disconnect', () => {
      handleDisconnect();
      alert(lang === 'ja' ? "⚠️ 指令権限により回線が強制切断されました。" : "⚠️ Line disconnected by administrator command.");
    });

    socket.on('admin-force-mute', () => {
      setIsMuted(true);
      alert(lang === 'ja' ? "⚠️ 指令権限によりマイクが強制消音されました。" : "⚠️ Microphone muted by administrator command.");
    });

    return () => {
      socket.off('admin-force-disconnect');
      socket.off('admin-force-mute');
    };
  }, [frequency, lang]);

  // 🎹 PTT キーバインドのリスナー設定
  useEffect(() => {
    const handleKeyDown = (e) => {
      // キー設定変更中の場合は、入力されたキーを登録して終了
      if (isListeningKey) {
        e.preventDefault();
        setPttKey(e.code);
        setIsListeningKey(false);
        return;
      }

      // ログイン済み＆無線接続済み＆設定中じゃない場合、登録されたキーで送話ON
      if (isLoggedIn && isConnected && !showSettings) {
        const targetCode = pttKey === 'Space' ? 'Space' : pttKey;
        if (e.code === targetCode) {
          e.preventDefault();
          setIsTalking(true);
        }
      }
    };

    const handleKeyUp = (e) => {
      if (isLoggedIn && isConnected && !showSettings) {
        const targetCode = pttKey === 'Space' ? 'Space' : pttKey;
        if (e.code === targetCode) {
          e.preventDefault();
          setIsTalking(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isLoggedIn, isConnected, pttKey, isListeningKey, showSettings]);

  // 職種ログイン処理
  const handleLoginSubmit = () => {
    setIsLoggedIn(true);
    // 「司令」を選んだ場合のみ、自動的に管理者権限（Admin）をONにする
    if (selectedRole === 'dispatcher') {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  };

  // 周波数入力制限
  const handleFreqChange = (e) => {
    let value = e.target.value.replace(/[^0-9.]/g, '');
    if (value.replace(/\./g, '').length > 6) return;
    setFrequency(value);
  };

  // 周波数接続
  const handleConnect = () => {
    if (!frequency) return;
    let cleanedFreq = frequency.replace(/\./g, '');
    if (cleanedFreq.length === 0) return;

    let formattedDisplay = "";
    if (cleanedFreq.length > 3) {
      formattedDisplay = `${cleanedFreq.slice(0, 3)}.${cleanedFreq.slice(3)} MHz`;
    } else {
      formattedDisplay = `${cleanedFreq} MHz`;
    }
    setDisplayFreq(formattedDisplay);

    socket.emit('join-frequency', cleanedFreq);
    setIsConnected(true);
  };

  // 切断
  const handleDisconnect = () => {
    setIsConnected(false);
    setIsTalking(false);
    setConnectedCount(0);
  };

  const adminAction = (actionType) => {
    const cleanedFreq = frequency.replace(/\./g, '');
    socket.emit('admin-command', { action: actionType, freq: cleanedFreq });
  };

  // ロール名の日本語・英語表記変換
  const getRoleName = () => {
    if (selectedRole === 'driver') return t.driver;
    if (selectedRole === 'signal') return t.signal;
    return t.dispatcher;
  };

  // アプリ全体の白黒テーマ判定クラス名
  const themeClass = theme === 'light' ? 'theme-light' : 'theme-dark';

  // --- ログイン前画面 ---
  if (!isLoggedIn) {
    return (
      <div className={`app-container ${themeClass} login-screen`}>
        <header className="app-header">
          <h1>{t.title}</h1>
        </header>
        <div className="login-box">
          <h2>{t.loginTitle}</h2>
          <div className="role-options">
            <label className={`role-radio ${selectedRole === 'driver' ? 'active' : ''}`}>
              <input type="radio" name="role" value="driver" checked={selectedRole === 'driver'} onChange={() => setSelectedRole('driver')} />
              <span>🚊 {t.driver}</span>
            </label>
            <label className={`role-radio ${selectedRole === 'signal' ? 'active' : ''}`}>
              <input type="radio" name="role" value="signal" checked={selectedRole === 'signal'} onChange={() => setSelectedRole('signal')} />
              <span>🚨 {t.signal}</span>
            </label>
            <label className={`role-radio ${selectedRole === 'dispatcher' ? 'active' : ''}`}>
              <input type="radio" name="role" value="dispatcher" checked={selectedRole === 'dispatcher'} onChange={() => setSelectedRole('dispatcher')} />
              <span>📞 {t.dispatcher}</span>
            </label>
          </div>
          <button onClick={handleLoginSubmit} className="btn-connect" style={{ marginTop: '30px' }}>{t.btnLogin}</button>
        </div>
      </div>
    );
  }

  // --- ログイン後（メイン無線機画面） ---
  return (
    <div className={`app-container ${themeClass}`}>
      <header className="app-header">
        <h1>{t.title}</h1>
        <div className="header-controls">
          <button className="icon-btn" onClick={() => setShowSettings(!showSettings)}>⚙️ {t.settings}</button>
        </div>
      </header>
      
      {/* ⚙️ 設定（オーバーレイ）画面 */}
      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-box">
            <h3>⚙️ {t.settings}</h3>
            <hr />
            
            {/* 言語設定 */}
            <label>{t.langSelect}</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="lang-select">
              <option value="ja">日本語 (Japanese)</option>
              <option value="en">English</option>
            </select>
            
            {/* 白黒反転設定 */}
            <label>{t.themeSelect}</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="lang-select">
              <option value="dark">{t.themeDark}</option>
              <option value="light">{t.themeLight}</option>
            </select>
            
            {/* PTTキーバインド設定 */}
            <label>{t.keybindLabel}</label>
            <button 
              className={`btn-keybind-capture ${isListeningKey ? 'capturing' : ''}`}
              onClick={() => setIsListeningKey(true)}
            >
              {isListeningKey ? "Press any key..." : pttKey}
            </button>
            
            <hr />
            <button className="btn-close" onClick={() => { setShowSettings(false); setIsListeningKey(false); }}>X</button>
          </div>
        </div>
      )}

      {/* 🟢 液晶風無線ディスプレイ */}
      <div className="radio-display">
        <div className="display-row">
          <span className="disp-label">{t.statusLabel}</span>
          <span className={`disp-value ${isConnected ? 'status-on' : 'status-off'}`}>
            {isConnected ? t.online : t.standby}
          </span>
        </div>
        <div className="display-row">
          <span className="disp-label">{t.roleLabel}</span>
          <span className="disp-value" style={{ color: '#00ccff', fontWeight: 'bold' }}>{getRoleName()}</span>
        </div>
        <div className="display-row main-freq">
          <span className="disp-label">{t.freqLabel}</span>
          <span className="disp-freq-val">
            {isConnected ? displayFreq : "---.--- MHz"}
          </span>
        </div>
        <div className="display-row">
          <span className="disp-label">{t.membersLabel}</span>
          <span className="disp-value" style={{ color: '#33ff66' }}>
            {isConnected ? `${connectedCount} 名` : "---"}
          </span>
        </div>
        <div className="display-row">
          <span className="disp-label">{t.signalLabel}</span>
          <span className="disp-value">
            {isTalking ? t.tx : isConnected ? t.rx : "---"}
          </span>
        </div>
      </div>

      {/* 🚨 管理者専用コンソール（「司令」ログイン時のみ出現） */}
      {isAdmin && (
        <div className="admin-panel">
          <h4>{t.adminPanelTitle}</h4>
          <div className="admin-actions">
            <button className="btn-admin-act kick" onClick={() => adminAction('KICK')}>{t.kickBtn}</button>
            <button className="btn-admin-act mute" onClick={() => adminAction('MUTE')}>{t.muteBtn}</button>
            <button className="btn-admin-act ban" onClick={() => adminAction('BLOCK')}>{t.blockBtn}</button>
          </div>
        </div>
      )}

      {/* 🎛️ 通常操作パネル */}
      {!isConnected ? (
        <div className="setup-panel">
          <div className="input-group">
            <label>{t.inputLabel}</label>
            <input 
              type="text" 
              value={frequency} 
              onChange={handleFreqChange}
              placeholder="123456"
            />
          </div>
          <button onClick={handleConnect} className="btn-connect">{t.btnConnect}</button>
        </div>
      ) : (
        <div className="operation-panel">
          <div className="control-row">
            <button onClick={() => setIsMuted(!isMuted)} className={`btn-action ${isMuted ? 'muted' : ''}`}>
              {isMuted ? t.btnMuteOff : t.btnMuteOn}
            </button>
            <button onClick={handleDisconnect} className="btn-danger">{t.btnDisconnect}</button>
          </div>
          <div className="ptt-area">
            <button 
              className={`ptt-button ${isTalking ? 'active' : ''}`}
              onMouseDown={() => setIsTalking(true)}
              onMouseUp={() => setIsTalking(false)}
              onMouseLeave={() => setIsTalking(false)}
            >
              {isTalking ? t.pttActive : `${t.pttReady} [${pttKey}]`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;