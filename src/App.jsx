import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

// サーバーへの接続
const socket = io('http://localhost:3000');

function App() {
  const [frequency, setFrequency] = useState('123.450');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [connectedCount, setConnectedCount] = useState(0);

  useEffect(() => {
    socket.on('room-count-update', (count) => {
      setConnectedCount(count);
    });
    return () => socket.off('room-count-update');
  }, []);

  const handleConnect = () => {
    if (!frequency) return;
    socket.emit('join-frequency', frequency);
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setIsTalking(false);
    setConnectedCount(0);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>館浜電鉄無線交信部</h1>
        <span className="app-sub">Radio VC SYSTEM v1.0</span>
      </header>
      
      <div className="radio-display">
        <div className="display-row">
          <span className="disp-label">STATUS:</span>
          <span className={`disp-value ${isConnected ? 'status-on' : 'status-off'}`}>
            {isConnected ? "ONLINE (接続中)" : "STANDBY (未接続)"}
          </span>
        </div>
        <div className="display-row main-freq">
          <span className="disp-label">FREQ:</span>
          <span className="disp-freq-val">
            {isConnected ? `${frequency} MHz` : "---.--- MHz"}
          </span>
        </div>
        <div className="display-row">
          <span className="disp-label">MEMBERS:</span>
          <span className="disp-value" style={{ color: '#33ff66' }}>
            {isConnected ? `${connectedCount} 名` : "---"}
          </span>
        </div>
        <div className="display-row">
          <span className="disp-label">SIGNAL:</span>
          <span className="disp-value">
            {isTalking ? "■ TX (送信中)" : isConnected ? "□ RX (受信待機)" : "---"}
          </span>
        </div>
      </div>

      {!isConnected ? (
        <div className="setup-panel">
          <div className="input-group">
            <label>周波数入力</label>
            <input 
              type="text" 
              value={frequency} 
              onChange={(e) => setFrequency(e.target.value)}
            />
          </div>
          <button onClick={handleConnect} className="btn-connect">接続開始</button>
        </div>
      ) : (
        <div className="operation-panel">
          <div className="control-row">
            <button onClick={() => setIsMuted(!isMuted)} className={`btn-action ${isMuted ? 'muted' : ''}`}>
              {isMuted ? "マイクON" : "マイク消音"}
            </button>
            <button onClick={handleDisconnect} className="btn-danger">回線切断</button>
          </div>
          <div className="ptt-area">
            <button 
              className={`ptt-button ${isTalking ? 'active' : ''}`}
              onMouseDown={() => setIsTalking(true)}
              onMouseUp={() => setIsTalking(false)}
              onMouseLeave={() => setIsTalking(false)}
            >
              {isTalking ? "✦ 送話中 (PTT ON) ✦" : "● 押しながら送話 (PTT)"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;