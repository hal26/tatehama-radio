import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// ⚠️ ご自身のRenderのURL（左上に表示されている「https://〜.onrender.com」）に書き換えてください
// ※末尾に :3000 は付けないでそのまま貼り付けます
const socket = io('https://tatehama-radio.onrender.com');

// 日本語・英語のテキストデータ辞書
const languages = {
  ja: {
    title: "館浜電鉄無線交信部",
    statusLabel: "STATUS:",
    standby: "STANDBY (未接続)",
    online: "ONLINE (接続中)",
    freqLabel: "FREQ:",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    tx: "■ TX (送信中)",
    rx: "□ RX (受信待機)",
    inputLabel: "周波数入力",
    btnConnect: "接続開始",
    btnMuteOn: "マイク消音",
    btnMuteOff: "マイクON",
    btnDisconnect: "回線切断",
    pttReady: "● 押しながら送話 (PTT)",
    pttActive: "✦ 送話中 (PTT ON) ✦",
    settings: "設定",
    adminBtn: "管理者",
    langSelect: "言語選択 (Language)",
    adminPassLabel: "管理者パスワード入力",
    adminPanelTitle: "⚠️ 管理者指令コンソール",
    kickBtn: "強制切断",
    muteBtn: "強制消音",
    blockBtn: "アクセスブロック"
  },
  en: {
    title: "Tatehama Radio VC Station",
    statusLabel: "STATUS:",
    standby: "STANDBY (DISCONNECTED)",
    online: "ONLINE (CONNECTED)",
    freqLabel: "FREQ:",
    membersLabel: "MEMBERS:",
    signalLabel: "SIGNAL:",
    tx: "■ TX (TRANSMITTING)",
    rx: "□ RX (LISTENING)",
    inputLabel: "Frequency Input",
    btnConnect: "CONNECT",
    btnMuteOn: "MUTE MIC",
    btnMuteOff: "UNMUTE MIC",
    btnDisconnect: "DISCONNECT",
    pttReady: "● PUSH TO TALK (PTT)",
    pttActive: "✦ TRANSMITTING (PTT ON) ✦",
    settings: "Settings",
    adminBtn: "Admin",
    langSelect: "Language Select",
    adminPassLabel: "Enter Admin Password",
    adminPanelTitle: "⚠️ Admin Command Console",
    kickBtn: "FORCE KICK",
    muteBtn: "FORCE MUTE",
    blockBtn: "BLOCK USER"
  }
};

function App() {
  const [lang, setLang] = useState('ja'); // 'ja' または 'en'
  const t = languages[lang]; // 選択中の言語テキスト

  const [frequency, setFrequency] = useState('123.450');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  // 設定画面・Admin画面の表示管理
  const [showSettings, setShowSettings] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  // 1. サーバーからの通常イベントの監視（人数更新）
  useEffect(() => {
    socket.on('room-count-update', (count) => {
      setConnectedCount(count);
    });
    return () => socket.off('room-count-update');
  }, []);

  // 2. サーバーからの【管理者命令（遠隔操作）】の監視
  useEffect(() => {
    // 遠隔強制切断の命令が届いた時
    socket.on('admin-force-disconnect', () => {
      handleDisconnect();
      alert(lang === 'ja' ? "⚠️ 指令権限により回線が強制切断されました。" : "⚠️ Line disconnected by administrator command.");
    });

    // 遠隔強制ミュートの命令が届いた時
    socket.on('admin-force-mute', () => {
      setIsMuted(true);
      alert(lang === 'ja' ? "⚠️ 指令権限によりマイクが強制消音されました。" : "⚠️ Microphone muted by administrator command.");
    });

    return () => {
      socket.off('admin-force-disconnect');
      socket.off('admin-force-mute');
    };
  }, [frequency, lang]);

  // 周波数接続処理
  const handleConnect = () => {
    if (!frequency) return;
    socket.emit('join-frequency', frequency);
    setIsConnected(true);
  };

  // 切断処理
  const handleDisconnect = () => {
    setIsConnected(false);
    setIsTalking(false);
    setConnectedCount(0);
  };

  // 管理者ログイン判定（パスワード: tatehama）
  const handleAdminLogin = () => {
    if (adminPassword === 'tatehama') {
      setIsAdmin(true);
      alert(lang === 'ja' ? "管理者モードとして認証されました。" : "Authenticated as Administrator Mode.");
    } else {
      alert(lang === 'ja' ? "パスワードが違います。" : "Incorrect password.");
    }
    setAdminPassword('');
  };

  // 管理者コマンドをサーバーへ送信する処理
  const adminAction = (actionType) => {
    // 現在自分が合わせている周波数（ルーム）に対して遠隔コマンドをブロードキャストする
    socket.emit('admin-command', { action: actionType, freq: frequency });
  };

  return (
    <div className="app-container">
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
            <label>{t.langSelect}</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className="lang-select">
              <option value="ja">日本語 (Japanese)</option>
              <option value="en">English</option>
            </select>
            
            <hr />
            
            {/* 管理者ログインエリア */}
            {!isAdmin ? (
              <div className="admin-login-area">
                <label>{t.adminPassLabel}</label>
                <input 
                  type="password" 
                  value={adminPassword} 
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Password..."
                />
                <button onClick={handleAdminLogin} className="btn-admin-submit">{t.adminBtn}</button>
              </div>
            ) : (
              <div className="admin-status">★ Admin Mode Active</div>
            )}
            
            <button className="btn-close" onClick={() => setShowSettings(false)}>X</button>
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
        <div className="display-row main-freq">
          <span className="disp-label">{t.freqLabel}</span>
          <span className="disp-freq-val">
            {isConnected ? `${frequency} MHz` : "---.--- MHz"}
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

      {/* 🚨 管理者専用コンソール（認証された時だけ液晶の下に出現） */}
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

      {/* 🎛️ 通常操作パネル（未接続時と通話時で切り替え） */}
      {!isConnected ? (
        <div className="setup-panel">
          <div className="input-group">
            <label>{t.inputLabel}</label>
            <input 
              type="text" 
              value={frequency} 
              onChange={(e) => setFrequency(e.target.value)}
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
              {isTalking ? t.pttActive : t.pttReady}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;